import type { DeepDiveAgentType } from './deep-dive'
import { resolveAgentPersona } from './deep-dive'
import { buildGraphSummary } from '../context/graph-summary'
import { CHAT_TOOLS } from './chat-tools'

interface ChatSystemPromptOptions {
  userProfile?: string
  globalMemory?: string
  conversationMemory?: string
  agentPromptContent?: string
}

/**
 * 判断字符串是否有实质内容（不只是空白或模板占位符）。
 */
function hasSubstantiveContent(text: string | undefined): text is string {
  if (!text) return false
  const trimmed = text.trim()
  if (trimmed.length === 0) return false
  // 如果内容只包含 markdown 标题 / 占位符标记而没有正文，视为无实质内容
  const lines = trimmed.split('\n').filter((line) => {
    const l = line.trim()
    return l.length > 0 && !l.startsWith('#') && !l.startsWith('---')
  })
  return lines.length > 0
}

/**
 * 构建全局对话助手的 system prompt。
 * 支持注入用户档案、全局记忆、对话记忆，以及自定义角色提示词。
 */
export function buildGlobalChatSystemPrompt(
  agentType: DeepDiveAgentType | string = 'direct',
  options?: ChatSystemPromptOptions,
): string {
  // ── 角色提示词 ──
  let personaName: string
  let personaBody: string

  if (options?.agentPromptContent) {
    personaName = agentType as string
    personaBody = options.agentPromptContent
  } else {
    const persona = resolveAgentPersona(agentType as DeepDiveAgentType)
    personaName = persona.name
    personaBody = persona.body
  }

  // ── 图谱概况 ──
  const graphSummary = buildGraphSummary()

  // ── 工具列表 ──
  const readTools = CHAT_TOOLS.filter((t) =>
    ['search_nodes', 'get_node_detail', 'list_node_edges', 'get_graph_stats'].includes(t.name),
  )
  const writeTools = CHAT_TOOLS.filter(
    (t) => !readTools.some((r) => r.name === t.name),
  )

  const readToolList = readTools.map((t) => `- **${t.name}**: ${t.description}`).join('\n')
  const writeToolList = writeTools.map((t) => `- **${t.name}**: ${t.description}`).join('\n')

  // ── 组装 prompt 各段 ──
  const sections: string[] = []

  // 1. 角色
  sections.push(`# ${personaName}\n\n${personaBody}`)

  // 2. 用户档案
  if (hasSubstantiveContent(options?.userProfile)) {
    sections.push(`# 关于用户\n\n${options!.userProfile!.trim()}`)
  }

  // 3. 全局记忆
  if (hasSubstantiveContent(options?.globalMemory)) {
    sections.push(`# 全局记忆（跨会话持久化）\n\n${options!.globalMemory!.trim()}`)
  }

  // 4. 对话记忆
  if (options?.conversationMemory?.trim()) {
    sections.push(`# 本次会话上下文\n\n${options.conversationMemory.trim()}`)
  }

  // 5. 图谱概况（简化）
  sections.push(
    `# 当前知识图谱概况\n\n图谱共有 **${graphSummary.totalNodes}** 个知识节点，需要时可以用工具查询。`,
  )

  // 6. 工具
  sections.push(
    `# 可用工具\n\n你拥有以下工具来查询和管理知识图谱。\n\n## 查询工具（直接返回结果）\n${readToolList}\n\n## 修改工具（创建待审建议，进入用户审核队列）\n${writeToolList}`,
  )

  // 7. 重要规则（新版编排）
  sections.push(
    `# 重要规则

1. **优先使用你的角色 prompt 来回答**。你的角色提示词是你行为的核心指南，请严格遵循
2. **不要主动查询知识图谱**，除非用户明确要求你去查询、搜索或操作图谱。图谱是辅助工具，不是每次对话的必要步骤
3. 只有用户明确说"搜一下"、"查查图谱"、"帮我在图谱里找"等类似表述时，再使用查询工具
4. 修改类工具会创建待审建议，进入用户的审核队列（inbox），用户确认后才会生效
5. 在执行修改操作前，务必先通过查询工具确认当前状态
6. 基于用户档案和记忆来个性化你的回答`,
  )

  return sections.join('\n\n---\n\n')
}
