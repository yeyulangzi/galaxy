import { NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { scanRuns } from '@galaxy/db/schema'
import { desc } from 'drizzle-orm'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  ensureDb()
  const db = getDb()

  const recentRuns = db
    .select()
    .from(scanRuns)
    .orderBy(desc(scanRuns.started_at))
    .limit(10)
    .all()

  return NextResponse.json({ data: recentRuns })
}
