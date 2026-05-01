import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { aspects, operationLogs } from '@galaxy/db/schema'
import { generateId, nowIso } from '@galaxy/shared'
import { loadAspectTemplates } from '@galaxy/ai'
import { ensureDb } from '@/lib/api/ensure-db'
import { eq, desc } from 'drizzle-orm'
import { CreateAspectSchema, UpdateAspectSchema } from '@/lib/api/schemas'
import { resolveDataDir } from '@/lib/api/build-registry'

export const dynamic = 'force-dynamic'

/**
 * GET /api/nodes/[id]/aspects
 * 获取节点的所有动态维度卡。
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const db = getDb()
  const rows = db
    .select()
    .from(aspects)
    .where(eq(aspects.node_id, params.id))
    .orderBy(aspects.order)
    .all()
  return NextResponse.json({ data: rows })
}

/**
 * POST /api/nodes/[id]/aspects
 * 创建新的动态维度卡。
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = CreateAspectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const db = getDb()
  const id = generateId('a')

  // 计算下一个 order 值
  const lastAspect = db
    .select({ order: aspects.order })
    .from(aspects)
    .where(eq(aspects.node_id, params.id))
    .orderBy(desc(aspects.order))
    .get()
  const nextOrder = (lastAspect?.order ?? -1) + 1

  const aspectTemplatesDir = resolveDataDir('aspects')
  const aspectTemplates = loadAspectTemplates(aspectTemplatesDir)
  const matchedTemplate = aspectTemplates.find((t) => t.title === parsed.data.title)

  db.insert(aspects)
    .values({
      id,
      node_id: params.id,
      template_key: matchedTemplate?.key ?? parsed.data.title.toLowerCase().replace(/\s+/g, '-'),
      title: parsed.data.title,
      content: parsed.data.content,
      source_type: parsed.data.source_type ?? 'manual',
      source_id: parsed.data.source_id ?? null,
      order: nextOrder,
    })
    .run()

  const row = db.select().from(aspects).where(eq(aspects.id, id)).get()

  db.insert(operationLogs)
    .values({
      id: generateId('ol'),
      operation: 'create_aspect',
      affected_ids: JSON.stringify([id]),
      payload_snapshot: null,
      user_note: `创建切面「${parsed.data.title}」`,
      created_at: nowIso(),
    })
    .run()

  return NextResponse.json({ data: row }, { status: 201 })
}

/**
 * PATCH /api/nodes/[id]/aspects
 * 更新已有的维度卡（body 中需包含 aspectId）。
 */
export async function PATCH(req: NextRequest) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const { aspectId, ...rest } = body
  if (!aspectId) {
    return NextResponse.json({ error: 'aspectId is required' }, { status: 400 })
  }

  const parsed = UpdateAspectSchema.safeParse(rest)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const db = getDb()
  const existing = db.select().from(aspects).where(eq(aspects.id, aspectId)).get()
  if (!existing) return NextResponse.json({ error: 'aspect not found' }, { status: 404 })

  db.update(aspects)
    .set({
      ...parsed.data,
      updated_at: new Date().toISOString(),
    })
    .where(eq(aspects.id, aspectId))
    .run()

  const row = db.select().from(aspects).where(eq(aspects.id, aspectId)).get()

  db.insert(operationLogs)
    .values({
      id: generateId('ol'),
      operation: 'update_aspect',
      affected_ids: JSON.stringify([aspectId]),
      payload_snapshot: null,
      user_note: `更新切面「${existing.title}」`,
      created_at: nowIso(),
    })
    .run()

  return NextResponse.json({ data: row })
}

/**
 * DELETE /api/nodes/[id]/aspects?aspectId=xxx
 * 删除维度卡。
 */
export async function DELETE(req: NextRequest) {
  ensureDb()
  const db = getDb()
  const url = new URL(req.url)
  const aspectId = url.searchParams.get('aspectId')
  if (!aspectId) return NextResponse.json({ error: 'aspectId required' }, { status: 400 })

  const existing = db.select().from(aspects).where(eq(aspects.id, aspectId)).get()
  if (!existing) return NextResponse.json({ error: 'aspect not found' }, { status: 404 })

  const logId = generateId('ol')
  db.insert(operationLogs)
    .values({
      id: logId,
      operation: 'confirm_delete_aspect',
      affected_ids: JSON.stringify([aspectId]),
      payload_snapshot: JSON.stringify({ aspect: existing }),
      user_note: `删除切面「${existing.title}」`,
      created_at: nowIso(),
    })
    .run()

  db.delete(aspects).where(eq(aspects.id, aspectId)).run()
  return NextResponse.json({ data: { id: aspectId, operation_log_id: logId } })
}
