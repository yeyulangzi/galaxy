import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import {
  deepDiveSessions,
  deepDiveMessages,
  settings,
  feedItems,
} from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { generateId, nowIso } from '@galaxy/shared'
import {
  decrypt,
  ProviderRegistry,
  summarizeConversation,
  DirectChannel,
} from '@galaxy/ai'
import { ensureDb } from '@/lib/api/ensure-db'
import path from 'node:path'
import fs from 'node:fs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function buildRegistry(): {
  registry: ProviderRegistry
  defaultProviderId: string
  defaultModel: string
} {
  const db = getDb()
  const row = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!row) throw new Error('Settings not initialized')

  const registry = new ProviderRegistry()
  const credentials = (row.provider_credentials ?? {}) as Record<
    string,
    { api_key?: string }
  >

  for (const [providerId, value] of Object.entries(credentials)) {
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

function resolvePromptsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'data', 'prompts'),
    path.resolve(process.cwd(), '..', '..', 'data', 'prompts'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  throw new Error(
    `Cannot find data/prompts folder. Tried: ${candidates.join(', ')}`,
  )
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  ensureDb()
  const db = getDb()
  const { sessionId } = params

  // 1. 验证 session 存在
  const session = db
    .select()
    .from(deepDiveSessions)
    .where(eq(deepDiveSessions.id, sessionId))
    .get()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // 2. 加载对话消息（至少 2 条）
  const messages = db
    .select()
    .from(deepDiveMessages)
    .where(eq(deepDiveMessages.session_id, sessionId))
    .orderBy(deepDiveMessages.created_at)
    .all()

  if (messages.length < 2) {
    return NextResponse.json(
      { error: 'At least 2 messages are required to summarize' },
      { status: 400 },
    )
  }

  // 3. 构建 provider
  const { registry, defaultProviderId, defaultModel } = buildRegistry()
  const providerId = session.provider_id ?? defaultProviderId
  const model = session.model ?? defaultModel
  const provider = registry.getOrThrow(providerId)

  // 4. 将对话格式化为可总结的文本
  const conversationForSummary = messages.map((message) => ({
    role: message.role,
    content: message.content,
  }))

  // 5. 调用 AI 总结对话内容
  const chatTitle = '全局对话'
  const summary = await summarizeConversation(
    chatTitle,
    conversationForSummary,
    provider,
    model,
  )

  // 6. 保存总结为 .md 文件到 data/summaries/chat/ 目录
  const now = nowIso()
  const timestamp = now.replace(/[:.]/g, '-').slice(0, 19)
  const fileName = `chat-${sessionId.slice(0, 8)}-${timestamp}.md`

  const summariesBase = path.resolve(
    process.cwd(),
    '..',
    '..',
    'data',
    'summaries',
    'chat',
  )
  const summariesDir = path.join(summariesBase, sessionId)
  if (!fs.existsSync(summariesDir)) {
    fs.mkdirSync(summariesDir, { recursive: true })
  }

  const filePath = path.join(summariesDir, fileName)
  const fileContent = `# ${summary.title}\n\n> 对话会话：${sessionId} | 生成于 ${now}\n\n${summary.markdown}`
  fs.writeFileSync(filePath, fileContent, 'utf-8')

  const relativeSummaryPath = `summaries/chat/${sessionId}/${fileName}`

  // 7. 创建 feedItem 记录
  const feedId = generateId('f')

  db.insert(feedItems)
    .values({
      id: feedId,
      type: 'text',
      raw_content: summary.markdown,
      file_path: relativeSummaryPath,
      status: 'processing',
      created_at: now,
    })
    .run()

  // 8. 调用 DirectChannel.extractFromFeed 提取知识点
  try {
    const promptsDir = resolvePromptsDir()
    const channel = new DirectChannel(registry, promptsDir)
    const feedResult = await channel.extractFromFeed(
      feedId,
      summary.markdown,
      providerId,
      model,
    )

    // 9. 返回结果
    return NextResponse.json({
      data: {
        summaryPath: relativeSummaryPath,
        suggestionsCount: feedResult.suggestionsCreated,
        aspectSuggestionsCount: feedResult.aspectSuggestionsCreated ?? 0,
      },
    })
  } catch (feedError: unknown) {
    const errorMessage =
      feedError instanceof Error ? feedError.message : String(feedError)
    db.update(feedItems)
      .set({ status: 'failed', error_message: errorMessage })
      .where(eq(feedItems.id, feedId))
      .run()
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
