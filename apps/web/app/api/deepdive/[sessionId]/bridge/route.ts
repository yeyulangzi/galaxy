import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '@galaxy/db'
import { deepDiveSessions, deepDiveMessages, settings, nodes } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { generateId, nowIso } from '@galaxy/shared'
import { createBridgeTask, readBridgeResult, cancelBridgeTask } from '@galaxy/ai'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

/**
 * POST — 发起 Bridge 任务
 */
export async function POST(
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

  const settingsRow = db.select().from(settings).get()
  const bridgeDir = settingsRow?.qoder_bridge_dir
  if (!bridgeDir) {
    return NextResponse.json(
      { error: 'qoder_bridge_dir is not configured in settings' },
      { status: 400 },
    )
  }

  const timeoutMinutes = settingsRow?.bridge_timeout_minutes ?? 30

  const node = db
    .select()
    .from(nodes)
    .where(eq(nodes.id, session.node_id))
    .get()

  const messages = db
    .select()
    .from(deepDiveMessages)
    .where(eq(deepDiveMessages.session_id, sessionId))
    .orderBy(deepDiveMessages.created_at)
    .all()

  const taskId = generateId('bridge')

  const taskPath = createBridgeTask(bridgeDir, {
    task_id: taskId,
    task_type: 'deepdive',
    node_context: {
      id: session.node_id,
      title: node?.title ?? '',
      summary: node?.summary ?? '',
      domain: node?.domain ?? '',
    },
    conversation_history: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    agent_type: session.agent_type as 'thinker' | 'partner',
    output_schema: {
      format: 'json',
      fields: ['insights', 'suggestions', 'follow_up_questions'],
    },
    expected_output: 'Agent analysis and suggestions based on the deep dive conversation',
    created_at: nowIso(),
    timeout_minutes: timeoutMinutes,
  })

  db.update(deepDiveSessions)
    .set({ bridge_task_path: taskPath, updated_at: nowIso() })
    .where(eq(deepDiveSessions.id, sessionId))
    .run()

  return NextResponse.json({ data: { taskPath } })
}

/**
 * GET — 轮询 Bridge 结果
 */
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

  if (!session.bridge_task_path) {
    return NextResponse.json(
      { error: 'No bridge task associated with this session' },
      { status: 400 },
    )
  }

  const settingsRow = db.select().from(settings).get()
  const bridgeDir = settingsRow?.qoder_bridge_dir
  if (!bridgeDir) {
    return NextResponse.json(
      { error: 'qoder_bridge_dir is not configured in settings' },
      { status: 400 },
    )
  }

  const taskFileName = path.basename(session.bridge_task_path)
  const resultPath = path.join(bridgeDir, 'done', taskFileName)

  if (fs.existsSync(resultPath)) {
    const result = readBridgeResult(resultPath)
    return NextResponse.json({ data: { status: 'done', result } })
  }

  return NextResponse.json({ data: { status: 'pending' } })
}

/**
 * DELETE — 取消 Bridge 任务
 */
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

  if (!session.bridge_task_path) {
    return NextResponse.json(
      { error: 'No bridge task associated with this session' },
      { status: 400 },
    )
  }

  const settingsRow = db.select().from(settings).get()
  const bridgeDir = settingsRow?.qoder_bridge_dir
  if (!bridgeDir) {
    return NextResponse.json(
      { error: 'qoder_bridge_dir is not configured in settings' },
      { status: 400 },
    )
  }

  cancelBridgeTask(session.bridge_task_path, bridgeDir)

  db.update(deepDiveSessions)
    .set({ bridge_task_path: null, updated_at: nowIso() })
    .where(eq(deepDiveSessions.id, sessionId))
    .run()

  return NextResponse.json({ data: { cancelled: true } })
}
