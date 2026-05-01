import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { edges, operationLogs } from '@galaxy/db/schema'
import { generateId, nowIso } from '@galaxy/shared'
import { ensureDb } from '@/lib/api/ensure-db'
import { eq, and, or, inArray } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

/**
 * 批量确认某个节点的所有 ai_suggested 边，将 origin 改为 manual
 * POST /api/edges/confirm
 * body: { nodeId: string }
 */
export async function POST(req: NextRequest) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const { nodeId } = body as { nodeId?: string }

  if (!nodeId) {
    return NextResponse.json({ error: 'nodeId is required' }, { status: 400 })
  }

  const db = getDb()

  // 查找该节点的所有 ai_suggested 边
  const aiEdges = db
    .select()
    .from(edges)
    .where(
      and(
        eq(edges.origin, 'ai_suggested'),
        or(eq(edges.source_node_id, nodeId), eq(edges.target_node_id, nodeId)),
      ),
    )
    .all()

  if (aiEdges.length === 0) {
    return NextResponse.json({ data: { confirmed: 0, edgeIds: [] } })
  }

  const edgeIds = aiEdges.map((e) => e.id)

  // 批量更新 origin 为 manual
  db.update(edges)
    .set({ origin: 'manual', updated_at: new Date().toISOString() })
    .where(inArray(edges.id, edgeIds))
    .run()

  db.insert(operationLogs)
    .values({
      id: generateId('ol'),
      operation: 'confirm_edges',
      affected_ids: JSON.stringify(edgeIds),
      payload_snapshot: null,
      user_note: `批量确认 ${edgeIds.length} 条 AI 建议边`,
      created_at: nowIso(),
    })
    .run()

  return NextResponse.json({ data: { confirmed: edgeIds.length, edgeIds } })
}
