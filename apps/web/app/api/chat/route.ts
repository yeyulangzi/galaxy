import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { deepDiveSessions } from '@galaxy/db/schema'
import { generateId, nowIso } from '@galaxy/shared'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  ensureDb()
  const db = getDb()
  const body = await req.json().catch(() => ({}))
  const { agentType } = body as { agentType?: string }

  if (!agentType || !['direct', 'thinker', 'partner'].includes(agentType)) {
    return NextResponse.json({ error: 'agentType must be direct, thinker, or partner' }, { status: 400 })
  }

  const sessionId = generateId('d')
  const now = nowIso()

  db.insert(deepDiveSessions)
    .values({
      id: sessionId,
      node_id: null,
      scope: 'global',
      agent_type: agentType,
      status: 'active',
      created_at: now,
      updated_at: now,
    })
    .run()

  return NextResponse.json({ data: { sessionId } })
}
