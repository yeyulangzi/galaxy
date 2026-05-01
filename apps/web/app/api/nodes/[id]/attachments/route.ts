import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { nodeAttachments, operationLogs } from '@galaxy/db/schema'
import { generateId, nowIso } from '@galaxy/shared'
import { ensureDb } from '@/lib/api/ensure-db'
import { eq, desc } from 'drizzle-orm'
import { CreateAttachmentSchema } from '@/lib/api/schemas'

export const dynamic = 'force-dynamic'

/**
 * GET /api/nodes/[id]/attachments
 * 获取节点的所有附件。
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  ensureDb()
  const db = getDb()
  const rows = db
    .select()
    .from(nodeAttachments)
    .where(eq(nodeAttachments.node_id, params.id))
    .orderBy(desc(nodeAttachments.created_at))
    .all()
  return NextResponse.json({ data: rows })
}

/**
 * POST /api/nodes/[id]/attachments
 * 添加附件（md 文本 / 链接 URL）。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = CreateAttachmentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const db = getDb()
  const id = generateId('a')
  db.insert(nodeAttachments)
    .values({
      id,
      node_id: params.id,
      type: parsed.data.type,
      title: parsed.data.title,
      content_or_url: parsed.data.content_or_url,
    })
    .run()

  const row = db
    .select()
    .from(nodeAttachments)
    .where(eq(nodeAttachments.id, id))
    .get()

  db.insert(operationLogs)
    .values({
      id: generateId('ol'),
      operation: 'create_attachment',
      affected_ids: JSON.stringify([id]),
      payload_snapshot: null,
      user_note: `添加附件「${parsed.data.title}」`,
      created_at: nowIso(),
    })
    .run()

  return NextResponse.json({ data: row }, { status: 201 })
}

/**
 * DELETE /api/nodes/[id]/attachments?attachmentId=xxx
 * 删除附件。
 */
export async function DELETE(req: NextRequest) {
  ensureDb()
  const db = getDb()
  const url = new URL(req.url)
  const attachmentId = url.searchParams.get('attachmentId')
  if (!attachmentId) {
    return NextResponse.json({ error: 'attachmentId required' }, { status: 400 })
  }
  const existing = db.select().from(nodeAttachments).where(eq(nodeAttachments.id, attachmentId)).get()
  if (!existing) return NextResponse.json({ error: 'attachment not found' }, { status: 404 })

  const logId = generateId('ol')
  db.insert(operationLogs)
    .values({
      id: logId,
      operation: 'delete_attachment',
      affected_ids: JSON.stringify([attachmentId]),
      payload_snapshot: JSON.stringify({ attachment: existing }),
      user_note: `删除附件「${existing.title}」`,
      created_at: nowIso(),
    })
    .run()

  db.delete(nodeAttachments)
    .where(eq(nodeAttachments.id, attachmentId))
    .run()
  return NextResponse.json({ data: { id: attachmentId, operation_log_id: logId } })
}
