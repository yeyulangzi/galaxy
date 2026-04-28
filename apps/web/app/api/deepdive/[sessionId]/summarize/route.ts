import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import {
  deepDiveSessions,
  deepDiveMessages,
  nodes,
  aspects,
  settings,
  feedItems,
} from '@galaxy/db/schema'
import { eq, and } from 'drizzle-orm'
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
  req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  ensureDb()
  const db = getDb()
  const { sessionId } = params

  const body = await req.json().catch(() => ({}))
  const { mode } = body as { mode?: 'feed' | 'aspect' }

  if (!mode || (mode !== 'feed' && mode !== 'aspect')) {
    return NextResponse.json(
      { error: 'mode must be "feed" or "aspect"' },
      { status: 400 },
    )
  }

  // 读取 session
  const session = db
    .select()
    .from(deepDiveSessions)
    .where(eq(deepDiveSessions.id, sessionId))
    .get()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // 读取所有消息
  const messages = db
    .select()
    .from(deepDiveMessages)
    .where(eq(deepDiveMessages.session_id, sessionId))
    .orderBy(deepDiveMessages.created_at)
    .all()

  if (messages.length === 0) {
    return NextResponse.json(
      { error: 'No messages to summarize' },
      { status: 400 },
    )
  }

  // 读取节点信息
  const node = db
    .select()
    .from(nodes)
    .where(eq(nodes.id, session.node_id))
    .get()

  if (!node) {
    return NextResponse.json({ error: 'Node not found' }, { status: 404 })
  }

  // 构建 provider
  const { registry, defaultProviderId, defaultModel } = buildRegistry()
  const providerId = session.provider_id ?? defaultProviderId
  const model = session.model ?? defaultModel
  const provider = registry.getOrThrow(providerId)

  // 调用 LLM 生成总结
  const conversationForSummary = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const summary = await summarizeConversation(
    node.title,
    conversationForSummary,
    provider,
    model,
  )

  if (mode === 'feed') {
    // 将总结内容作为文本投喂，走 extractFromFeed 流程
    const feedId = generateId('f')
    const now = nowIso()

    db.insert(feedItems)
      .values({
        id: feedId,
        type: 'text',
        raw_content: summary.markdown,
        status: 'processing',
        created_at: now,
      })
      .run()

    try {
      const promptsDir = resolvePromptsDir()
      const channel = new DirectChannel(registry, promptsDir)
      const feedResult = await channel.extractFromFeed(
        feedId,
        summary.markdown,
        providerId,
        model,
      )

      return NextResponse.json({
        data: {
          mode: 'feed',
          summary: summary.markdown,
          suggestionsCount: feedResult.suggestionsCreated,
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

  // mode === 'aspect'
  const templateKey = 'deepdive-summary'
  const aspectTitle = 'Deep Dive 总结'
  const now = nowIso()

  // 查询是否已存在同 node_id + template_key 的 aspect
  const existingAspect = db
    .select()
    .from(aspects)
    .where(
      and(
        eq(aspects.node_id, session.node_id),
        eq(aspects.template_key, templateKey),
      ),
    )
    .get()

  let aspectId: string

  if (existingAspect) {
    // 追加内容，用分隔线分隔
    const updatedContent = `${existingAspect.content}\n\n---\n\n${summary.markdown}`
    db.update(aspects)
      .set({ content: updatedContent, updated_at: now })
      .where(eq(aspects.id, existingAspect.id))
      .run()
    aspectId = existingAspect.id
  } else {
    aspectId = generateId('asp')
    db.insert(aspects)
      .values({
        id: aspectId,
        node_id: session.node_id,
        template_key: templateKey,
        title: aspectTitle,
        content: summary.markdown,
        created_at: now,
        updated_at: now,
        created_by: 'ai_deepdive',
      })
      .run()
  }

  return NextResponse.json({
    data: {
      mode: 'aspect',
      summary: summary.markdown,
      aspectId,
    },
  })
}
