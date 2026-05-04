import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { nodes, aspects, operationLogs } from '@galaxy/db/schema'
import { eq, and } from 'drizzle-orm'
import { generateId, nowIso } from '@galaxy/shared'
import {
  extractAspectsFromConversation,
  loadAspectTemplates,
} from '@galaxy/ai'
import { ensureDb } from '@/lib/api/ensure-db'
import { buildRegistry, resolveDataDir } from '@/lib/api/build-registry'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/nodes/:id/extract-aspects
 * 从附件内容中提取维度信息并写入 aspects 表。
 *
 * Body: { content: string, sourceId?: string }
 *   - content: 附件的文本内容
 *   - sourceId: 可选，附件 ID（用作 aspect 来源标识）
 *
 * 提取到的维度信息会覆盖同 title 的现有维度内容。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  ensureDb()
  const nodeId = params.id
  const db = getDb()

  const node = db.select().from(nodes).where(eq(nodes.id, nodeId)).get()
  if (!node) {
    return NextResponse.json({ error: 'Node not found' }, { status: 404 })
  }

  const body = await request.json()
  const { content, sourceId } = body as { content?: string; sourceId?: string }

  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json(
      { error: 'content is required and must be a non-empty string' },
      { status: 400 },
    )
  }

  const { registry, defaultProviderId, defaultModel } = buildRegistry()
  const provider = registry.getOrThrow(defaultProviderId)

  const aspectsTemplatesDir = resolveDataDir('aspects')
  const templates = loadAspectTemplates(aspectsTemplatesDir)

  // 将附件内容构造为伪对话消息来调用提取
  const pseudoConversation = [
    { role: 'user', content: `以下是关于「${node.title}」的一份相关文档内容，请从中提取维度信息：\n\n${content.trim()}` },
  ]

  const extractResult = await extractAspectsFromConversation(
    node.title,
    pseudoConversation,
    templates,
    provider,
    defaultModel,
  )

  const now = nowIso()
  let updatedCount = 0
  let createdCount = 0

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
      // 覆盖模式：直接替换内容
      db.update(aspects)
        .set({ content: extracted.content, updated_at: now })
        .where(eq(aspects.id, existing.id))
        .run()
      updatedCount++
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
          source_type: 'attachment',
          source_id: sourceId ?? undefined,
          order: template.order,
          created_at: now,
          updated_at: now,
          created_by: 'ai_extract',
        })
        .run()
      createdCount++
    }
  }

  db.insert(operationLogs)
    .values({
      id: generateId('ol'),
      operation: 'extract_aspects',
      affected_ids: JSON.stringify([nodeId]),
      payload_snapshot: null,
      user_note: `AI 从文档提取切面：${createdCount} 个新建、${updatedCount} 个更新 (节点「${node.title}」)`,
      created_at: nowIso(),
    })
    .run()

  return NextResponse.json({
    data: {
      extractedCount: extractResult.aspects.length,
      updatedCount,
      createdCount,
    },
  })
}
