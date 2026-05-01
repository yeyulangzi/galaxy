import { getDb } from '@galaxy/db'
import { suggestions, scanRuns, aiCallLogs } from '@galaxy/db/schema'
import { generateId, nowIso } from '@galaxy/shared'
import { eq } from 'drizzle-orm'
import type { LLMProvider } from '../providers/types'
import { invokeStructured } from '../structured-output/strategy'
import { buildGraphSummary } from '../context/graph-summary'
import { addCost } from '../budget'
import { collectTargets, type ScanTarget } from './scan-strategies'
import { getAdjustedStrategies } from '../feedback/strategy-adjuster'
import { buildFeedbackContext } from '../feedback/prompt-injector'
import { calibrateConfidence } from '../feedback/calibrator'
import { z } from 'zod'

export interface RunScanOptions {
  strategies: string[]
  provider: LLMProvider
  model: string
  maxSuggestions: number
  scanRunId: string
}

export interface ScanResult {
  suggestionsCreated: number
  totalTokens: number
  costUsd: number
  targets: ScanTarget[]
}

const ScanSuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      type: z.enum(['new_node', 'new_edge', 'fill_aspect', 'update_aspect', 'merge_nodes']),
      payload: z.record(z.unknown()),
      rationale: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
})

/**
 * 构建扫描 prompt，将 targets 和图谱上下文注入。
 */
function buildScanPrompt(targets: ScanTarget[], graphSummary: string): string {
  const targetDescriptions = targets
    .map((target, index) => `${index + 1}. [${target.strategy}] ${target.reason}`)
    .join('\n')

  return `你是一个知识图谱优化助手。以下是当前图谱的概况：

${graphSummary}

以下是通过自动扫描发现的图谱不足之处：

${targetDescriptions}

请针对上述问题，生成具体的改进建议。每条建议需要包含：
- type: 建议类型（new_node / new_edge / fill_aspect / update_aspect / merge_nodes）
- payload: 具体内容（JSON 对象）
  - 对于 new_node：{ title, summary, domain (必须从已有分类中选择，如 "互联网/产品设计"、"互联网/运营体系"、"互联网/用户与社群"、"互联网/数据与增长"、"互联网/市场与商业"、"互联网/平台与组织"，可追加三级), node_type (concept/claim/case/resource), channel (core/light), suggested_edges: [{ target_node_title, relation_type }] }
  - 对于 new_edge：{ source_title, target_title, relation_type, origin (ai_suggested) }
  - 对于 fill_aspect：{ node_title, aspect_title, content }
  - 对于 update_aspect：{ node_title, aspect_title, content }
  - 对于 merge_nodes：{ node_titles: string[], merged_title, reason }
- rationale: 建议理由
- confidence: 置信度 (0-1)

请以 JSON 格式输出，格式为 { "suggestions": [...] }。`
}

/**
 * 执行一次完整的图谱扫描：
 * 1. 按策略收集 targets
 * 2. 构建 prompt 调用 LLM
 * 3. 将结果写入 suggestions 表（source=proactive_scan）
 * 4. 更新 scan_runs 记录
 */
export async function runScan(options: RunScanOptions): Promise<ScanResult> {
  const { strategies, provider, model, maxSuggestions, scanRunId } = options
  const db = getDb()

  try {
    // 1. 策略调整：通过反馈系统调整策略权重并过滤暂停策略
    const adjusted = getAdjustedStrategies(db, strategies)
    if (adjusted.paused.length > 0) {
      console.log(`[runScan] Paused strategies (excluded): ${adjusted.paused.join(', ')}`)
    }

    // 2. 收集 targets
    const targets = collectTargets(db, adjusted.strategies)

    if (targets.length === 0) {
      db.update(scanRuns)
        .set({
          status: 'done',
          finished_at: nowIso(),
          suggestions_count: 0,
          scope: JSON.stringify({ strategies, targetsFound: 0 }),
        })
        .where(eq(scanRuns.id, scanRunId))
        .run()
      return { suggestionsCreated: 0, totalTokens: 0, costUsd: 0, targets: [] }
    }

    // 限制 targets 数量避免 prompt 过长
    const limitedTargets = targets.slice(0, maxSuggestions * 2)

    // 2. 构建 prompt 并调用 LLM
    const graphSummary = buildGraphSummary()
    const graphContext = graphSummary.totalNodes > 0
      ? `当前图谱共有 ${graphSummary.totalNodes} 个节点：\n${graphSummary.rawText}`
      : '当前图谱为空。'

    const prompt = buildScanPrompt(limitedTargets, graphContext)

    // 反馈注入：将历史反馈上下文追加到 system prompt
    const feedbackContext = buildFeedbackContext(db)
    const systemPrompt = '你是一个知识图谱优化助手，帮助用户发现和填补图谱中的不足。'
      + (feedbackContext ? `\n\n${feedbackContext}` : '')

    const { data, response } = await invokeStructured({
      provider,
      request: {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        maxTokens: 131072,
        temperature: 0.4,
      },
      schema: ScanSuggestionSchema,
      toolName: 'scan_suggestions',
      toolDescription: '生成图谱改进建议',
    })

    const costUsd = provider.estimateCost(response.usage, model)
    const totalTokens = response.usage.inputTokens + response.usage.outputTokens

    // 3. 写入 suggestions 表
    const now = nowIso()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const limitedSuggestions = data.suggestions.slice(0, maxSuggestions)
    let suggestionsCreated = 0

    for (const suggestion of limitedSuggestions) {
      const calibratedConfidence = calibrateConfidence(db, suggestion.confidence, suggestion.type, 'proactive_scan')
      db.insert(suggestions)
        .values({
          id: generateId('s'),
          type: suggestion.type,
          source: 'proactive_scan',
          source_ref_id: scanRunId,
          payload: JSON.stringify(suggestion.payload),
          rationale: suggestion.rationale,
          confidence: suggestion.confidence,
          calibrated_confidence: calibratedConfidence,
          status: 'pending',
          created_at: now,
          expires_at: expiresAt,
          provider_id: provider.id,
          model,
        })
        .run()
      suggestionsCreated++
    }

    // 4. 写入 ai_call_logs
    db.insert(aiCallLogs)
      .values({
        id: generateId('l'),
        channel: 'direct',
        task: 'proactive_scan',
        provider_id: provider.id,
        model,
        input_tokens: response.usage.inputTokens,
        output_tokens: response.usage.outputTokens,
        cost_usd: costUsd,
        duration_ms: 0,
        status: 'success',
        created_at: now,
      })
      .run()

    // 5. 累加预算
    addCost(costUsd)

    // 6. 更新 scan_runs
    db.update(scanRuns)
      .set({
        status: 'done',
        finished_at: nowIso(),
        suggestions_count: suggestionsCreated,
        cost_tokens: totalTokens,
        cost_usd: costUsd,
        scope: JSON.stringify({ strategies, targetsFound: targets.length }),
      })
      .where(eq(scanRuns.id, scanRunId))
      .run()

    return { suggestionsCreated, totalTokens, costUsd, targets: limitedTargets }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    db.update(scanRuns)
      .set({
        status: 'failed',
        finished_at: nowIso(),
        error_message: errorMessage,
      })
      .where(eq(scanRuns.id, scanRunId))
      .run()
    throw error
  }
}
