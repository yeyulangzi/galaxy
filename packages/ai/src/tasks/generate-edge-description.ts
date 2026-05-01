import type { LLMProvider } from '../providers/types'

export interface EdgeDescriptionInput {
  sourceTitle: string
  sourceSummary: string | null
  targetTitle: string
  targetSummary: string | null
  relationType: string
}

export interface EdgeDescriptionResult {
  description: string
  weight: number
}

/**
 * 根据两个节点的标题和摘要，用 AI 生成它们之间的内在关联描述和关联系数。
 */
export async function generateEdgeDescription(
  input: EdgeDescriptionInput,
  provider: LLMProvider,
  model: string,
): Promise<EdgeDescriptionResult> {
  const sourceInfo = input.sourceSummary
    ? `「${input.sourceTitle}」：${input.sourceSummary}`
    : `「${input.sourceTitle}」`
  const targetInfo = input.targetSummary
    ? `「${input.targetTitle}」：${input.targetSummary}`
    : `「${input.targetTitle}」`

  const prompt = `你是一个知识图谱关系分析助手。请分析以下两个概念之间的内在关联。

## 概念 A
${sourceInfo}

## 概念 B
${targetInfo}

## 关系类型
${input.relationType}

## 输出要求
请以 **纯 JSON** 格式输出，不要包含 markdown 代码块标记，结构如下：
{
  "description": "两个概念之间的内在关联描述，2-4 句话，说明它们为什么相关、在什么层面上存在联系",
  "weight": 0.75
}

### 分析规则
1. description 应揭示两者深层的逻辑联系，而非仅仅罗列表面相似性
2. 用中文撰写，语言精炼有洞察力
3. weight 是关联强度，范围 0.1 到 1.0：
   - 0.1-0.3: 弱关联，只在某个侧面有间接联系
   - 0.4-0.6: 中等关联，在某些维度上有明确联系
   - 0.7-0.9: 强关联，在核心层面紧密相关
   - 1.0: 极强关联，本质上不可分离`

  const response = await provider.invoke({
    model,
    messages: [
      { role: 'system', content: '你是一个知识图谱关系分析助手，输出严格的 JSON 格式。' },
      { role: 'user', content: prompt },
    ],
    responseFormat: { type: 'json_object' },
    maxTokens: 1024,
    temperature: 0.4,
  })

  const parsed = JSON.parse(response.content) as EdgeDescriptionResult
  const weight = Math.max(0.1, Math.min(1.0, parsed.weight ?? 0.5))

  return {
    description: parsed.description?.trim() ?? '',
    weight,
  }
}
