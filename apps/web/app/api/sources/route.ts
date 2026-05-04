import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { sources } from '@galaxy/db/schema'
import { desc, sql } from 'drizzle-orm'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  ensureDb()
  const db = getDb()
  const url = new URL(req.url)

  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))

  const total = db.select({ count: sql<number>`count(*)` }).from(sources).get()?.count ?? 0
  const rows = db
    .select()
    .from(sources)
    .orderBy(desc(sources.created_at))
    .limit(limit)
    .offset((page - 1) * limit)
    .all()

  return NextResponse.json({ data: rows, meta: { total, page, limit } })
}
