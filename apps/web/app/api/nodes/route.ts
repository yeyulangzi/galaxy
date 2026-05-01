import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { nodes, operationLogs } from '@galaxy/db/schema'
import { generateId, slugify, nowIso } from '@galaxy/shared'
import { CreateNodeSchema } from '@/lib/api/schemas'
import { ensureDb } from '@/lib/api/ensure-db'
import { desc, eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
  ensureDb()
  const db = getDb()
  const rows = db.select().from(nodes).orderBy(desc(nodes.updated_at)).all()
  return NextResponse.json({ data: rows })
}

export async function POST(req: NextRequest) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = CreateNodeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const db = getDb()
  const id = generateId('n')
  const baseSlug = slugify(parsed.data.title)
  const existingSlug = db.select().from(nodes).where(eq(nodes.slug, baseSlug)).get()
  const slug = existingSlug ? `${baseSlug}-${id.slice(2, 8)}` : baseSlug

  try {
    db.insert(nodes)
      .values({
        id,
        title: parsed.data.title,
        slug,
        summary: parsed.data.summary ?? null,
        domain: parsed.data.domain,
        is_seed: parsed.data.is_seed ?? false,
        node_type: parsed.data.node_type ?? 'concept',
        channel: parsed.data.channel ?? 'light',
        internalization_status: 'draft',
        last_accessed_at: new Date().toISOString(),
      })
      .run()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('UNIQUE')) {
      return NextResponse.json({ error: { slug: ['同名节点已存在'] } }, { status: 409 })
    }
    throw e
  }
  const row = db.select().from(nodes).where(eq(nodes.id, id)).get()

  db.insert(operationLogs)
    .values({
      id: generateId('ol'),
      operation: 'create_node',
      affected_ids: JSON.stringify([id]),
      payload_snapshot: null,
      user_note: `创建节点「${parsed.data.title}」`,
      created_at: nowIso(),
    })
    .run()

  return NextResponse.json({ data: row }, { status: 201 })
}
