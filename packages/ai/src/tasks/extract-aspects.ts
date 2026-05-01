import type { LLMProvider } from '../providers/types'
import type { AspectTemplate } from '../context/aspect-templates'

export interface ExtractedAspect {
  title: string
  content: string
}

export interface ExtractAspectsResult {
  aspects: ExtractedAspect[]
}

/**
 * 从 Deep Dive 对话中自动提取内容到各个切面（跳过 my-thoughts）。
 * LLM 会分析对话内容，按照切面模板的描述和 AI prompt hint，
 * 将相关内容提取并填充到对应的切面中。
 */
export async function extractAspectsFromConversation(
  nodeTitle: string,
  messages: Array<{ role: string; content: string }>,
  templates: AspectTemplate[],
  provider: LLMProvider,
  model: string,
): Promise<ExtractAspectsResult> {
  const eligibleTemplates = templates.filter((t) => t.key !== 'my-thoughts')

  const conversationText = messages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join('\n\n')

  const templateDescriptions = eligibleTemplates
    .map((t) => `- title: "${t.title}", description: "${t.description}", hint: "${t.aiPromptHint ?? ''}"`)
    .join('\n')

  const prompt = `你是一个知识图谱切面提取助手。请分析以下围绕「${nodeTitle}」的 Deep Dive 对话，将对话中的关键信息提取并归类到对应的切面中。

## 可用切面
${templateDescriptions}

## 对话内容
${conversationText}

## 输出要求
请以 **纯 JSON** 格式输出，不要包含 markdown 代码块标记，结构如下：
{
  "aspects": [
    {
      "title": "切面的标题",
      "content": "提取的 markdown 格式内容"
    }
  ]
}

### 提取规则
1. 只提取对话中**确实讨论到**的内容，不要凭空编造
2. 每个切面的内容应该是**结构化的 markdown**，包含要点、关键信息
3. 如果对话中没有涉及某个切面的内容，**不要**在输出中包含该切面
4. 内容应该精炼、有条理，适合作为知识卡片阅读
5. 不要重复相同的信息到多个切面中，每条信息放到最合适的切面`

  const response = await provider.invoke({
    model,
    messages: [
      { role: 'system', content: '你是一个知识图谱切面提取助手，输出严格的 JSON 格式。' },
      { role: 'user', content: prompt },
    ],
    responseFormat: { type: 'json_object' },
    maxTokens: 8192,
    temperature: 0.3,
  })

  const parsed = JSON.parse(response.content) as ExtractAspectsResult

  const validTitles = new Set(eligibleTemplates.map((t) => t.title))
  const validAspects = (parsed.aspects ?? []).filter(
    (a) => validTitles.has(a.title) && a.content?.trim(),
  )

  return { aspects: validAspects }
}
