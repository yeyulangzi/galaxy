import { getDb } from '@galaxy/db'
import { nodes, edges } from '@galaxy/db/schema'
import { sql, eq, and, lt, count } from 'drizzle-orm'

export interface ScanTarget {
  nodeIds: string[]
  reason: string
  strategy: string
}

/**
 * Islands 策略：查找图谱中孤立的节点（degree=0 或只有 1 条边），
 * 建议为它们添加关联。
 */
export function findIslands(db: ReturnType<typeof getDb>): ScanTarget[] {
  const allNodes = db
    .select({ id: nodes.id, title: nodes.title })
    .from(nodes)
    .where(eq(nodes.status, 'active'))
    .all()

  const targets: ScanTarget[] = []

  for (const node of allNodes) {
    const edgeCount = db
      .select({ cnt: count() })
      .from(edges)
      .where(
        sql`${edges.source_node_id} = ${node.id} OR ${edges.target_node_id} = ${node.id}`,
      )
      .get()

    const degree = edgeCount?.cnt ?? 0
    if (degree <= 1) {
      targets.push({
        nodeIds: [node.id],
        reason: degree === 0
          ? `节点「${node.title}」是孤岛节点，没有任何关联`
          : `节点「${node.title}」仅有 1 条边，关联度很低`,
        strategy: 'islands',
      })
    }
  }

  return targets
}

/**
 * Gaps 策略：查找同一 domain 下互相没有直接边的节点对，
 * 建议它们之间建立关联。
 */
export function findGaps(db: ReturnType<typeof getDb>): ScanTarget[] {
  const allNodes = db
    .select({ id: nodes.id, title: nodes.title, domain: nodes.domain })
    .from(nodes)
    .where(eq(nodes.status, 'active'))
    .all()

  const domainMap = new Map<string, typeof allNodes>()
  for (const node of allNodes) {
    const domain = node.domain ?? '未分类'
    const existing = domainMap.get(domain) ?? []
    existing.push(node)
    domainMap.set(domain, existing)
  }

  const targets: ScanTarget[] = []

  for (const [domain, domainNodes] of domainMap) {
    if (domainNodes.length < 2) continue

    for (let i = 0; i < domainNodes.length; i++) {
      for (let j = i + 1; j < domainNodes.length; j++) {
        const nodeA = domainNodes[i]!
        const nodeB = domainNodes[j]!

        const existingEdge = db
          .select({ id: edges.id })
          .from(edges)
          .where(
            sql`(${edges.source_node_id} = ${nodeA.id} AND ${edges.target_node_id} = ${nodeB.id})
             OR (${edges.source_node_id} = ${nodeB.id} AND ${edges.target_node_id} = ${nodeA.id})`,
          )
          .get()

        if (!existingEdge) {
          targets.push({
            nodeIds: [nodeA.id, nodeB.id],
            reason: `同属「${domain}」领域的「${nodeA.title}」和「${nodeB.title}」之间缺少关联`,
            strategy: 'gaps',
          })
        }
      }
    }
  }

  return targets
}

/**
 * Aging 策略：查找超过 30 天没有更新的节点，
 * 建议补充或更新内容。
 */
export function findAgingNodes(db: ReturnType<typeof getDb>): ScanTarget[] {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const agingNodeRows = db
    .select({ id: nodes.id, title: nodes.title, updated_at: nodes.updated_at })
    .from(nodes)
    .where(and(eq(nodes.status, 'active'), lt(nodes.updated_at, thirtyDaysAgo)))
    .all()

  return agingNodeRows.map((node) => ({
    nodeIds: [node.id],
    reason: `节点「${node.title}」已超过 30 天未更新（上次更新：${node.updated_at.slice(0, 10)}）`,
    strategy: 'aging',
  }))
}

const STRATEGY_FUNCTIONS: Record<string, (db: ReturnType<typeof getDb>) => ScanTarget[]> = {
  islands: findIslands,
  gaps: findGaps,
  aging: findAgingNodes,
}

/**
 * 根据策略名称列表批量执行策略并收集 targets。
 */
export function collectTargets(
  db: ReturnType<typeof getDb>,
  strategies: string[],
): ScanTarget[] {
  const targets: ScanTarget[] = []
  for (const strategy of strategies) {
    const fn = STRATEGY_FUNCTIONS[strategy]
    if (fn) {
      targets.push(...fn(db))
    }
  }
  return targets
}
