import type { LLMProvider } from '../providers/types'

export interface ConversationSummary {
  title: string
  markdown: string
  keyInsights: string[]
  actionItems: string[]
}

/**
 * 构建对话总结的 system prompt。
 * 要求 AI 从对话中提取关键要点、新见解和行动项，返回 markdown 格式。
 */
export function buildSummarizePrompt(
  nodeTitle: string,
  messages: Array<{ role: string; content: string }>,
): string {
  const conversationText = messages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join('\n\n')

  return `你是一个知识图谱对话总结助手。请对以下围绕「${nodeTitle}」的 Deep Dive 对话进行全面总结。

## 对话内容
${conversationText}

## 输出要求
请以 **纯 JSON** 格式输出，不要包含 markdown 代码块标记，结构如下：
{
  "title": "简短的总结标题（10字以内）",
  "markdown": "完整的 markdown 格式总结，包含关键讨论点、结论和上下文",
  "keyInsights": ["洞见1", "洞见2", ...],
  "actionItems": ["行动项1", "行动项2", ...]
}

### 总结要点
1. **关键讨论点**：对话中探讨的核心主题和观点
2. **新见解**（keyInsights）：对话中产生的新发现、新理解或新关联
3. **行动项**（actionItems）：对话中明确或隐含的后续行动建议
4. **结论**：对话的总体结论和共识

确保 markdown 字段内容结构清晰、重点突出，适合作为知识归档阅读。`
}

/**
 * 调用 LLM 执行对话总结，返回结构化的 ConversationSummary。
 */
export async function summarizeConversation(
  nodeTitle: string,
  messages: Array<{ role: string; content: string }>,
  provider: LLMProvider,
  model: string,
): Promise<ConversationSummary> {
  const prompt = buildSummarizePrompt(nodeTitle, messages)

  const response = await provider.invoke({
    model,
    messages: [
      { role: 'system', content: '你是一个知识图谱对话总结助手，输出严格的 JSON 格式。' },
      { role: 'user', content: prompt },
    ],
    responseFormat: { type: 'json_object' },
    maxTokens: 4096,
    temperature: 0.3,
  })

  const parsed = JSON.parse(response.content) as ConversationSummary

  return {
    title: parsed.title ?? '对话总结',
    markdown: parsed.markdown ?? '',
    keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [],
    actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
  }
}
