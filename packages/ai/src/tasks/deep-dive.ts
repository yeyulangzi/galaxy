import type { LLMProvider, Message } from '../providers/types'
import { invokeStructured } from '../structured-output/strategy'
import { FeedExtractionResultSchema, type FeedExtractionResult } from './schemas'

export interface DeepDiveContext {
  nodeId: string
  nodeTitle: string
  nodeSummary: string
  nodeDomain: string
  aspects: Array<{ title: string; content: string }>
}

/**
 * 构建 Deep Dive 对话的 system prompt，包含节点上下文信息。
 */
export function buildDeepDiveSystemPrompt(context: DeepDiveContext): string {
  const aspectBlock = context.aspects.length > 0
    ? context.aspects.map((a) => `### ${a.title}\n${a.content}`).join('\n\n')
    : '（暂无切面信息）'

  return `你是一个知识图谱深度对话助手。你正在与用户围绕以下知识节点进行深度探讨。

## 当前节点
- **标题**：${context.nodeTitle}
- **领域**：${context.nodeDomain}
- **摘要**：${context.nodeSummary}

## 已有切面
${aspectBlock}

## 你的职责
1. 围绕该节点与用户展开深入对话，帮助用户厘清概念、发现关联、挖掘洞见。
2. 在对话中主动提出有启发性的问题，引导用户思考更深层的联系。
3. 如果用户提出了新的知识点或关联，帮助用户整理归纳。
4. 保持专业、友好且富有启发性的对话风格。`
}

/**
 * 从 Deep Dive 对话历史中提取可落库的知识建议（新节点、新关联、切面补充）。
 */
export async function extractSuggestionsFromConversation(
  messages: Array<{ role: string; content: string }>,
  provider: LLMProvider,
  model: string,
): Promise<FeedExtractionResult> {
  const conversationText = messages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join('\n\n')

  const extractionPrompt = `请从以下深度对话中提取可以落库的知识建议。包括：
1. 对话中发现的新知识节点（new_nodes）
2. 节点之间的新关联关系（new_edges）
3. 对已有节点的切面补充（fill_aspects）

只提取有实质价值、在对话中被充分讨论过的内容，不要提取模糊或不确定的信息。

## 对话内容
${conversationText}

请以结构化 JSON 格式输出结果。`

  const { data } = await invokeStructured({
    provider,
    request: {
      model,
      messages: [
        { role: 'system', content: '你是一个知识抽取助手，从对话中提取结构化知识。' },
        { role: 'user', content: extractionPrompt },
      ],
      maxTokens: 16384,
      temperature: 0.2,
    },
    schema: FeedExtractionResultSchema,
    toolName: 'extract_deep_dive_suggestions',
    toolDescription: '从深度对话中提取候选知识节点和关联',
  })

  return { ...data, new_edges: data.new_edges ?? [] }
}
