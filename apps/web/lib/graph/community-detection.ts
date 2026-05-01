/**
 * 轻量 Louvain 社区检测算法
 * 用于自动给节点分群着色
 *
 * 参考：Blondel et al. 2008 Fast unfolding of communities in large networks
 * 这是简化版，单层 Louvain（不做层级折叠），对 < 1000 节点足够
 */

interface Edge {
  source: string
  target: string
  weight: number
}

/**
 * 检测社区
 * @returns Map<nodeId, communityId>
 */
export function detectCommunities(
  nodeIds: string[],
  edges: Edge[],
  options: { maxIterations?: number; resolution?: number } = {},
): Map<string, number> {
  const { maxIterations = 30, resolution = 1 } = options
  if (nodeIds.length === 0) return new Map()

  // 1. 构建邻接表 + 节点权重
  const adj = new Map<string, Map<string, number>>()
  for (const id of nodeIds) adj.set(id, new Map())
  let totalWeight = 0
  for (const e of edges) {
    if (!adj.has(e.source) || !adj.has(e.target)) continue
    if (e.source === e.target) continue
    const w = e.weight
    adj.get(e.source)!.set(e.target, (adj.get(e.source)!.get(e.target) ?? 0) + w)
    adj.get(e.target)!.set(e.source, (adj.get(e.target)!.get(e.source) ?? 0) + w)
    totalWeight += w
  }
  const m2 = totalWeight * 2 // 2m

  if (m2 === 0) {
    // 没有边：每个节点独立社区
    const result = new Map<string, number>()
    nodeIds.forEach((id, i) => result.set(id, i))
    return result
  }

  // 节点权重（k_i = sum of weights of edges incident to i）
  const nodeWeight = new Map<string, number>()
  for (const id of nodeIds) {
    let w = 0
    for (const v of adj.get(id)!.values()) w += v
    nodeWeight.set(id, w)
  }

  // 2. 初始化：每个节点自成一个社区
  const community = new Map<string, number>()
  nodeIds.forEach((id, i) => community.set(id, i))
  // 社区总权重 sum_tot
  const sumTot = new Map<number, number>()
  for (const id of nodeIds) sumTot.set(community.get(id)!, nodeWeight.get(id)!)

  // 3. 迭代：每个节点尝试加入邻居所在的社区，直到没有变化
  let improved = true
  let iter = 0
  while (improved && iter < maxIterations) {
    improved = false
    iter++
    // 随机化遍历顺序，提高收敛质量
    const shuffled = nodeIds.slice().sort(() => Math.random() - 0.5)
    for (const i of shuffled) {
      const ci = community.get(i)!
      const ki = nodeWeight.get(i)!
      // 邻居社区 → 到该社区的权重
      const neighCom = new Map<number, number>()
      for (const [j, w] of adj.get(i)!) {
        const cj = community.get(j)!
        neighCom.set(cj, (neighCom.get(cj) ?? 0) + w)
      }
      // 从原社区移除
      sumTot.set(ci, (sumTot.get(ci) ?? 0) - ki)
      const kiInOld = neighCom.get(ci) ?? 0
      // 找最佳社区
      let bestCom = ci
      let bestGain = 0
      for (const [c, kiIn] of neighCom) {
        const tot = sumTot.get(c) ?? 0
        // ΔQ = (k_i,in / m) - resolution * (sum_tot * k_i) / (2m^2)
        const gain = kiIn / totalWeight - (resolution * tot * ki) / (m2 * totalWeight)
        if (gain > bestGain) {
          bestGain = gain
          bestCom = c
        }
      }
      // 重新计算回原社区的 gain（可能仍是最佳）
      const gainOld =
        kiInOld / totalWeight -
        (resolution * (sumTot.get(ci) ?? 0) * ki) / (m2 * totalWeight)
      if (gainOld >= bestGain) bestCom = ci
      // 加入选中社区
      community.set(i, bestCom)
      sumTot.set(bestCom, (sumTot.get(bestCom) ?? 0) + ki)
      if (bestCom !== ci) improved = true
    }
  }

  // 4. 重新编号社区（让 community id 紧凑：0,1,2...）
  const remap = new Map<number, number>()
  let nextId = 0
  const result = new Map<string, number>()
  for (const id of nodeIds) {
    const c = community.get(id)!
    let mapped = remap.get(c)
    if (mapped === undefined) {
      mapped = nextId++
      remap.set(c, mapped)
    }
    result.set(id, mapped)
  }

  return result
}
