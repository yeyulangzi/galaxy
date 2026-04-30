import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { suggestions, nodes, edges, aspects, operationLogs } from '@galaxy/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { generateId, nowIso, slugify } from '@galaxy/shared'
import { collectFeedback } from '@galaxy/ai'
import { ensureDb } from '@/lib/api/ensure-db'
import { ConfirmActionSchema } from '@/lib/api/schemas'

type Author = 'user' | 'ai_feed' | 'ai_proactive' | 'ai_deepdive'

const CREATED_BY_MAP: Record<string, Author> = {
  feed: 'ai_feed',
  proactive_scan: 'ai_proactive',
  deepdive: 'ai_deepdive',
  chat: 'ai_deepdive',
}

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
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

      try {
        collectFeedback(db, params.id, 'reject')
      } catch (feedbackError) {
        console.error('[confirm] collectFeedback failed:', feedbackError)
      }

      return NextResponse.json({ data: { id: params.id, status: 'rejected' } })
    }

    const finalPayload = action === 'accept_modified' && modified_payload
      ? modified_payload
      : suggestion.payload
    const payloadObj = typeof finalPayload === 'string' ? JSON.parse(finalPayload) : finalPayload

    const createdEntities: Array<{ type: string; id: string }> = []

    const createdBy: Author = CREATED_BY_MAP[suggestion.source ?? ''] ?? 'ai_feed'

    if (suggestion.type === 'new_node') {
      const nodeId = generateId('n')
      const baseSlug = slugify(payloadObj.title)
      const existingSlug = db.select().from(nodes).where(eq(nodes.slug, baseSlug)).get()
      const finalSlug = existingSlug ? `${baseSlug}-${nodeId.slice(2, 8)}` : baseSlug

      db.insert(nodes)
        .values({
          id: nodeId,
          title: payloadObj.title,
          slug: finalSlug,
          summary: payloadObj.summary ?? null,
          domain: payloadObj.domain ?? null,
          node_type: payloadObj.node_type ?? 'concept',
          channel: payloadObj.channel ?? 'light',
          created_by: createdBy,
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
                origin: 'ai_confirmed',
                created_by: createdBy,
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
              origin: 'ai_confirmed',
              created_by: createdBy,
            })
            .run()
          createdEntities.push({ type: 'edge', id: edgeId })
        } catch {
          // UNIQUE 冲突静默跳过
        }
      }
    } else if (suggestion.type === 'fill_aspect') {
      const targetNode = db.select().from(nodes).where(eq(nodes.title, payloadObj.node_title)).get()
      if (targetNode) {
        const existingAspect = db
          .select()
          .from(aspects)
          .where(and(eq(aspects.node_id, targetNode.id), eq(aspects.title, payloadObj.aspect_title)))
          .get()

        if (existingAspect) {
          const mergedContent = existingAspect.content
            ? `${existingAspect.content}\n\n---\n\n${payloadObj.content}`
            : payloadObj.content
          db.update(aspects)
            .set({ content: mergedContent, updated_at: now })
            .where(eq(aspects.id, existingAspect.id))
            .run()
          createdEntities.push({ type: 'aspect_updated', id: existingAspect.id })
        } else {
          const aspectId = generateId('a')
          db.insert(aspects)
            .values({
              id: aspectId,
              node_id: targetNode.id,
              title: payloadObj.aspect_title,
              content: payloadObj.content,
              source_type: 'manual',
              created_by: createdBy,
              created_at: now,
              updated_at: now,
            })
            .run()
          createdEntities.push({ type: 'aspect', id: aspectId })
        }
      }
    } else if (suggestion.type === 'update_aspect') {
      const targetNode = db.select().from(nodes).where(eq(nodes.title, payloadObj.node_title)).get()
      if (targetNode) {
        const existingAspect = db
          .select()
          .from(aspects)
          .where(and(eq(aspects.node_id, targetNode.id), eq(aspects.title, payloadObj.aspect_title)))
          .get()

        if (existingAspect) {
          db.update(aspects)
            .set({ content: payloadObj.content, updated_at: now })
            .where(eq(aspects.id, existingAspect.id))
            .run()
          createdEntities.push({ type: 'aspect_updated', id: existingAspect.id })
        } else {
          const aspectId = generateId('a')
          db.insert(aspects)
            .values({
              id: aspectId,
              node_id: targetNode.id,
              title: payloadObj.aspect_title,
              content: payloadObj.content,
              source_type: 'manual',
              created_by: createdBy,
              created_at: now,
              updated_at: now,
            })
            .run()
          createdEntities.push({ type: 'aspect', id: aspectId })
        }
      }
    } else if (suggestion.type === 'merge_nodes') {
      const nodeTitles: string[] = payloadObj.node_titles ?? []
      const matchedNodes = nodeTitles
        .map((title: string) => db.select().from(nodes).where(eq(nodes.title, title)).get())
        .filter((n): n is NonNullable<typeof n> => n != null)

      if (matchedNodes.length >= 2) {
        const primaryNode = matchedNodes[0]!
        const secondaryNodes = matchedNodes.slice(1)
        const secondaryIds = secondaryNodes.map((n) => n.id)

        // Update primary node title
        db.update(nodes)
          .set({ title: payloadObj.merged_title ?? primaryNode.title, updated_at: now })
          .where(eq(nodes.id, primaryNode.id))
          .run()

        // Re-point edges from secondary nodes to primary
        for (const secId of secondaryIds) {
          db.update(edges)
            .set({ source_node_id: primaryNode.id })
            .where(eq(edges.source_node_id, secId))
            .run()
          db.update(edges)
            .set({ target_node_id: primaryNode.id })
            .where(eq(edges.target_node_id, secId))
            .run()
        }

        // Migrate aspects from secondary nodes to primary
        for (const secId of secondaryIds) {
          const secondaryAspects = db
            .select()
            .from(aspects)
            .where(eq(aspects.node_id, secId))
            .all()

          for (const aspect of secondaryAspects) {
            const existingOnPrimary = db
              .select()
              .from(aspects)
              .where(and(eq(aspects.node_id, primaryNode.id), eq(aspects.title, aspect.title)))
              .get()

            if (existingOnPrimary) {
              const mergedContent = existingOnPrimary.content
                ? `${existingOnPrimary.content}\n\n---\n\n${aspect.content}`
                : aspect.content
              db.update(aspects)
                .set({ content: mergedContent, updated_at: now })
                .where(eq(aspects.id, existingOnPrimary.id))
                .run()
            } else {
              db.update(aspects)
                .set({ node_id: primaryNode.id, updated_at: now })
                .where(eq(aspects.id, aspect.id))
                .run()
            }
          }
        }

        // Delete secondary nodes (cascade will clean up remaining edges)
        for (const secId of secondaryIds) {
          db.delete(nodes).where(eq(nodes.id, secId)).run()
        }

        // Log the merge operation
        db.insert(operationLogs)
          .values({
            id: generateId('o'),
            operation: 'merge_nodes',
            affected_ids: [primaryNode.id, ...secondaryIds],
            payload_snapshot: {
              merged_title: payloadObj.merged_title,
              original_titles: nodeTitles,
              primary_node_id: primaryNode.id,
              secondary_node_ids: secondaryIds,
            },
            user_note: `Merged ${matchedNodes.length} nodes into "${payloadObj.merged_title ?? primaryNode.title}"`,
            created_at: now,
          })
          .run()

        createdEntities.push({ type: 'merge', id: primaryNode.id })
      }
    } else if (suggestion.type === 'update_node') {
      const targetNode = db.select().from(nodes).where(eq(nodes.id, payloadObj.node_id)).get()
      if (targetNode) {
        const updateFields: Record<string, unknown> = { updated_at: now }
        if (payloadObj.title) updateFields.title = payloadObj.title
        if (payloadObj.summary !== undefined) updateFields.summary = payloadObj.summary
        if (payloadObj.domain) updateFields.domain = payloadObj.domain
        if (payloadObj.my_thoughts !== undefined) updateFields.my_thoughts = payloadObj.my_thoughts
        db.update(nodes).set(updateFields).where(eq(nodes.id, targetNode.id)).run()
        createdEntities.push({ type: 'node_updated', id: targetNode.id })
      }
    } else if (suggestion.type === 'delete_node') {
      const targetNode = db.select().from(nodes).where(eq(nodes.id, payloadObj.node_id)).get()
      if (targetNode) {
        db.delete(aspects).where(eq(aspects.node_id, targetNode.id)).run()
        db.delete(edges).where(eq(edges.source_node_id, targetNode.id)).run()
        db.delete(edges).where(eq(edges.target_node_id, targetNode.id)).run()
        db.delete(nodes).where(eq(nodes.id, targetNode.id)).run()
        createdEntities.push({ type: 'node_deleted', id: targetNode.id })
      }
    } else if (suggestion.type === 'update_edge') {
      const targetEdge = db.select().from(edges).where(eq(edges.id, payloadObj.edge_id)).get()
      if (targetEdge) {
        const updateFields: Record<string, unknown> = { updated_at: now }
        if (payloadObj.relation_type) updateFields.relation_type = payloadObj.relation_type
        if (payloadObj.weight !== undefined) updateFields.weight = payloadObj.weight
        if (payloadObj.description !== undefined) updateFields.description = payloadObj.description
        db.update(edges).set(updateFields).where(eq(edges.id, targetEdge.id)).run()
        createdEntities.push({ type: 'edge_updated', id: targetEdge.id })
      }
    } else if (suggestion.type === 'delete_edge') {
      const targetEdge = db.select().from(edges).where(eq(edges.id, payloadObj.edge_id)).get()
      if (targetEdge) {
        db.delete(edges).where(eq(edges.id, targetEdge.id)).run()
        createdEntities.push({ type: 'edge_deleted', id: targetEdge.id })
      }
    } else if (suggestion.type === 'delete_aspect') {
      const targetAspect = db.select().from(aspects).where(eq(aspects.id, payloadObj.aspect_id)).get()
      if (targetAspect) {
        db.delete(aspects).where(eq(aspects.id, targetAspect.id)).run()
        createdEntities.push({ type: 'aspect_deleted', id: targetAspect.id })
      }
    } else if (suggestion.type === 'batch_update') {
      const updates = (payloadObj.updates ?? []) as Array<{ node_id: string; title?: string; summary?: string; domain?: string }>
      for (const update of updates) {
        const targetNode = db.select().from(nodes).where(eq(nodes.id, update.node_id)).get()
        if (targetNode) {
          const updateFields: Record<string, unknown> = { updated_at: now }
          if (update.title) updateFields.title = update.title
          if (update.summary !== undefined) updateFields.summary = update.summary
          if (update.domain) updateFields.domain = update.domain
          db.update(nodes).set(updateFields).where(eq(nodes.id, targetNode.id)).run()
          createdEntities.push({ type: 'node_updated', id: targetNode.id })
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

    // Collect feedback after suggestion status is updated
    try {
      const feedbackAction = action === 'accept' ? 'accept' : 'accept_modified'
      collectFeedback(db, params.id, feedbackAction)
    } catch (feedbackError) {
      console.error('[confirm] collectFeedback failed:', feedbackError)
    }

    return NextResponse.json({ data: { id: params.id, status: action === 'accept_modified' ? 'accepted_modified' : 'accepted', created: createdEntities } })
  } catch (error: unknown) {
    console.error('[confirm] Error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
