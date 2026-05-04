import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { sources, sourceNodeLinks, nodes } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const db = getDb()

  const source = db.select().from(sources).where(eq(sources.id, params.id)).get()
  if (!source) {
    return NextResponse.json({ error: 'source not found' }, { status: 404 })
  }

  const linkedNodes = db
    .select({
      node_id: sourceNodeLinks.node_id,
      node_title: nodes.title,
      excerpt: sourceNodeLinks.excerpt,
      created_at: sourceNodeLinks.created_at,
    })
    .from(sourceNodeLinks)
    .innerJoin(nodes, eq(sourceNodeLinks.node_id, nodes.id))
    .where(eq(sourceNodeLinks.source_id, params.id))
    .all()

  return NextResponse.json({ data: { ...source, linked_nodes: linkedNodes } })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const db = getDb()
  const body = await req.json().catch(() => ({}))
  const { title, content } = body as { title?: string; content?: string }

  const existing = db.select().from(sources).where(eq(sources.id, params.id)).get()
  if (!existing) return NextResponse.json({ error: 'source not found' }, { status: 404 })

  const updates: Record<string, string> = {}
  if (title !== undefined) updates.title = title
  if (content !== undefined) updates.content = content

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  db.update(sources).set(updates).where(eq(sources.id, params.id)).run()
  const updated = db.select().from(sources).where(eq(sources.id, params.id)).get()
  return NextResponse.json({ data: updated })
}
