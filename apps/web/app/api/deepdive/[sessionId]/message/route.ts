import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import {
  deepDiveSessions,
  deepDiveMessages,
  nodes,
  aspects,
} from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { generateId, nowIso } from '@galaxy/shared'
import {
  buildDeepDiveSystemPrompt,
  type DeepDiveContext,
  type DeepDiveAgentType,
} from '@galaxy/ai'
import { ensureDb } from '@/lib/api/ensure-db'
import { buildRegistry, initAgentPrompts } from '@/lib/api/build-registry'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// 确保 agent prompt 路径在模块加载时初始化
initAgentPrompts()

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
      title: a.title,
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
  const { content, useThinking } = body as { content?: string; useThinking?: boolean }

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
  const userMessageId = generateId('m')
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
  const { registry, defaultProviderId, defaultModel, thinking } = buildRegistry()
  const providerId = session.provider_id ?? defaultProviderId
  const model = session.model ?? defaultModel
  const provider = registry.getOrThrow(providerId)

  // 记录 session 的 provider/model 和标题（首次消息时写入）
  const needsProviderUpdate = !session.provider_id || !session.model
  const needsTitleUpdate = !session.title
  if (needsProviderUpdate || needsTitleUpdate) {
    const updates: Record<string, unknown> = { updated_at: nowIso() }
    if (needsProviderUpdate) {
      updates.provider_id = providerId
      updates.model = model
    }
    if (needsTitleUpdate) {
      const trimmedContent = content.trim()
      updates.title = trimmedContent.length > 30
        ? trimmedContent.slice(0, 30) + '…'
        : trimmedContent
    }
    db.update(deepDiveSessions)
      .set(updates)
      .where(eq(deepDiveSessions.id, sessionId))
      .run()
  }

  // 构建对话历史（带 agent 人格）
  const nodeContext = buildNodeContext(session.node_id)
  const agentType = (session.agent_type ?? 'direct') as DeepDiveAgentType
  const systemPrompt = buildDeepDiveSystemPrompt(nodeContext, agentType)

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

  // 流式调用 LLM
  const aiMessageId = generateId('m')
  const encoder = new TextEncoder()

  const readableStream = new ReadableStream({
    async start(controller) {
      let fullContent = ''
      try {
        const chunks = provider.stream({
          model,
          messages: llmMessages,
          /* maxTokens 由 provider 根据模型的 maxOutputTokens 自动设置 */
          temperature: 0.7,
          thinking: thinking.enabled && useThinking !== false ? thinking : undefined,
        })

        for await (const chunk of chunks) {
          fullContent += chunk
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`),
          )
        }

        // 保存 AI 回复
        const aiCreatedAt = nowIso()
        db.insert(deepDiveMessages)
          .values({
            id: aiMessageId,
            session_id: sessionId,
            role: 'ai',
            content: fullContent,
            created_at: aiCreatedAt,
          })
          .run()

        // 更新 session 时间戳
        db.update(deepDiveSessions)
          .set({ updated_at: aiCreatedAt })
          .where(eq(deepDiveSessions.id, sessionId))
          .run()

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'done', messageId: aiMessageId, content: fullContent })}\n\n`,
          ),
        )
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`),
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
