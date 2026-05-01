import { getDb } from '@galaxy/db'
import { nodes } from '@galaxy/db/schema'

interface GraphSummaryResult {
  totalNodes: number
  domains: Array<{ domain: string; titles: string[] }>
  rawText: string
}

/**
 * 构建当前图谱的概要上下文，注入到 AI prompt 中。
 * 按 domain 分组列出所有节点标题。
 */
export function buildGraphSummary(): GraphSummaryResult {
  const db = getDb()
  const allNodes = db.select({ title: nodes.title, domain: nodes.domain }).from(nodes).all()

  const domainMap = new Map<string, string[]>()
  for (const node of allNodes) {
    const domain = node.domain ?? '未分类'
    const existing = domainMap.get(domain) ?? []
    existing.push(node.title)
    domainMap.set(domain, existing)
  }

  const domains = [...domainMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([domain, titles]) => ({ domain, titles }))

  // 提取已有的一级领域去重列表，供 domain 合并规则使用
  const topLevelDomains = [...new Set(
    domains.map((d) => d.domain.split('/')[0]).filter(Boolean),
  )].sort()

  const rawText = (topLevelDomains.length > 0
    ? `已有一级领域（必须优先复用，禁止自创语义相近的新领域）：${topLevelDomains.join('、')}\n\n`
    : '')
    + domains
      .map((d) => `【${d.domain}】${d.titles.join('、')}`)
      .join('\n')

  return { totalNodes: allNodes.length, domains, rawText }
}
