import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { suggestions } from '@galaxy/db/schema'
import { eq, desc, and, gte, sql } from 'drizzle-orm'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  ensureDb()
  const db = getDb()
  const url = new URL(req.url)

  const status = url.searchParams.get('status') ?? 'pending'
  const source = url.searchParams.get('source')
  const type = url.searchParams.get('type')
  const minConfidence = url.searchParams.get('min_confidence')
  const hideLowConfidence = url.searchParams.get('hide_low_confidence') === 'true'
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))

  const conditions = [eq(suggestions.status, status as any)]
  if (source) conditions.push(eq(suggestions.source, source as any))
  if (type) conditions.push(eq(suggestions.type, type as any))
  if (minConfidence) conditions.push(gte(suggestions.confidence, parseFloat(minConfidence)))
  if (hideLowConfidence) conditions.push(gte(suggestions.confidence, 0.3))

  const where = conditions.length === 1 ? conditions[0]! : and(...conditions)!

  const total = db.select({ count: sql<number>`count(*)` }).from(suggestions).where(where).get()?.count ?? 0
  const rows = db
    .select()
    .from(suggestions)
    .where(where)
    .orderBy(desc(sql`COALESCE(${suggestions.calibrated_confidence}, ${suggestions.confidence})`), desc(suggestions.created_at))
    .limit(limit)
    .offset((page - 1) * limit)
    .all()

  return NextResponse.json({ data: rows, meta: { total, page, limit } })
}
