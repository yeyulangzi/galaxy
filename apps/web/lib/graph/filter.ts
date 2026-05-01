/**
 * 图谱过滤器纯函数 —— 不依赖任何 React/Next.js 模块，可在 SSR 和客户端安全使用。
 * 从 graph-filter-panel.tsx 中抽出，避免静态 import 时把 useGraphViewStore 拉进 SSR。
 */

export function applyGraphFilter<
  N extends { id: string; domain?: string | null; created_by?: string | null; node_type?: string | null; channel?: string | null; internalization_status?: string | null },
  E extends { source_node_id: string; target_node_id: string; weight?: number },
>(
  nodes: N[],
  edges: E[],
  filter: {
    domains: string[]
    hideIsolated: boolean
    hiddenCreators: string[]
    nodeTypes?: string[]
    channels?: string[]
    statuses?: string[]
    weightRange?: [number, number]
  },
): { nodes: N[]; edges: E[] } {
  // 1. 按 domain + creator + node_type + channel + status 过滤节点
  let filteredNodes = nodes.filter((n) => {
    if (filter.domains.length > 0) {
      // 支持前缀匹配：选中"互联网"时，"互联网/产品方法论"也会通过
      if (!n.domain || !filter.domains.some((d) => n.domain === d || n.domain!.startsWith(d + '/'))) return false
    }
    if (n.created_by && filter.hiddenCreators.includes(n.created_by)) return false
    if (filter.nodeTypes && filter.nodeTypes.length > 0) {
      if (!n.node_type || !filter.nodeTypes.includes(n.node_type)) return false
    }
    if (filter.channels && filter.channels.length > 0) {
      if (!n.channel || !filter.channels.includes(n.channel)) return false
    }
    if (filter.statuses && filter.statuses.length > 0) {
      if (!n.internalization_status || !filter.statuses.includes(n.internalization_status)) return false
    }
    return true
  })

  // 2. 过滤边（两端必须都在节点列表中 + weight 在区间内）
  const nodeIdSet = new Set(filteredNodes.map((n) => n.id))
  const [weightMin, weightMax] = filter.weightRange ?? [0, 1]
  const hasWeightFilter = weightMin > 0 || weightMax < 1
  const filteredEdges = edges.filter((e) => {
    if (!nodeIdSet.has(e.source_node_id) || !nodeIdSet.has(e.target_node_id)) return false
    if (hasWeightFilter) {
      const weight = e.weight ?? 0
      if (weight < weightMin || weight > weightMax) return false
    }
    return true
  })

  // 3. 隐藏孤立节点（基于已过滤的边）
  if (filter.hideIsolated) {
    const connected = new Set<string>()
    for (const e of filteredEdges) {
      connected.add(e.source_node_id)
      connected.add(e.target_node_id)
    }
    filteredNodes = filteredNodes.filter((n) => connected.has(n.id))
  }

  return { nodes: filteredNodes, edges: filteredEdges }
}