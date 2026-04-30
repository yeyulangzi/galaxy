import { NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { deepDiveSessions } from '@galaxy/db/schema'
import { eq, desc } from 'drizzle-orm'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  ensureDb()
  const db = getDb()

  const sessions = db
    .select()
    .from(deepDiveSessions)
    .where(eq(deepDiveSessions.scope, 'global'))
    .orderBy(desc(deepDiveSessions.created_at))
    .all()

  return NextResponse.json({ data: sessions })
}
