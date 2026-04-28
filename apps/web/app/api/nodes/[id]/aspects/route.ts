import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { aspects } from '@galaxy/db/schema'
import { generateId } from '@galaxy/shared'
import { loadAspectTemplates } from '@galaxy/ai'
import { ensureDb } from '@/lib/api/ensure-db'
import { eq, and } from 'drizzle-orm'
import { UpdateAspectSchema } from '@/lib/api/schemas'
import path from 'node:path'
import fs from 'node:fs'

export const dynamic = 'force-dynamic'

/**
 * 定位 data/aspects 模板目录。
 * 兼容 monorepo 根目录和 apps/web 两种 cwd 场景。
 */
function findAspectsTemplatesDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'data', 'aspects'),
    path.resolve(process.cwd(), '..', '..', 'data', 'aspects'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  throw new Error(`Cannot find aspects templates folder. Tried: ${candidates.join(', ')}`)
}

/**
 * GET /api/nodes/[id]/aspects
 * 获取节点的所有视角：DB 中已有的记录 + 模板默认值合并。
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const db = getDb()
  const nodeId = params.id

  const existingAspects = db.select().from(aspects).where(eq(aspects.node_id, nodeId)).all()

  const templates = loadAspectTemplates(findAspectsTemplatesDir())

  const existingByKey = new Map(existingAspects.map((a) => [a.template_key, a]))

  const merged = templates.map((template) => {
    const existing = existingByKey.get(template.key)
    if (existing) {
      return existing
    }
    return {
      id: null,
      node_id: nodeId,
      template_key: template.key,
      title: template.title,
      content: template.defaultContent,
      order: template.order,
      created_at: null,
      updated_at: null,
      created_by: null,
      ai_metadata: null,
    }
  })

  return NextResponse.json({ data: merged })
}

/**
 * POST /api/nodes/[id]/aspects
 * 创建或更新视角内容（upsert by node_id + template_key）。
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = UpdateAspectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const db = getDb()
  const nodeId = params.id
  const { templateKey, content } = parsed.data

  const templates = loadAspectTemplates(findAspectsTemplatesDir())
  const template = templates.find((t) => t.key === templateKey)
  if (!template) {
    return NextResponse.json({ error: `Unknown template key: ${templateKey}` }, { status: 400 })
  }

  const existing = db
    .select()
    .from(aspects)
    .where(and(eq(aspects.node_id, nodeId), eq(aspects.template_key, templateKey)))
    .get()

  if (existing) {
    db.update(aspects)
      .set({
        content,
        updated_at: new Date().toISOString(),
      })
      .where(eq(aspects.id, existing.id))
      .run()

    const updated = db.select().from(aspects).where(eq(aspects.id, existing.id)).get()
    return NextResponse.json({ data: updated })
  }

  const id = generateId('a')
  db.insert(aspects)
    .values({
      id,
      node_id: nodeId,
      template_key: templateKey,
      title: template.title,
      content,
      order: template.order,
    })
    .run()

  const row = db.select().from(aspects).where(eq(aspects.id, id)).get()
  return NextResponse.json({ data: row }, { status: 201 })
}
