import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import {
  deepDiveSessions,
  deepDiveMessages,
  nodes,
  aspects,
  feedItems,
  nodeAttachments,
} from '@galaxy/db/schema'
import { eq, and } from 'drizzle-orm'
import { generateId, nowIso } from '@galaxy/shared'
import {
  summarizeConversation,
  extractAspectsFromConversation,
  loadAspectTemplates,
  DirectChannel,
} from '@galaxy/ai'
import { ensureDb } from '@/lib/api/ensure-db'
import { buildRegistry, resolveDataDir } from '@/lib/api/build-registry'
import path from 'node:path'
import fs from 'node:fs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function resolveSummariesDir(nodeId: string): string {
  const summariesBase = resolveDataDir('summaries')
  return path.join(summariesBase, nodeId)
}

export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  ensureDb()
  const db = getDb()
  const { sessionId } = params

  const body = await req.json().catch(() => ({}))
  const { mode } = body as { mode?: 'feed' | 'aspect' | 'extract-aspects' }

  if (!mode || !['feed', 'aspect', 'extract-aspects'].includes(mode)) {
    return NextResponse.json(
      { error: 'mode must be "feed", "aspect", or "extract-aspects"' },
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

  const conversationForSummary = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  // mode === 'extract-aspects' — 不需要先做总结，直接异步提取维度
  if (mode === 'extract-aspects') {
    extractAspectsAsync(
      session.node_id,
      session.id,
      node.title,
      conversationForSummary,
      provider,
      model,
    ).catch((err) =>
      console.error('[summarize] async extract-aspects failed:', err),
    )

    return NextResponse.json({
      data: {
        mode: 'extract-aspects',
        async: true,
      },
    })
  }

  // feed 和 aspect 模式需要先生成总结
  let summary: Awaited<ReturnType<typeof summarizeConversation>>
  try {
    summary = await summarizeConversation(
      node.title,
      conversationForSummary,
      provider,
      model,
    )
  } catch (summarizeError: unknown) {
    const errorMessage =
      summarizeError instanceof Error ? summarizeError.message : String(summarizeError)
    console.error('[summarize] summarizeConversation failed:', errorMessage)
    return NextResponse.json(
      { error: `总结生成失败: ${errorMessage}` },
      { status: 500 },
    )
  }

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
      const promptsDir = resolveDataDir('prompts')
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

  // mode === 'aspect' — save summary as .md file attachment
  const now = nowIso()
  const timestamp = now.replace(/[:.]/g, '-').slice(0, 19)
  const safeTitle = node.title.replace(/[\/\\:*?"<>|]/g, '_').slice(0, 40)
  const fileName = `${safeTitle}-${timestamp}.md`

  const summariesDir = resolveSummariesDir(session.node_id)
  if (!fs.existsSync(summariesDir)) {
    fs.mkdirSync(summariesDir, { recursive: true })
  }

  const filePath = path.join(summariesDir, fileName)
  const fileContent = `# ${summary.title}\n\n> 节点：${node.title} | 生成于 ${now}\n\n${summary.markdown}`
  fs.writeFileSync(filePath, fileContent, 'utf-8')

  // 同时写入 nodeAttachments 表，让总结出现在节点附件列表中
  const attachmentId = generateId('a')
  db.insert(nodeAttachments)
    .values({
      id: attachmentId,
      node_id: session.node_id,
      type: 'md',
      title: `📝 ${summary.title ?? fileName}`,
      content_or_url: fileContent,
      created_at: now,
    })
    .run()

  // Return a relative path for the frontend to use
  const relativePath = `summaries/${session.node_id}/${fileName}`

  return NextResponse.json({
    data: {
      mode: 'aspect',
      summary: summary.markdown,
      fileName,
      filePath: relativePath,
      attachmentId,
    },
  })
}

/** 后台异步提取维度，不阻塞 HTTP 响应 */
async function extractAspectsAsync(
  nodeId: string,
  sessionId: string,
  nodeTitle: string,
  conversation: Array<{ role: string; content: string }>,
  provider: ReturnType<import('@galaxy/ai').ProviderRegistry['getOrThrow']>,
  model: string,
) {
  const db = getDb()
  const aspectsTemplatesDir = resolveDataDir('aspects')
  const templates = loadAspectTemplates(aspectsTemplatesDir)

  const extractResult = await extractAspectsFromConversation(
    nodeTitle,
    conversation,
    templates,
    provider,
    model,
  )

  const now = nowIso()

  for (const extracted of extractResult.aspects) {
    const existing = db
      .select()
      .from(aspects)
      .where(
        and(
          eq(aspects.node_id, nodeId),
          eq(aspects.title, extracted.title),
        ),
      )
      .get()

    if (existing) {
      const updatedContent = existing.content
        ? `${existing.content}\n\n---\n\n${extracted.content}`
        : extracted.content
      db.update(aspects)
        .set({ content: updatedContent, updated_at: now })
        .where(eq(aspects.id, existing.id))
        .run()
    } else {
      const template = templates.find((t) => t.title === extracted.title)
      if (!template) {
        console.warn(`[extract-aspects] Skipping unknown aspect title: "${extracted.title}"`)
        continue
      }
      db.insert(aspects)
        .values({
          id: generateId('a'),
          node_id: nodeId,
          template_key: template.key,
          title: extracted.title,
          content: extracted.content,
          source_type: 'dialogue',
          source_id: sessionId,
          order: template.order,
          created_at: now,
          updated_at: now,
          created_by: 'ai_deepdive',
        })
        .run()
    }
  }

  console.log(
    `[summarize] async extract-aspects done for node ${nodeId}: ${extractResult.aspects.length} aspects`,
  )
}
