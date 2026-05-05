import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { suggestions, nodes, edges, operationLogs, sources, sourceNodeLinks } from '@galaxy/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { generateId, nowIso, slugify } from '@galaxy/shared'
import { ensureDb } from '@/lib/api/ensure-db'
import { BatchConfirmSchema } from '@/lib/api/schemas'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = BatchConfirmSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const db = getDb()
  const now = nowIso()
  const { ids, action, decision_note } = parsed.data

  if (action === 'reject') {
    // 记录批量拒绝操作日志
    db.insert(operationLogs)
      .values({
        id: generateId('ol'),
        operation: 'batch_reject',
        affected_ids: JSON.stringify(ids),
        payload_snapshot: JSON.stringify({ ids, action: 'reject' }),
        user_note: `批量拒绝 ${ids.length} 条建议`,
        created_at: now,
      })
      .run()

    db.update(suggestions)
      .set({ status: 'rejected', decided_at: now, decision_note: decision_note ?? null })
      .where(inArray(suggestions.id, ids))
      .run()
    return NextResponse.json({ data: { updated: ids.length, action: 'rejected' } })
  }

  let accepted = 0
  const allCreated: Array<{ type: string; id: string }> = []

  for (const id of ids) {
    const suggestion = db.select().from(suggestions).where(eq(suggestions.id, id)).get()
    if (!suggestion || suggestion.status !== 'pending') continue

    const payloadObj = typeof suggestion.payload === 'string'
      ? JSON.parse(suggestion.payload)
      : suggestion.payload

    if (suggestion.type === 'new_node') {
      // 检查是否已存在同名节点，避免 slug 冲突
      const existing = db.select().from(nodes).where(eq(nodes.title, payloadObj.title)).get()
      let nodeId: string
      if (existing) {
        nodeId = existing.id
      } else {
        nodeId = generateId('n')
        try {
          db.insert(nodes)
            .values({
              id: nodeId,
              title: payloadObj.title,
              slug: slugify(payloadObj.title),
              summary: payloadObj.summary ?? null,
              domain: payloadObj.domain ?? null,
              created_by: 'ai_feed',
              ai_metadata: JSON.stringify({ suggestion_id: id, provider: suggestion.provider_id, model: suggestion.model }),
            })
            .run()
          allCreated.push({ type: 'node', id: nodeId })
        } catch {
          // slug 或其他唯一约束冲突，跳过节点创建
          const fallback = db.select().from(nodes).where(eq(nodes.title, payloadObj.title)).get()
          nodeId = fallback?.id ?? nodeId
        }
      }

      for (const se of payloadObj.suggested_edges ?? []) {
        const target = db.select().from(nodes).where(eq(nodes.title, se.target_node_title)).get()
        if (target && target.id !== nodeId) {
          const edgeId = generateId('e')
          try {
            db.insert(edges).values({
              id: edgeId,
              source_node_id: nodeId,
              target_node_id: target.id,
              relation_type: se.relation_type,
              weight: suggestion.confidence ?? 0.5,
              created_by: 'ai_feed',
            }).run()
            allCreated.push({ type: 'edge', id: edgeId })
          } catch { /* UNIQUE 冲突跳过 */ }
        }
      }

      // 补建 source_node_link 溯源关联
      if (suggestion.source_ref_id) {
        const linkedSource = db.select().from(sources).where(eq(sources.feed_item_id, suggestion.source_ref_id)).get()
        if (linkedSource) {
          try {
            db.insert(sourceNodeLinks).values({
              id: generateId('snl'),
              source_id: linkedSource.id,
              node_id: nodeId,
              excerpt: payloadObj.excerpt ?? null,
              created_at: now,
            }).run()
          } catch { /* UNIQUE 冲突跳过 */ }
        }
      }
    } else if (suggestion.type === 'new_edge') {
      const sourceNode = db.select().from(nodes).where(eq(nodes.title, payloadObj.source_title)).get()
      const targetNode = db.select().from(nodes).where(eq(nodes.title, payloadObj.target_title)).get()
      if (sourceNode && targetNode && sourceNode.id !== targetNode.id) {
        const edgeId = generateId('e')
        try {
          db.insert(edges).values({
            id: edgeId,
            source_node_id: sourceNode.id,
            target_node_id: targetNode.id,
            relation_type: payloadObj.relation_type,
            weight: suggestion.confidence ?? 0.5,
            created_by: 'ai_feed',
          }).run()
          allCreated.push({ type: 'edge', id: edgeId })
        } catch { /* UNIQUE 冲突跳过 */ }

        // 补建 source_node_link 溯源关联
        if (suggestion.source_ref_id) {
          const linkedSource = db.select().from(sources).where(eq(sources.feed_item_id, suggestion.source_ref_id)).get()
          if (linkedSource) {
            for (const edgeNode of [sourceNode, targetNode]) {
              try {
                db.insert(sourceNodeLinks).values({
                  id: generateId('snl'),
                  source_id: linkedSource.id,
                  node_id: edgeNode.id,
                  excerpt: payloadObj.excerpt ?? null,
                  created_at: now,
                }).run()
              } catch { /* UNIQUE 冲突跳过 */ }
            }
          }
        }
      }
    }

    db.update(suggestions)
      .set({ status: 'accepted', decided_at: now, decision_note: decision_note ?? null })
      .where(eq(suggestions.id, id))
      .run()
    accepted++
  }

  // 记录批量接受操作日志
  if (accepted > 0) {
    db.insert(operationLogs)
      .values({
        id: generateId('ol'),
        operation: 'batch_accept',
        affected_ids: JSON.stringify(allCreated.map((e) => e.id)),
        payload_snapshot: JSON.stringify({ ids, action: 'accept', created: allCreated }),
        user_note: `批量接受 ${accepted} 条建议`,
        created_at: now,
      })
      .run()
  }

  return NextResponse.json({ data: { updated: accepted, action: 'accepted', created: allCreated } })
}
