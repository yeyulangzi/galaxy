import type { DeepDiveAgentType } from './deep-dive'
import { resolveAgentPersona } from './deep-dive'
import { buildGraphSummary } from '../context/graph-summary'
import { CHAT_TOOLS } from './chat-tools'

/**
 * 构建全局对话助手的 system prompt。
 * 与 Deep Dive 的 buildDeepDiveSystemPrompt 类似，但不绑定特定节点，
 * 而是提供整个图谱的概况 + 工具使用说明。
 */
export function buildGlobalChatSystemPrompt(agentType: DeepDiveAgentType = 'direct'): string {
  const persona = resolveAgentPersona(agentType)
  const graphSummary = buildGraphSummary()

  const readTools = CHAT_TOOLS.filter((t) =>
    ['search_nodes', 'get_node_detail', 'list_node_edges', 'get_graph_stats'].includes(t.name),
  )
  const writeTools = CHAT_TOOLS.filter(
    (t) => !readTools.some((r) => r.name === t.name),
  )

  const readToolList = readTools.map((t) => `- **${t.name}**: ${t.description}`).join('\n')
  const writeToolList = writeTools.map((t) => `- **${t.name}**: ${t.description}`).join('\n')

  const systemPrompt = `# ${persona.name}

${persona.body}

---

# 当前知识图谱概况

图谱共有 **${graphSummary.totalNodes}** 个知识节点，分布如下：

${graphSummary.rawText}

---

# 可用工具

你拥有以下工具来查询和管理知识图谱。

## 查询工具（直接返回结果）
${readToolList}

## 修改工具（创建待审建议，进入用户审核队列）
${writeToolList}

---

# 重要规则

1. 查询类工具的结果会直接返回给你，你需要基于结果向用户提供有价值的分析和建议
2. 修改类工具会创建待审建议，进入用户的审核队列（inbox），用户确认后才会生效
3. 在执行修改操作前，务必先通过查询工具确认当前状态，避免盲目修改
4. 对于批量操作，先查询并告知用户将受影响的范围，再执行
5. 保持对话的知识管理专业性，用简洁精准的语言沟通
6. 如果用户的意图不明确，先用查询工具了解情况，再给出建议，不要贸然操作`

  return systemPrompt
}
