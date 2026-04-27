import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { suggestions, nodes, edges } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { generateId, nowIso, slugify } from '@galaxy/shared'
import { ensureDb } from '@/lib/api/ensure-db'
import { ConfirmActionSchema } from '@/lib/api/schemas'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = ConfirmActionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const db = getDb()
  const suggestion = db.select().from(suggestions).where(eq(suggestions.id, params.id)).get()
  if (!suggestion) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (suggestion.status !== 'pending') {
    return NextResponse.json({ error: '该建议已处理' }, { status: 409 })
  }

  const now = nowIso()
  const { action, modified_payload, decision_note } = parsed.data

  if (action === 'reject') {
    db.update(suggestions)
      .set({ status: 'rejected', decided_at: now, decision_note: decision_note ?? null })
      .where(eq(suggestions.id, params.id))
      .run()
    return NextResponse.json({ data: { id: params.id, status: 'rejected' } })
  }

  const finalPayload = action === 'accept_modified' && modified_payload
    ? modified_payload
    : suggestion.payload
  const payloadObj = typeof finalPayload === 'string' ? JSON.parse(finalPayload) : finalPayload

  const createdEntities: Array<{ type: string; id: string }> = []

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
        ai_metadata: JSON.stringify({ suggestion_id: suggestion.id, provider: suggestion.provider_id, model: suggestion.model }),
      })
      .run()
    createdEntities.push({ type: 'node', id: nodeId })

    const suggestedEdges = payloadObj.suggested_edges ?? []
    for (const se of suggestedEdges) {
      const targetTitle = se.target_node_title
      const target = db.select().from(nodes).where(eq(nodes.title, targetTitle)).get()
      if (target) {
        const edgeId = generateId('e')
        try {
          db.insert(edges)
            .values({
              id: edgeId,
              source_node_id: nodeId,
              target_node_id: target.id,
              relation_type: se.relation_type,
              created_by: 'ai_feed',
            })
            .run()
          createdEntities.push({ type: 'edge', id: edgeId })
        } catch {
          // UNIQUE 冲突静默跳过
        }
      }
    }
  } else if (suggestion.type === 'new_edge') {
    const sourceNode = db.select().from(nodes).where(eq(nodes.title, payloadObj.source_title)).get()
    const targetNode = db.select().from(nodes).where(eq(nodes.title, payloadObj.target_title)).get()
    if (sourceNode && targetNode) {
      const edgeId = generateId('e')
      try {
        db.insert(edges)
          .values({
            id: edgeId,
            source_node_id: sourceNode.id,
            target_node_id: targetNode.id,
            relation_type: payloadObj.relation_type,
            created_by: 'ai_feed',
          })
          .run()
        createdEntities.push({ type: 'edge', id: edgeId })
      } catch {
        // UNIQUE 冲突静默跳过
      }
    }
  }

  db.update(suggestions)
    .set({
      status: action === 'accept_modified' ? 'accepted_modified' : 'accepted',
      decided_at: now,
      decided_payload: action === 'accept_modified' ? JSON.stringify(modified_payload) : null,
      decision_note: decision_note ?? null,
    })
    .where(eq(suggestions.id, params.id))
    .run()

  return NextResponse.json({ data: { id: params.id, status: action === 'accept_modified' ? 'accepted_modified' : 'accepted', created: createdEntities } })
}
