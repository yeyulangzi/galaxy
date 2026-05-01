import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { deepDiveSessions, deepDiveMessages } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  ensureDb()
  const db = getDb()
  const { sessionId } = params

  const session = db
    .select()
    .from(deepDiveSessions)
    .where(eq(deepDiveSessions.id, sessionId))
    .get()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const messages = db
    .select()
    .from(deepDiveMessages)
    .where(eq(deepDiveMessages.session_id, sessionId))
    .orderBy(deepDiveMessages.created_at)
    .all()

  return NextResponse.json({ data: { session, messages } })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  ensureDb()
  const db = getDb()
  const { sessionId } = params

  const session = db
    .select()
    .from(deepDiveSessions)
    .where(eq(deepDiveSessions.id, sessionId))
    .get()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  db.delete(deepDiveMessages).where(eq(deepDiveMessages.session_id, sessionId)).run()
  db.delete(deepDiveSessions).where(eq(deepDiveSessions.id, sessionId)).run()

  return NextResponse.json({ data: { deleted: true } })
}
