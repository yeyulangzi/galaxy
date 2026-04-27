import { NextRequest, NextResponse } from 'next/server'
import { getDb, initDb } from '@galaxy/db'
import { nodes } from '@galaxy/db/schema'
import { UpdateNodeSchema } from '@/lib/api/schemas'
import { eq } from 'drizzle-orm'
import { slugify } from '@galaxy/shared'

export const dynamic = 'force-dynamic'

let initialized = false
function ensureDb() {
  if (!initialized) {
    initDb()
    initialized = true
  }
}

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

  const patch: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.title) patch.slug = slugify(parsed.data.title)
  patch.updated_at = new Date().toISOString()

  db.update(nodes).set(patch).where(eq(nodes.id, params.id)).run()
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
