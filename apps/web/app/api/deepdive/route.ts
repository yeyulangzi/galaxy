import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { deepDiveSessions } from '@galaxy/db/schema'
import { generateId, nowIso } from '@galaxy/shared'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const { nodeId, agentType } = body as { nodeId?: string; agentType?: string }

  if (!nodeId || typeof nodeId !== 'string') {
    return NextResponse.json({ error: 'nodeId is required' }, { status: 400 })
  }

  const validAgentTypes = ['direct', 'thinker', 'partner'] as const
  if (!agentType || !validAgentTypes.includes(agentType as typeof validAgentTypes[number])) {
    return NextResponse.json(
      { error: `agentType must be one of: ${validAgentTypes.join(', ')}` },
      { status: 400 },
    )
  }

  const db = getDb()
  const now = nowIso()
  const sessionId = generateId('dd')

  db.insert(deepDiveSessions)
    .values({
      id: sessionId,
      node_id: nodeId,
      agent_type: agentType as 'direct' | 'thinker' | 'partner',
      status: 'active',
      created_at: now,
      updated_at: now,
    })
    .run()

  return NextResponse.json({ data: { sessionId } })
}
