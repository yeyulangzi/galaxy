import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import {
  deepDiveSessions,
  deepDiveMessages,
  suggestions,
  settings,
} from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { generateId, nowIso } from '@galaxy/shared'
import {
  decrypt,
  ProviderRegistry,
  extractSuggestionsFromConversation,
} from '@galaxy/ai'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

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

  if (session.status !== 'active') {
    return NextResponse.json({ error: 'Session is already completed or abandoned' }, { status: 400 })
  }

  // 获取所有对话消息
  const messages = db
    .select()
    .from(deepDiveMessages)
    .where(eq(deepDiveMessages.session_id, sessionId))
    .orderBy(deepDiveMessages.created_at)
    .all()

  if (messages.length === 0) {
    // 无对话内容，直接结束
    db.update(deepDiveSessions)
      .set({ status: 'completed', updated_at: nowIso() })
      .where(eq(deepDiveSessions.id, sessionId))
      .run()
    return NextResponse.json({ data: { suggestionsCreated: 0 } })
  }

  // 构建 provider
  const settingsRow = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!settingsRow) {
    return NextResponse.json({ error: 'Settings not initialized' }, { status: 500 })
  }

  const registry = new ProviderRegistry()
  const creds = (settingsRow.provider_credentials ?? {}) as Record<string, { api_key?: string }>

  for (const [providerId, value] of Object.entries(creds)) {
    const encryptedKey = value?.api_key ?? ''
    if (!encryptedKey) continue
    let apiKey: string
    try {
      apiKey = decrypt(encryptedKey)
    } catch {
      continue
    }
    registry.registerBuiltIn(providerId as Parameters<ProviderRegistry['registerBuiltIn']>[0], { apiKey })
  }

  const providerId = session.provider_id ?? (settingsRow.default_provider as string) ?? 'openai'
  const model = session.model ?? (settingsRow.default_model as string) ?? 'gpt-4o'
  const provider = registry.getOrThrow(providerId)

  // 从对话中提取建议
  const conversationForExtraction = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const extractionResult = await extractSuggestionsFromConversation(
    conversationForExtraction,
    provider,
    model,
  )

  // 写入 suggestions 表
  const now = nowIso()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  let suggestionsCreated = 0
  const suggestionIds: string[] = []

  for (const node of extractionResult.new_nodes) {
    const suggestionId = generateId('s')
    suggestionIds.push(suggestionId)
    db.insert(suggestions)
      .values({
        id: suggestionId,
        type: 'new_node',
        source: 'deepdive',
        source_ref_id: sessionId,
        payload: JSON.stringify(node),
        rationale: node.rationale,
        confidence: node.confidence,
        status: 'pending',
        created_at: now,
        expires_at: expiresAt,
        provider_id: providerId,
        model,
      })
      .run()
    suggestionsCreated++
  }

  for (const edge of extractionResult.new_edges) {
    const suggestionId = generateId('s')
    suggestionIds.push(suggestionId)
    db.insert(suggestions)
      .values({
        id: suggestionId,
        type: 'new_edge',
        source: 'deepdive',
        source_ref_id: sessionId,
        payload: JSON.stringify(edge),
        rationale: edge.rationale,
        confidence: edge.confidence,
        status: 'pending',
        created_at: now,
        expires_at: expiresAt,
        provider_id: providerId,
        model,
      })
      .run()
    suggestionsCreated++
  }

  for (const aspect of extractionResult.fill_aspects ?? []) {
    const suggestionId = generateId('s')
    suggestionIds.push(suggestionId)
    db.insert(suggestions)
      .values({
        id: suggestionId,
        type: 'fill_aspect',
        source: 'deepdive',
        source_ref_id: sessionId,
        payload: JSON.stringify(aspect),
        rationale: aspect.rationale,
        confidence: aspect.confidence,
        status: 'pending',
        created_at: now,
        expires_at: expiresAt,
        provider_id: providerId,
        model,
      })
      .run()
    suggestionsCreated++
  }

  // 更新 session 状态
  db.update(deepDiveSessions)
    .set({
      status: 'completed',
      final_suggestion_ids: JSON.stringify(suggestionIds),
      updated_at: now,
    })
    .where(eq(deepDiveSessions.id, sessionId))
    .run()

  return NextResponse.json({ data: { suggestionsCreated } })
}
