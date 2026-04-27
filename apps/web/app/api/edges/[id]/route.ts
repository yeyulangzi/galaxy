import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { edges } from '@galaxy/db/schema'
import { ensureDb } from '@/lib/api/ensure-db'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const db = getDb()
  const existing = db.select().from(edges).where(eq(edges.id, params.id)).get()
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })
  db.delete(edges).where(eq(edges.id, params.id)).run()
  return NextResponse.json({ data: { id: params.id } })
}
