import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { suggestions, nodes, edges } from '@galaxy/db/schema'
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
      const nodeId = generateId('n')
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

      for (const se of payloadObj.suggested_edges ?? []) {
        const target = db.select().from(nodes).where(eq(nodes.title, se.target_node_title)).get()
        if (target) {
          const edgeId = generateId('e')
          try {
            db.insert(edges).values({ id: edgeId, source_node_id: nodeId, target_node_id: target.id, relation_type: se.relation_type, created_by: 'ai_feed' }).run()
            allCreated.push({ type: 'edge', id: edgeId })
          } catch { /* UNIQUE 冲突跳过 */ }
        }
      }
    } else if (suggestion.type === 'new_edge') {
      const sourceNode = db.select().from(nodes).where(eq(nodes.title, payloadObj.source_title)).get()
      const targetNode = db.select().from(nodes).where(eq(nodes.title, payloadObj.target_title)).get()
      if (sourceNode && targetNode) {
        const edgeId = generateId('e')
        try {
          db.insert(edges).values({ id: edgeId, source_node_id: sourceNode.id, target_node_id: targetNode.id, relation_type: payloadObj.relation_type, created_by: 'ai_feed' }).run()
          allCreated.push({ type: 'edge', id: edgeId })
        } catch { /* UNIQUE 冲突跳过 */ }
      }
    }

    db.update(suggestions)
      .set({ status: 'accepted', decided_at: now, decision_note: decision_note ?? null })
      .where(eq(suggestions.id, id))
      .run()
    accepted++
  }

  return NextResponse.json({ data: { updated: accepted, action: 'accepted', created: allCreated } })
}
