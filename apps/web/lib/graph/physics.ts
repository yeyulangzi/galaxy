/**
 * D3-force 物理引擎封装
 * 提供节点持续漂浮的力导向模拟
 */
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'

export interface PhysicsNode extends SimulationNodeDatum {
  id: string
  title: string
  domain?: string | null
  summary?: string | null
  node_type?: 'concept' | 'claim' | 'case' | 'resource' | null
  channel?: 'core' | 'light' | null
  internalization_status?: 'draft' | 'linked' | 'dialogued' | 'mastered' | null
  // 计算属性
  radius: number
  degree: number
  community?: number
  color?: string
}

export interface PhysicsLink extends SimulationLinkDatum<PhysicsNode> {
  id: string
  source: string | PhysicsNode
  target: string | PhysicsNode
  weight: number
  relation_type: string
  origin?: 'manual' | 'ai_suggested' | 'ai_confirmed' | null
  description?: string | null
}

export interface PhysicsConfig {
  /** 排斥力强度（负值，越小越分散） */
  chargeStrength: number
  /** 边的理想长度基数（实际长度 = base / weight） */
  linkBaseDistance: number
  /** 边的弹性强度 0-1 */
  linkStrength: number
  /** 中心引力强度 0-1 */
  centerStrength: number
  /** 节点碰撞半径加成（避免重叠） */
  collidePadding: number
  /** alpha 衰减率（越小节点漂浮越久） */
  alphaDecay: number
  /** 速度衰减率（越小运动越流畅） */
  velocityDecay: number
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  chargeStrength: -800,
  linkBaseDistance: 200,
  linkStrength: 0.3,
  centerStrength: 0.01,
  collidePadding: 8,
  alphaDecay: 0.0228,
  velocityDecay: 0.3,
}

/**
 * 创建力导向模拟
 */
export function createSimulation(
  nodes: PhysicsNode[],
  links: PhysicsLink[],
  width: number,
  height: number,
  config: PhysicsConfig = DEFAULT_PHYSICS_CONFIG,
): Simulation<PhysicsNode, PhysicsLink> {
  const simulation = forceSimulation<PhysicsNode, PhysicsLink>(nodes)
    .force(
      'link',
      forceLink<PhysicsNode, PhysicsLink>(links)
        .id((d) => d.id)
        .distance((d) => config.linkBaseDistance / Math.max(d.weight, 0.1))
        .strength(config.linkStrength),
    )
    .force('charge', forceManyBody<PhysicsNode>().strength(config.chargeStrength))
    .force('center', forceCenter(width / 2, height / 2).strength(config.centerStrength))
    .force(
      'collide',
      forceCollide<PhysicsNode>()
        .radius((d) => d.radius + config.collidePadding)
        .strength(0.7),
    )
    .force('x', forceX(width / 2).strength(0.005))
    .force('y', forceY(height / 2).strength(0.005))
    .force('community', forceCommunity(0.15))
    .alphaDecay(config.alphaDecay)
    .velocityDecay(config.velocityDecay)

  return simulation
}

/**
 * 更新模拟参数（实时调参用）
 */
export function updateSimulationConfig(
  simulation: Simulation<PhysicsNode, PhysicsLink>,
  config: PhysicsConfig,
  width: number,
  height: number,
) {
  const linkForce = simulation.force('link') as ReturnType<
    typeof forceLink<PhysicsNode, PhysicsLink>
  > | null
  if (linkForce) {
    linkForce
      .distance((d) => config.linkBaseDistance / Math.max(d.weight, 0.1))
      .strength(config.linkStrength)
  }

  const chargeForce = simulation.force('charge') as ReturnType<
    typeof forceManyBody<PhysicsNode>
  > | null
  if (chargeForce) {
    chargeForce.strength(config.chargeStrength)
  }

  const centerForce = simulation.force('center') as ReturnType<typeof forceCenter> | null
  if (centerForce) {
    centerForce.x(width / 2).y(height / 2).strength(config.centerStrength)
  }

  const collideForce = simulation.force('collide') as ReturnType<
    typeof forceCollide<PhysicsNode>
  > | null
  if (collideForce) {
    collideForce.radius((d) => d.radius + config.collidePadding)
  }

  simulation.alphaDecay(config.alphaDecay).velocityDecay(config.velocityDecay)
  // 重新加热
  simulation.alpha(0.3).restart()
}

/**
 * 计算节点的度（连接数）
 */
export function computeDegree(nodes: PhysicsNode[], links: PhysicsLink[]): Map<string, number> {
  const degreeMap = new Map<string, number>()
  for (const node of nodes) degreeMap.set(node.id, 0)
  for (const link of links) {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id
    const targetId = typeof link.target === 'string' ? link.target : link.target.id
    degreeMap.set(sourceId, (degreeMap.get(sourceId) ?? 0) + 1)
    degreeMap.set(targetId, (degreeMap.get(targetId) ?? 0) + 1)
  }
  return degreeMap
}

/**
 * 根据度计算节点半径
 * 范围 [6, 30]
 */
export function computeRadius(degree: number): number {
  const r = 6 + Math.sqrt(degree) * 3.5
  return Math.min(Math.max(r, 6), 30)
}

/**
 * 构建邻接表（用于 Hover 高亮邻居）
 */
export function buildNeighborMap(
  nodes: PhysicsNode[],
  links: PhysicsLink[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const node of nodes) map.set(node.id, new Set())
  for (const link of links) {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id
    const targetId = typeof link.target === 'string' ? link.target : link.target.id
    map.get(sourceId)?.add(targetId)
    map.get(targetId)?.add(sourceId)
  }
  return map
}

/**
 * 社区分组力（增强版）：
 * 1. 同社区节点被拉向社区重心（聚拢）
 * 2. 不同社区的重心之间互相排斥（分开）
 *
 * @param clusterStrength 社区内聚拢力强度
 * @param separationStrength 社区间排斥力强度
 */
/**
 * @param clusterStrength 社区内聚拢力（越大同社区越紧密）
 * @param minSeparation 社区重心之间的最小距离目标（低于此距离会被强力推开）
 */
export function forceCommunity(clusterStrength: number = 0.15, minSeparation: number = 300) {
  let currentNodes: PhysicsNode[] = []

  function force(alpha: number) {
    // 按 community 分组，计算每个社区的重心
    const centroids = new Map<number, { cx: number; cy: number; count: number }>()

    for (const node of currentNodes) {
      const community = node.community ?? -1
      if (community < 0) continue
      const entry = centroids.get(community)
      if (entry) {
        entry.cx += node.x ?? 0
        entry.cy += node.y ?? 0
        entry.count++
      } else {
        centroids.set(community, { cx: node.x ?? 0, cy: node.y ?? 0, count: 1 })
      }
    }

    for (const entry of centroids.values()) {
      entry.cx /= entry.count
      entry.cy /= entry.count
    }

    // 社区间排斥：如果两个社区重心距离 < minSeparation，施加推力将它们推到 minSeparation 距离
    const communityIds = Array.from(centroids.keys())
    const communityForce = new Map<number, { fx: number; fy: number }>()
    for (const cid of communityIds) communityForce.set(cid, { fx: 0, fy: 0 })

    for (let i = 0; i < communityIds.length; i++) {
      for (let j = i + 1; j < communityIds.length; j++) {
        const cA = centroids.get(communityIds[i])!
        const cB = centroids.get(communityIds[j])!
        let dx = cA.cx - cB.cx
        let dy = cA.cy - cB.cy
        const dist = Math.sqrt(dx * dx + dy * dy) || 1

        if (dist < minSeparation) {
          // 需要推开的距离占比——越近推力越大
          const pushStrength = ((minSeparation - dist) / minSeparation) * alpha * 0.5
          const fx = (dx / dist) * pushStrength * minSeparation
          const fy = (dy / dist) * pushStrength * minSeparation
          communityForce.get(communityIds[i])!.fx += fx
          communityForce.get(communityIds[i])!.fy += fy
          communityForce.get(communityIds[j])!.fx -= fx
          communityForce.get(communityIds[j])!.fy -= fy
        }
      }
    }

    // 对每个节点施力：聚拢 + 社区间排斥
    for (const node of currentNodes) {
      const community = node.community ?? -1
      if (community < 0) continue
      const centroid = centroids.get(community)
      if (!centroid) continue

      // 聚拢力：拉向社区重心
      if (centroid.count > 1) {
        const dx = centroid.cx - (node.x ?? 0)
        const dy = centroid.cy - (node.y ?? 0)
        node.vx = (node.vx ?? 0) + dx * clusterStrength * alpha
        node.vy = (node.vy ?? 0) + dy * clusterStrength * alpha
      }

      // 社区间排斥力：分摊到社区内每个节点
      const cf = communityForce.get(community)
      if (cf) {
        node.vx = (node.vx ?? 0) + cf.fx / centroid.count
        node.vy = (node.vy ?? 0) + cf.fy / centroid.count
      }
    }
  }

  force.initialize = (nodes: PhysicsNode[]) => {
    currentNodes = nodes
  }

  return force
}

/**
 * 按社区为节点预分配初始位置（均匀分布在画布周围的扇区）。
 * 应在 createSimulation 之前调用。
 */
export function presetCommunityPositions(
  nodes: PhysicsNode[],
  width: number,
  height: number,
) {
  // 收集所有社区 ID
  const communitySet = new Set<number>()
  for (const node of nodes) {
    if (node.community != null && node.community >= 0) {
      communitySet.add(node.community)
    }
  }

  const communityIds = Array.from(communitySet).sort((a, b) => a - b)
  const numCommunities = communityIds.length
  if (numCommunities === 0) return

  const cx = width / 2
  const cy = height / 2
  // 扇区半径——画布短边的 30%
  const sectorRadius = Math.min(width, height) * 0.3

  // 每个社区的中心位置
  const communityCenter = new Map<number, { x: number; y: number }>()
  for (let i = 0; i < numCommunities; i++) {
    const angle = (2 * Math.PI * i) / numCommunities - Math.PI / 2
    communityCenter.set(communityIds[i], {
      x: cx + Math.cos(angle) * sectorRadius,
      y: cy + Math.sin(angle) * sectorRadius,
    })
  }

  // 把节点放到对应社区中心附近（加随机抖动避免完全重叠）
  for (const node of nodes) {
    const community = node.community ?? -1
    const center = communityCenter.get(community)
    if (center) {
      node.x = center.x + (Math.random() - 0.5) * 80
      node.y = center.y + (Math.random() - 0.5) * 80
    } else {
      // 无社区的节点放在中心附近
      node.x = cx + (Math.random() - 0.5) * 100
      node.y = cy + (Math.random() - 0.5) * 100
    }
  }
}
