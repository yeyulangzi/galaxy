import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { nodes, edges, aspects, operationLogs } from '@galaxy/db/schema'
import { UpdateNodeSchema } from '@/lib/api/schemas'
import { ensureDb } from '@/lib/api/ensure-db'
import { eq, or } from 'drizzle-orm'
import { slugify, generateId, nowIso } from '@galaxy/shared'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const db = getDb()
  const row = db.select().from(nodes).where(eq(nodes.id, params.id)).get()
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // 异步更新访问时间（不阻塞响应）
  db.update(nodes)
    .set({ last_accessed_at: new Date().toISOString() })
    .where(eq(nodes.id, params.id))
    .run()

  return NextResponse.json({ data: row })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = UpdateNodeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const db = getDb()
  const existing = db.select().from(nodes).where(eq(nodes.id, params.id)).get()
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const patch: Partial<typeof nodes.$inferInsert> = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  }
  if (parsed.data.title) patch.slug = slugify(parsed.data.title)

  // 记录修改前快照
  const logId = generateId('ol')
  db.insert(operationLogs)
    .values({
      id: logId,
      operation: 'confirm_update_node',
      affected_ids: JSON.stringify([params.id]),
      payload_snapshot: JSON.stringify({ before: existing, patch: parsed.data }),
      user_note: `修改节点「${existing.title}」`,
      created_at: nowIso(),
    })
    .run()

  try {
    db.update(nodes).set(patch).where(eq(nodes.id, params.id)).run()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('UNIQUE')) {
      return NextResponse.json({ error: { slug: ['同名节点已存在'] } }, { status: 409 })
    }
    throw e
  }
  const row = db.select().from(nodes).where(eq(nodes.id, params.id)).get()
  return NextResponse.json({ data: row })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const db = getDb()
  const existing = db.select().from(nodes).where(eq(nodes.id, params.id)).get()
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // 保存快照用于撤销
  const relatedEdges = db
    .select()
    .from(edges)
    .where(or(eq(edges.source_node_id, params.id), eq(edges.target_node_id, params.id)))
    .all()
  const relatedAspects = db
    .select()
    .from(aspects)
    .where(eq(aspects.node_id, params.id))
    .all()

  const logId = generateId('ol')
  db.insert(operationLogs)
    .values({
      id: logId,
      operation: 'confirm_delete_node',
      affected_ids: JSON.stringify([params.id]),
      payload_snapshot: JSON.stringify({
        node: existing,
        edges: relatedEdges,
        aspects: relatedAspects,
      }),
      user_note: `删除节点「${existing.title}」`,
      created_at: nowIso(),
    })
    .run()

  db.delete(nodes).where(eq(nodes.id, params.id)).run()
  return NextResponse.json({ data: { id: params.id, operation_log_id: logId } })
}
