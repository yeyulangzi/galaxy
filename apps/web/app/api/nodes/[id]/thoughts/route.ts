import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { nodes, nodeThoughtVersions, operationLogs } from '@galaxy/db/schema'
import { generateId, nowIso } from '@galaxy/shared'
import { ensureDb } from '@/lib/api/ensure-db'
import { eq, desc } from 'drizzle-orm'
import { SaveThoughtVersionSchema } from '@/lib/api/schemas'

export const dynamic = 'force-dynamic'

/**
 * GET /api/nodes/[id]/thoughts
 * 获取「我的思考」版本列表（按 saved_at 倒序）。
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  ensureDb()
  const db = getDb()
  const rows = db
    .select()
    .from(nodeThoughtVersions)
    .where(eq(nodeThoughtVersions.node_id, params.id))
    .orderBy(desc(nodeThoughtVersions.saved_at))
    .all()
  return NextResponse.json({ data: rows })
}

/**
 * POST /api/nodes/[id]/thoughts
 * 保存当前 my_thoughts 为新版本快照。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  ensureDb()
  const db = getDb()
  const body = await req.json().catch(() => ({}))
  const parsed = SaveThoughtVersionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const node = db
    .select({ my_thoughts: nodes.my_thoughts })
    .from(nodes)
    .where(eq(nodes.id, params.id))
    .get()
  if (!node) return NextResponse.json({ error: 'node not found' }, { status: 404 })

  // 优先使用前端传来的 content，fallback 到数据库中的值
  const contentToSave = parsed.data.content ?? node.my_thoughts
  if (!contentToSave) {
    return NextResponse.json({ error: 'no thoughts to save' }, { status: 400 })
  }

  const id = generateId('d')
  db.insert(nodeThoughtVersions)
    .values({
      id,
      node_id: params.id,
      content: contentToSave,
      version_label: parsed.data.version_label ?? null,
    })
    .run()

  const row = db
    .select()
    .from(nodeThoughtVersions)
    .where(eq(nodeThoughtVersions.id, id))
    .get()

  db.insert(operationLogs)
    .values({
      id: generateId('ol'),
      operation: 'save_thought_version',
      affected_ids: JSON.stringify([id, params.id]),
      payload_snapshot: null,
      user_note: `保存思考版本${parsed.data.version_label ? `「${parsed.data.version_label}」` : ''}`,
      created_at: nowIso(),
    })
    .run()

  return NextResponse.json({ data: row }, { status: 201 })
}
