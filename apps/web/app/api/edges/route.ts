import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { edges, nodes } from '@galaxy/db/schema'
import { generateId } from '@galaxy/shared'
import { CreateEdgeSchema } from '@/lib/api/schemas'
import { ensureDb } from '@/lib/api/ensure-db'
import { desc, eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
  ensureDb()
  const db = getDb()
  const rows = db.select().from(edges).orderBy(desc(edges.updated_at)).all()
  return NextResponse.json({ data: rows })
}

export async function POST(req: NextRequest) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = CreateEdgeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const db = getDb()

  // 校验两端节点存在
  const src = db.select().from(nodes).where(eq(nodes.id, parsed.data.source_node_id)).get()
  const tgt = db.select().from(nodes).where(eq(nodes.id, parsed.data.target_node_id)).get()
  if (!src || !tgt) {
    return NextResponse.json({ error: 'source or target node not found' }, { status: 404 })
  }

  const id = generateId('e')
  try {
    db.insert(edges)
      .values({
        id,
        source_node_id: parsed.data.source_node_id,
        target_node_id: parsed.data.target_node_id,
        relation_type: parsed.data.relation_type,
        weight: parsed.data.weight ?? 1,
        description: parsed.data.description ?? null,
      })
      .run()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('UNIQUE')) {
      return NextResponse.json({ error: '相同三元组的边已存在' }, { status: 409 })
    }
    throw e
  }
  const row = db.select().from(edges).where(eq(edges.id, id)).get()
  return NextResponse.json({ data: row }, { status: 201 })
}
