import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { deepDiveSessions } from '@galaxy/db/schema'
import { eq, desc } from 'drizzle-orm'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  ensureDb()
  const db = getDb()
  const { id: nodeId } = params

  const sessions = db
    .select()
    .from(deepDiveSessions)
    .where(eq(deepDiveSessions.node_id, nodeId))
    .orderBy(desc(deepDiveSessions.created_at))
    .all()

  return NextResponse.json({ data: sessions })
}
