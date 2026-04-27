import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { nodes } from '@galaxy/db/schema'
import { UpdateNodeSchema } from '@/lib/api/schemas'
import { ensureDb } from '@/lib/api/ensure-db'
import { eq } from 'drizzle-orm'
import { slugify } from '@galaxy/shared'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const db = getDb()
  const row = db.select().from(nodes).where(eq(nodes.id, params.id)).get()
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
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
  db.delete(nodes).where(eq(nodes.id, params.id)).run()
  return NextResponse.json({ data: { id: params.id } })
}
