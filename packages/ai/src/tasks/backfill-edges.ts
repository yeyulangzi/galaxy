import type { LLMProvider } from '../providers/types'

export interface BackfillNodeInfo {
  id: string
  title: string
  summary: string | null
  domain: string | null
}

export interface BackfillSuggestedEdge {
  targetTitle: string
  relationType: string
  confidence: number
  rationale: string
}

export interface BackfillResult {
  anchorId: string
  anchorTitle: string
  suggestedEdges: BackfillSuggestedEdge[]
}

const RELATION_TYPES = ['contains', 'related', 'opposes', 'instance_of', 'evolved_from', 'cites', 'evidence_for', 'evidence_against', 'refines'] as const

/**
 * 为一个 anchor 节点找出应该关联但还未关联的其他节点。
 * 只发送标题列表给 AI（节省 token），由 AI 判断哪些应该建立关联。
 */
export async function backfillEdgesForNode(
  anchor: BackfillNodeInfo,
  candidates: Array<{ title: string }>,
  existingTargetTitles: Set<string>,
  provider: LLMProvider,
  model: string,
): Promise<BackfillSuggestedEdge[]> {
  // 过滤掉已有边的候选节点和自身
  const filteredCandidates = candidates
    .filter((c) => c.title !== anchor.title && !existingTargetTitles.has(c.title))

  if (filteredCandidates.length === 0) return []

  const candidateList = filteredCandidates.map((c) => c.title).join('\n- ')

  const anchorInfo = anchor.summary
    ? `「${anchor.title}」(${anchor.domain ?? '未分类'})：${anchor.summary}`
    : `「${anchor.title}」(${anchor.domain ?? '未分类'})`

  const prompt = `你是一个知识图谱关系分析助手。请判断以下"目标节点"与哪些"候选节点"之间存在有意义的知识关联。

## 目标节点
${anchorInfo}

## 候选节点列表
- ${candidateList}

## 可用的关系类型
${RELATION_TYPES.join(', ')}

## 输出要求
请以 **纯 JSON 数组** 格式输出（不要 markdown 代码块），只输出**确实存在有意义关联**的节点。
每项结构：
{
  "targetTitle": "候选节点标题（必须与上面的候选列表中的标题完全一致）",
  "relationType": "关系类型",
  "confidence": 0.8,
  "rationale": "一句话说明关联理由"
}

### 规则
1. **质量优于数量**：只输出你非常确信存在关联的（confidence ≥ 0.6），宁缺毋滥
2. 最多输出 5 条关联，优先输出最强的
3. 如果没有值得关联的节点，输出空数组 []
4. targetTitle 必须与候选列表完全匹配，不要自己编造
5. confidence 范围 0.6-1.0`

  const response = await provider.invoke({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 1500,
  })

  const text = response.content.trim()
  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item: any) =>
          item.targetTitle &&
          item.relationType &&
          typeof item.confidence === 'number' &&
          item.confidence >= 0.6 &&
          filteredCandidates.some((c) => c.title === item.targetTitle),
      )
      .map((item: any) => ({
        targetTitle: item.targetTitle,
        relationType: item.relationType,
        confidence: item.confidence,
        rationale: item.rationale ?? '',
      }))
  } catch {
    return []
  }
}
