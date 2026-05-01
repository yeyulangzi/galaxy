import fs from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { getDb } from '@galaxy/db'
import { suggestions, feedItems, aiCallLogs, nodes } from '@galaxy/db/schema'
import { generateId, nowIso } from '@galaxy/shared'
import type { LLMProvider } from '../providers/types'
import { invokeStructured } from '../structured-output/strategy'
import { loadPromptTemplate } from '../context/prompt-loader'
import { buildGraphSummary } from '../context/graph-summary'
import { buildFeedbackContext } from '../feedback/prompt-injector'
import { calibrateConfidence } from '../feedback/calibrator'
import { FeedExtractionResultSchema, type FeedExtractionResult } from './schemas'

/**
 * 计算两个字符串的 bigram 相似度（Dice coefficient）。
 * 返回值范围 [0, 1]，1 表示完全相同。
 */
function bigramSimilarity(strA: string, strB: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const a = normalize(strA)
  const b = normalize(strB)

  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0

  const bigramsA = new Map<string, number>()
  for (let i = 0; i < a.length - 1; i++) {
    const bigram = a.substring(i, i + 2)
    bigramsA.set(bigram, (bigramsA.get(bigram) ?? 0) + 1)
  }

  let intersectionSize = 0
  for (let i = 0; i < b.length - 1; i++) {
    const bigram = b.substring(i, i + 2)
    const count = bigramsA.get(bigram)
    if (count && count > 0) {
      bigramsA.set(bigram, count - 1)
      intersectionSize++
    }
  }

  return (2 * intersectionSize) / (a.length - 1 + b.length - 1)
}

/**
 * 检查候选节点标题是否与已有节点重复。
 * 返回最相似的已有节点（相似度 > threshold）或 null。
 */
function findDuplicateNode(candidateTitle: string, threshold = 0.85): { id: string; title: string; similarity: number } | null {
  const db = getDb()
  const allNodes = db.select({ id: nodes.id, title: nodes.title }).from(nodes).all()

  let bestMatch: { id: string; title: string; similarity: number } | null = null

  for (const node of allNodes) {
    const similarity = bigramSimilarity(candidateTitle, node.title)
    if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = { id: node.id, title: node.title, similarity }
    }
  }

  return bestMatch
}

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

  // 2. 反馈注入：将历史反馈上下文追加到 system prompt
  const feedbackContext = buildFeedbackContext(db)
  const systemPrompt = '你是一个知识图谱助手，帮助用户从文本中抽取结构化知识。'
    + (feedbackContext ? `\n\n${feedbackContext}` : '')

  // 3. 调用 LLM
  const { data, response } = await invokeStructured({
    provider: input.provider,
    request: {
      model: input.model,
      messages: [
        { role: 'system', content: systemPrompt },
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

  // 4. 写入 suggestions
  const now = nowIso()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  let suggestionsCreated = 0

  for (const node of data.new_nodes) {
    const duplicate = findDuplicateNode(node.title)

    if (duplicate) {
      const calibratedConfidence = calibrateConfidence(db, node.confidence, 'merge_nodes', 'feed')
      db.insert(suggestions)
        .values({
          id: generateId('s'),
          type: 'merge_nodes',
          source: 'feed',
          source_ref_id: input.feedItemId,
          payload: JSON.stringify({
            node_titles: [duplicate.title, node.title],
            target_title: duplicate.title,
            rationale: `新投喂节点「${node.title}」与已有节点「${duplicate.title}」相似度 ${(duplicate.similarity * 100).toFixed(0)}%，建议合并`,
            new_node_data: node,
          }),
          rationale: `检测到相似节点（${(duplicate.similarity * 100).toFixed(0)}%），建议合并而非新建`,
          confidence: node.confidence,
          calibrated_confidence: calibratedConfidence,
          status: 'pending',
          created_at: now,
          expires_at: expiresAt,
          provider_id: input.provider.id,
          model: input.model,
        })
        .run()
    } else {
      const calibratedConfidence = calibrateConfidence(db, node.confidence, 'new_node', 'feed')
      db.insert(suggestions)
        .values({
          id: generateId('s'),
          type: 'new_node',
          source: 'feed',
          source_ref_id: input.feedItemId,
          payload: JSON.stringify(node),
          rationale: node.rationale,
          confidence: node.confidence,
          calibrated_confidence: calibratedConfidence,
          status: 'pending',
          created_at: now,
          expires_at: expiresAt,
          provider_id: input.provider.id,
          model: input.model,
        })
        .run()
    }
    suggestionsCreated++
  }

  for (const edge of data.new_edges ?? []) {
    const calibratedConfidence = calibrateConfidence(db, edge.confidence, 'new_edge', 'feed')
    db.insert(suggestions)
      .values({
        id: generateId('s'),
        type: 'new_edge',
        source: 'feed',
        source_ref_id: input.feedItemId,
        payload: JSON.stringify(edge),
        rationale: edge.rationale,
        confidence: edge.confidence,
        calibrated_confidence: calibratedConfidence,
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
    const calibratedConfidence = calibrateConfidence(db, aspect.confidence, 'fill_aspect', 'feed')
    db.insert(suggestions)
      .values({
        id: generateId('s'),
        type: 'fill_aspect',
        source: 'feed',
        source_ref_id: input.feedItemId,
        payload: JSON.stringify(aspect),
        rationale: aspect.rationale,
        confidence: aspect.confidence,
        calibrated_confidence: calibratedConfidence,
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
    result: { ...data, new_edges: data.new_edges ?? [], fill_aspects: data.fill_aspects ?? [] },
    suggestionsCreated,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    costUsd,
    durationMs,
  }
}
