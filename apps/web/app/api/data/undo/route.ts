import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { operationLogs, nodes, edges, aspects, suggestions, nodeAttachments } from '@galaxy/db/schema'
import { eq, desc } from 'drizzle-orm'
import { generateId, nowIso } from '@galaxy/shared'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/data/undo — 获取可撤销的操作列表
 */
export async function GET() {
  ensureDb()
  const db = getDb()

  const logs = db
    .select()
    .from(operationLogs)
    .where(eq(operationLogs.is_undone, false))
    .orderBy(desc(operationLogs.created_at))
    .limit(50)
    .all()

  // 只返回有 payload_snapshot 的记录（有快照才能撤销）
  const undoable = logs.filter((log) => log.payload_snapshot != null)

  return NextResponse.json({ data: undoable })
}

/**
 * POST /api/data/undo — 撤销指定操作
 * Body: { operation_log_id: string }
 */
export async function POST(request: NextRequest) {
  ensureDb()
  const db = getDb()

  const body = await request.json()
  const logId = body.operation_log_id as string | undefined

  if (!logId) {
    return NextResponse.json({ error: 'operation_log_id is required' }, { status: 400 })
  }

  const log = db.select().from(operationLogs).where(eq(operationLogs.id, logId)).get()
  if (!log) {
    return NextResponse.json({ error: 'Operation log not found' }, { status: 404 })
  }

  if (log.is_undone) {
    return NextResponse.json({ error: 'Operation already undone' }, { status: 409 })
  }

  if (!log.payload_snapshot) {
    return NextResponse.json({ error: 'Operation has no snapshot, cannot undo' }, { status: 422 })
  }

  const snapshot = log.payload_snapshot as Record<string, unknown>
  const now = nowIso()

  try {
    switch (log.operation) {
      case 'merge_nodes': {
        // 合并节点的撤销：暂不支持（合并操作已删除副节点和迁移边，逆向恢复很复杂）
        return NextResponse.json(
          { error: 'Undo merge_nodes is not yet supported — data loss is irreversible' },
          { status: 422 },
        )
      }

      case 'confirm_delete_node': {
        // 恢复被删除的节点
        const nodeData = snapshot.node as Record<string, unknown> | undefined
        if (nodeData) {
          db.insert(nodes)
            .values({
              ...(nodeData as typeof nodes.$inferInsert),
              updated_at: now,
            })
            .onConflictDoNothing()
            .run()
        }

        // 恢复关联的 aspects
        const aspectsData = snapshot.aspects as Array<Record<string, unknown>> | undefined
        if (aspectsData) {
          for (const aspect of aspectsData) {
            db.insert(aspects)
              .values(aspect as typeof aspects.$inferInsert)
              .onConflictDoNothing()
              .run()
          }
        }

        // 恢复关联的 edges
        const edgesData = snapshot.edges as Array<Record<string, unknown>> | undefined
        if (edgesData) {
          for (const edge of edgesData) {
            db.insert(edges)
              .values(edge as typeof edges.$inferInsert)
              .onConflictDoNothing()
              .run()
          }
        }
        break
      }

      case 'confirm_delete_edge': {
        const edgeData = snapshot.edge as Record<string, unknown> | undefined
        if (edgeData) {
          db.insert(edges)
            .values(edgeData as typeof edges.$inferInsert)
            .onConflictDoNothing()
            .run()
        }
        break
      }

      case 'confirm_delete_aspect': {
        const aspectData = snapshot.aspect as Record<string, unknown> | undefined
        if (aspectData) {
          db.insert(aspects)
            .values(aspectData as typeof aspects.$inferInsert)
            .onConflictDoNothing()
            .run()
        }
        break
      }

      case 'confirm_update_node': {
        // 恢复节点的修改前快照
        const beforeNode = snapshot.before as Record<string, unknown> | undefined
        if (beforeNode && beforeNode.id) {
          db.update(nodes)
            .set({ ...beforeNode, updated_at: now } as typeof nodes.$inferInsert)
            .where(eq(nodes.id, beforeNode.id as string))
            .run()
        }
        break
      }

      case 'delete_attachment': {
        const attachmentData = snapshot.attachment as Record<string, unknown> | undefined
        if (attachmentData) {
          db.insert(nodeAttachments)
            .values(attachmentData as typeof nodeAttachments.$inferInsert)
            .onConflictDoNothing()
            .run()
        }
        break
      }

      case 'batch_accept':
      case 'batch_reject': {
        // 批量操作撤销：将相关 suggestions 恢复为 pending
        const suggestionIds = log.affected_ids as string[]
        if (suggestionIds) {
          for (const sId of suggestionIds) {
            db.update(suggestions)
              .set({ status: 'pending', decided_at: null, decided_payload: null, decision_note: null })
              .where(eq(suggestions.id, sId))
              .run()
          }
        }
        break
      }

      default:
        return NextResponse.json(
          { error: `Undo not supported for operation: ${log.operation}` },
          { status: 422 },
        )
    }

    // 标记已撤销
    db.update(operationLogs)
      .set({ is_undone: true, undone_at: now })
      .where(eq(operationLogs.id, logId))
      .run()

    return NextResponse.json({ data: { undone: true, operation: log.operation } })
  } catch (error) {
    console.error('[undo] Failed to undo operation:', error)
    return NextResponse.json(
      { error: 'Failed to undo operation' },
      { status: 500 },
    )
  }
}
