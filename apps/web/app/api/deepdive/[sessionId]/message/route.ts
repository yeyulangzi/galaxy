import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import {
  deepDiveSessions,
  deepDiveMessages,
  settings,
  nodes,
  aspects,
} from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { generateId, nowIso } from '@galaxy/shared'
import {
  decrypt,
  ProviderRegistry,
  buildDeepDiveSystemPrompt,
  type DeepDiveContext,
} from '@galaxy/ai'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

/**
 * 从 settings 中读取并构建 ProviderRegistry，返回 registry 和默认 provider/model。
 */
function buildRegistry(): { registry: ProviderRegistry; defaultProviderId: string; defaultModel: string } {
  const db = getDb()
  const row = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!row) throw new Error('Settings not initialized')

  const registry = new ProviderRegistry()
  const creds = (row.provider_credentials ?? {}) as Record<string, { api_key?: string }>

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

  return {
    registry,
    defaultProviderId: (row.default_provider as string) ?? 'openai',
    defaultModel: (row.default_model as string) ?? 'gpt-4o',
  }
}

/**
 * 构建节点的 DeepDiveContext。
 */
function buildNodeContext(nodeId: string): DeepDiveContext {
  const db = getDb()
  const node = db.select().from(nodes).where(eq(nodes.id, nodeId)).get()
  if (!node) throw new Error(`Node "${nodeId}" not found`)

  const nodeAspects = db
    .select()
    .from(aspects)
    .where(eq(aspects.node_id, nodeId))
    .all()

  return {
    nodeId: node.id,
    nodeTitle: node.title,
    nodeSummary: node.summary ?? '',
    nodeDomain: node.domain ?? '',
    aspects: nodeAspects.map((a) => ({
      title: a.template_key,
      content: (a.content as string) ?? '',
    })),
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  ensureDb()
  const db = getDb()
  const { sessionId } = params

  const body = await req.json().catch(() => ({}))
  const { content } = body as { content?: string }

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  const session = db
    .select()
    .from(deepDiveSessions)
    .where(eq(deepDiveSessions.id, sessionId))
    .get()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (session.status !== 'active') {
    return NextResponse.json({ error: 'Session is not active' }, { status: 400 })
  }

  // 保存用户消息
  const now = nowIso()
  const userMessageId = generateId('dm')
  db.insert(deepDiveMessages)
    .values({
      id: userMessageId,
      session_id: sessionId,
      role: 'user',
      content: content.trim(),
      created_at: now,
    })
    .run()

  // 构建 provider
  const { registry, defaultProviderId, defaultModel } = buildRegistry()
  const providerId = session.provider_id ?? defaultProviderId
  const model = session.model ?? defaultModel
  const provider = registry.getOrThrow(providerId)

  // 记录 session 的 provider/model（首次消息时写入）
  if (!session.provider_id || !session.model) {
    db.update(deepDiveSessions)
      .set({ provider_id: providerId, model, updated_at: nowIso() })
      .where(eq(deepDiveSessions.id, sessionId))
      .run()
  }

  // 构建对话历史
  const nodeContext = buildNodeContext(session.node_id)
  const systemPrompt = buildDeepDiveSystemPrompt(nodeContext)

  const allMessages = db
    .select()
    .from(deepDiveMessages)
    .where(eq(deepDiveMessages.session_id, sessionId))
    .orderBy(deepDiveMessages.created_at)
    .all()

  const llmMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...allMessages.map((m) => ({
      role: (m.role === 'ai' ? 'assistant' : m.role) as 'system' | 'user' | 'assistant',
      content: m.content,
    })),
  ]

  // 调用 LLM
  const response = await provider.invoke({
    model,
    messages: llmMessages,
    maxTokens: 4096,
    temperature: 0.7,
  })

  // 保存 AI 回复
  const aiMessageId = generateId('dm')
  const aiCreatedAt = nowIso()
  db.insert(deepDiveMessages)
    .values({
      id: aiMessageId,
      session_id: sessionId,
      role: 'ai',
      content: response.content,
      created_at: aiCreatedAt,
    })
    .run()

  // 更新 session 时间戳
  db.update(deepDiveSessions)
    .set({ updated_at: aiCreatedAt })
    .where(eq(deepDiveSessions.id, sessionId))
    .run()

  return NextResponse.json({
    data: {
      message: {
        id: aiMessageId,
        session_id: sessionId,
        role: 'ai',
        content: response.content,
        created_at: aiCreatedAt,
      },
    },
  })
}
