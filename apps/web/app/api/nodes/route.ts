import { NextRequest, NextResponse } from 'next/server'
import { getDb, initDb } from '@galaxy/db'
import { nodes } from '@galaxy/db/schema'
import { generateId, slugify } from '@galaxy/shared'
import { CreateNodeSchema } from '@/lib/api/schemas'
import { desc, eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

// 模块级仅初始化一次
let initialized = false
function ensureDb() {
  if (!initialized) {
    initDb()
    initialized = true
  }
}

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
  const slug = slugify(parsed.data.title)
  try {
    db.insert(nodes)
      .values({
        id,
        title: parsed.data.title,
        slug,
        summary: parsed.data.summary ?? null,
        domain: parsed.data.domain ?? null,
        is_seed: parsed.data.is_seed ?? false,
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
  return NextResponse.json({ data: row }, { status: 201 })
}
