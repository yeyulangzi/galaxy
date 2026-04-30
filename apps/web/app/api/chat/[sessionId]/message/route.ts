import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { chatSessions, chatMessages, settings } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { generateId, nowIso } from '@galaxy/shared'
import {
  decrypt,
  ProviderRegistry,
  buildGlobalChatSystemPrompt,
  CHAT_TOOLS,
  executeToolCall,
  isWriteTool,
  setAgentPromptPath,
} from '@galaxy/ai'
import type { Message, ToolCall } from '@galaxy/ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const DEFAULT_THINKER_PROMPT_PATH =
  process.env.GALAXY_AGENT_PROMPT_THINKER ??
  '/Users/eleme/qoder/曹鹏的工作区/agents/thinker/system_prompt.md'
const DEFAULT_PARTNER_PROMPT_PATH =
  process.env.GALAXY_AGENT_PROMPT_PARTNER ?? '/Users/eleme/.qoder/agents/product-partner.md'

setAgentPromptPath('thinker', DEFAULT_THINKER_PROMPT_PATH)
setAgentPromptPath('partner', DEFAULT_PARTNER_PROMPT_PATH)

/**
 * 从 settings 中读取并构建 ProviderRegistry，返回 registry 和默认 provider/model。
 */
function buildRegistry(): {
  registry: ProviderRegistry
  defaultProviderId: string
  defaultModel: string
} {
  const db = getDb()
  const row = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!row) throw new Error('Settings not initialized')

  const registry = new ProviderRegistry()
  const creds = (row.provider_credentials ?? {}) as Record<
    string,
    { api_key?: string }
  >

  for (const [providerId, value] of Object.entries(creds)) {
    const encryptedKey = value?.api_key ?? ''
    if (!encryptedKey) continue
    let apiKey: string
    try {
      apiKey = decrypt(encryptedKey)
    } catch {
      continue
    }
    registry.registerBuiltIn(
      providerId as Parameters<ProviderRegistry['registerBuiltIn']>[0],
      { apiKey },
    )
  }

  return {
    registry,
    defaultProviderId: (row.default_provider as string) ?? 'openai',
    defaultModel: (row.default_model as string) ?? 'gpt-4o',
  }
}

const MAX_TOOL_ITERATIONS = 10

export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  const db = getDb()
  const { sessionId } = params

  const body = await req.json().catch(() => ({}))
  const { content } = body as { content?: string }

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  // 1. 验证 session 存在
  const session = db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, sessionId))
    .get()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // 2. 保存用户消息到 DB
  const now = nowIso()
  const userMessageId = generateId('m')
  db.insert(chatMessages)
    .values({
      id: userMessageId,
      session_id: sessionId,
      role: 'user',
      content: content.trim(),
      created_at: now,
    })
    .run()

  // 3. 构建 provider 和 system prompt
  const { registry, defaultProviderId, defaultModel } = buildRegistry()
  const providerId = (session as Record<string, unknown>).provider_id as string | null ?? defaultProviderId
  const model = (session as Record<string, unknown>).model as string | null ?? defaultModel
  const provider = registry.getOrThrow(providerId)

  if (!(session as Record<string, unknown>).provider_id || !(session as Record<string, unknown>).model) {
    db.update(chatSessions)
      .set({ provider_id: providerId, model, updated_at: nowIso() })
      .where(eq(chatSessions.id, sessionId))
      .run()
  }

  const systemPrompt = buildGlobalChatSystemPrompt()

  // 4. 加载消息历史
  const allMessages = db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.session_id, sessionId))
    .orderBy(chatMessages.created_at)
    .all()

  const llmMessages: Message[] = [
    { role: 'system', content: systemPrompt },
    ...allMessages.map((m) => ({
      role: (m.role === 'ai' ? 'assistant' : m.role) as 'system' | 'user' | 'assistant',
      content: m.content,
    })),
  ]

  // 5. 创建 SSE ReadableStream 并执行 agentic loop
  const aiMessageId = generateId('m')
  const encoder = new TextEncoder()

  const readableStream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
        )
      }

      let finalContent = ''
      const allToolCalls: ToolCall[] = []
      let suggestionsCreated = 0

      try {
        sendEvent({ type: 'thinking' })

        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
          const response = await provider.invoke({
            model,
            messages: llmMessages,
            tools: CHAT_TOOLS,
            maxTokens: 4096,
            temperature: 0.7,
          })

          if (!response.toolCalls || response.toolCalls.length === 0) {
            finalContent = response.content
            break
          }

          // 有 tool calls：记录并执行
          allToolCalls.push(...response.toolCalls)

          sendEvent({
            type: 'tool_start',
            calls: response.toolCalls.map((tc) => ({
              name: tc.name,
              arguments: tc.arguments,
            })),
          })

          const execResults = await Promise.all(
            response.toolCalls.map((tc) =>
              executeToolCall(tc, sessionId, providerId, model),
            ),
          )

          // 统计 write tool 产生的 suggestions
          for (const execResult of execResults) {
            if (execResult.isWrite && execResult.suggestionId) {
              suggestionsCreated++
            }
          }

          sendEvent({
            type: 'tool_done',
            results: execResults.map((r) => ({
              name: r.name,
              result: r.result,
              isWrite: r.isWrite,
            })),
          })

          // 追加 assistant 消息
          llmMessages.push({
            role: 'assistant',
            content: response.content || '',
          })

          // 追加每个 tool result 作为 user 消息
          for (const execResult of execResults) {
            llmMessages.push({
              role: 'user',
              content: `[Tool Result: ${execResult.name}]\n${JSON.stringify(execResult.result)}`,
            })
          }

          sendEvent({ type: 'thinking' })
        }

        // 7. 保存 AI 消息到 DB
        const aiCreatedAt = nowIso()
        db.insert(chatMessages)
          .values({
            id: aiMessageId,
            session_id: sessionId,
            role: 'ai',
            content: finalContent,
            tool_calls: allToolCalls.length > 0 ? JSON.stringify(allToolCalls) : null,
            created_at: aiCreatedAt,
          })
          .run()

        // 更新 session 时间戳
        db.update(chatSessions)
          .set({ updated_at: aiCreatedAt })
          .where(eq(chatSessions.id, sessionId))
          .run()

        sendEvent({
          type: 'done',
          message: {
            id: aiMessageId,
            content: finalContent,
            toolCalls: allToolCalls,
          },
          suggestionsCreated,
        })
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        sendEvent({ type: 'error', error: errorMessage })
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
