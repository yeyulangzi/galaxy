import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { getDb } from '@galaxy/db'
import { deepDiveSessions, deepDiveMessages } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { generateId, nowIso } from '@galaxy/shared'
import {
  buildGlobalChatSystemPrompt,
  CHAT_TOOLS,
  executeToolCall,
} from '@galaxy/ai'
import type { Message, ToolCall } from '@galaxy/ai'
import { buildRegistry, initAgentPrompts, MEMORY_DIR, AGENTS_DIR } from '@/lib/api/build-registry'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// 确保 agent prompt 路径在模块加载时初始化
initAgentPrompts()

/** 安全读取文件，失败返回 undefined */
function safeReadFile(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return undefined
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
  const { content, useThinking } = body as { content?: string; useThinking?: boolean }

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  // 1. 验证 session 存在
  const session = db
    .select()
    .from(deepDiveSessions)
    .where(eq(deepDiveSessions.id, sessionId))
    .get()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // 2. 保存用户消息到 DB
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

  // 2.5 如果 session 还没有标题，用第一条消息自动生成
  if (!session.title) {
    const autoTitle = content.trim().slice(0, 50).replace(/\n/g, ' ')
    db.update(deepDiveSessions)
      .set({ title: autoTitle, updated_at: now })
      .where(eq(deepDiveSessions.id, sessionId))
      .run()
  }

  // 3. 构建 provider 和 system prompt
  const { registry, defaultProviderId, defaultModel, thinking } = buildRegistry()
  const providerId = session.provider_id ?? defaultProviderId
  const model = session.model ?? defaultModel
  const provider = registry.getOrThrow(providerId)

  if (!session.provider_id || !session.model) {
    db.update(deepDiveSessions)
      .set({ provider_id: providerId, model, updated_at: nowIso() })
      .where(eq(deepDiveSessions.id, sessionId))
      .run()
  }

  // 读取用户档案和全局记忆
  const userProfile = safeReadFile(path.join(MEMORY_DIR, 'user_profile.md'))
  const globalMemory = safeReadFile(path.join(MEMORY_DIR, 'global_memory.md'))

  // 获取 agentType，支持自定义角色
  const agentType = session.agent_type ?? 'direct'
  const builtInAgents = ['direct', 'thinker', 'partner']
  const isCustomAgent = !builtInAgents.includes(agentType)

  // 如果是自定义角色，读取对应的 md 文件内容
  let agentPromptContent: string | undefined
  if (isCustomAgent) {
    agentPromptContent = safeReadFile(path.join(AGENTS_DIR, `${agentType}.md`))
  }

  const systemPrompt = buildGlobalChatSystemPrompt(agentType, {
    userProfile,
    globalMemory,
    agentPromptContent,
  })

  // 4. 加载消息历史
  const allMessages = db
    .select()
    .from(deepDiveMessages)
    .where(eq(deepDiveMessages.session_id, sessionId))
    .orderBy(deepDiveMessages.created_at)
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
            /* maxTokens 由 provider 根据模型的 maxOutputTokens 自动设置 */
            temperature: 0.7,
            thinking: thinking.enabled && useThinking !== false ? thinking : undefined,
          })

          if (!response.toolCalls || response.toolCalls.length === 0) {
            finalContent = response.content
            break
          }

          // 有 tool calls：记录并执行
          allToolCalls.push(...response.toolCalls)

          // 逐条发送 tool_start 事件，每个带唯一 toolCallId
          const toolCallIds = response.toolCalls.map(
            (_, idx) => `tc_${Date.now()}_${idx}`,
          )
          for (let i = 0; i < response.toolCalls.length; i++) {
            const tc = response.toolCalls[i]!
            sendEvent({
              type: 'tool_start',
              toolCallId: toolCallIds[i],
              toolName: tc.name,
              arguments: tc.arguments,
            })
          }

          const execResults = await Promise.all(
            response.toolCalls.map((tc) =>
              executeToolCall(tc, sessionId, providerId, model),
            ),
          )

          // 逐条发送 tool_done 事件 + 统计 write tool 产生的 suggestions
          for (let i = 0; i < execResults.length; i++) {
            const execResult = execResults[i]!
            if (execResult.isWrite && execResult.suggestionId) {
              suggestionsCreated++
            }
            sendEvent({
              type: 'tool_done',
              toolCallId: toolCallIds[i],
              result: execResult.result,
              isWrite: execResult.isWrite,
            })
          }

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
        db.insert(deepDiveMessages)
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
        db.update(deepDiveSessions)
          .set({ updated_at: aiCreatedAt })
          .where(eq(deepDiveSessions.id, sessionId))
          .run()

        sendEvent({
          type: 'done',
          content: finalContent,
          messageId: aiMessageId,
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
