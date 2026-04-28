import fs from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { getDb } from '@galaxy/db'
import { suggestions, feedItems, aiCallLogs } from '@galaxy/db/schema'
import { generateId, nowIso } from '@galaxy/shared'
import type { LLMProvider } from '../providers/types'
import { invokeStructured } from '../structured-output/strategy'
import { loadPromptTemplate } from '../context/prompt-loader'
import { buildGraphSummary } from '../context/graph-summary'
import { FeedExtractionResultSchema, type FeedExtractionResult } from './schemas'

export interface ExtractFromFeedInput {
  feedItemId: string
  parsedContent: string
  provider: LLMProvider
  model: string
  promptsDir: string
}

export interface ExtractFromFeedOutput {
  result: FeedExtractionResult
  suggestionsCreated: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  durationMs: number
}

/**
 * 从 _shared/output-format.md 读取输出格式说明。
 */
function getOutputFormatInstruction(promptsDir: string): string {
  const filePath = path.join(promptsDir, '_shared', 'output-format.md')
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8')
  }
  return '请以 JSON 格式输出结果。'
}

/**
 * 投喂抽取任务：
 * 1. 构建 prompt（模板 + 图谱上下文 + 投喂内容）
 * 2. 调用 LLM 获取结构化输出
 * 3. 写入 suggestions 表
 * 4. 写入 ai_call_logs 表
 */
export async function extractFromFeed(input: ExtractFromFeedInput): Promise<ExtractFromFeedOutput> {
  const startTime = Date.now()
  const db = getDb()

  // 1. 构建 prompt（单次模板编译，output_format 直接内联）
  const graphSummary = buildGraphSummary()
  const template = loadPromptTemplate('extract-from-feed', input.promptsDir)
  const finalPrompt = template({
    graph_summary: graphSummary.totalNodes > 0
      ? `当前图谱共有 ${graphSummary.totalNodes} 个节点：\n${graphSummary.rawText}`
      : '当前图谱为空，这是第一次投喂。',
    feed_content: input.parsedContent,
    output_format_instruction: getOutputFormatInstruction(input.promptsDir),
  })

  // 2. 调用 LLM
  const { data, response } = await invokeStructured({
    provider: input.provider,
    request: {
      model: input.model,
      messages: [
        { role: 'system', content: '你是一个知识图谱助手，帮助用户从文本中抽取结构化知识。' },
        { role: 'user', content: finalPrompt },
      ],
      maxTokens: 262144,
      temperature: 0.3,
    },
    schema: FeedExtractionResultSchema,
    toolName: 'extract_knowledge',
    toolDescription: '从投喂内容中抽取候选知识节点和关联',
  })

  const durationMs = Date.now() - startTime
  const costUsd = input.provider.estimateCost(response.usage, input.model)

  // 3. 写入 suggestions
  const now = nowIso()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  let suggestionsCreated = 0

  for (const node of data.new_nodes) {
    db.insert(suggestions)
      .values({
        id: generateId('s'),
        type: 'new_node',
        source: 'feed',
        source_ref_id: input.feedItemId,
        payload: JSON.stringify(node),
        rationale: node.rationale,
        confidence: node.confidence,
        status: 'pending',
        created_at: now,
        expires_at: expiresAt,
        provider_id: input.provider.id,
        model: input.model,
      })
      .run()
    suggestionsCreated++
  }

  for (const edge of data.new_edges ?? []) {
    db.insert(suggestions)
      .values({
        id: generateId('s'),
        type: 'new_edge',
        source: 'feed',
        source_ref_id: input.feedItemId,
        payload: JSON.stringify(edge),
        rationale: edge.rationale,
        confidence: edge.confidence,
        status: 'pending',
        created_at: now,
        expires_at: expiresAt,
        provider_id: input.provider.id,
        model: input.model,
      })
      .run()
    suggestionsCreated++
  }

  for (const aspect of data.fill_aspects ?? []) {
    db.insert(suggestions)
      .values({
        id: generateId('s'),
        type: 'fill_aspect',
        source: 'feed',
        source_ref_id: input.feedItemId,
        payload: JSON.stringify(aspect),
        rationale: aspect.rationale,
        confidence: aspect.confidence,
        status: 'pending',
        created_at: now,
        expires_at: expiresAt,
        provider_id: input.provider.id,
        model: input.model,
      })
      .run()
    suggestionsCreated++
  }

  // 4. 更新 feed_items
  db.update(feedItems)
    .set({ status: 'done', suggestions_count: suggestionsCreated })
    .where(eq(feedItems.id, input.feedItemId))
    .run()

  // 5. 写入 ai_call_logs
  db.insert(aiCallLogs)
    .values({
      id: generateId('l'),
      channel: 'direct',
      task: 'extract_from_feed',
      provider_id: input.provider.id,
      model: input.model,
      input_tokens: response.usage.inputTokens,
      output_tokens: response.usage.outputTokens,
      cost_usd: costUsd,
      duration_ms: durationMs,
      status: 'success',
      created_at: now,
    })
    .run()

  return {
    result: { ...data, new_edges: data.new_edges ?? [] },
    suggestionsCreated,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    costUsd,
    durationMs,
  }
}
