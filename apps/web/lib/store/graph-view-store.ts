/**
 * 图谱视图设置 Store（持久化到 localStorage）
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_PHYSICS_CONFIG, type PhysicsConfig } from '../graph/physics'

export interface GraphFilter {
  /** 选中的 domain（空=全部） */
  domains: string[]
  /** 最低置信度（0-1，仅对 ai_* created_by 生效） */
  minConfidence: number
  /** 隐藏孤立节点 */
  hideIsolated: boolean
  /** 隐藏来源 */
  hiddenCreators: string[]
  /** 按 node_type 筛选（空=全部） */
  nodeTypes: string[]
  /** 按 channel 筛选（空=全部） */
  channels: string[]
  /** 按 internalization_status 筛选（空=全部） */
  statuses: string[]
  /** 连线强度区间筛选 [min, max]（0~1） */
  weightRange: [number, number]
}

export interface GraphViewState {
  // 物理参数
  physics: PhysicsConfig
  // 视觉参数
  labelMinZoom: number
  summaryMinZoom: number
  linkWidthMultiplier: number
  // 聚类
  enableCommunityColor: boolean
  // 过滤器
  filter: GraphFilter

  // Actions
  updatePhysics: (patch: Partial<PhysicsConfig>) => void
  updateView: (
    patch: Partial<
      Pick<
        GraphViewState,
        'labelMinZoom' | 'summaryMinZoom' | 'linkWidthMultiplier' | 'enableCommunityColor'
      >
    >,
  ) => void
  updateFilter: (patch: Partial<GraphFilter>) => void
  resetAll: () => void
}

const DEFAULT_FILTER: GraphFilter = {
  domains: [],
  minConfidence: 0,
  hideIsolated: false,
  hiddenCreators: [],
  nodeTypes: [],
  channels: [],
  statuses: [],
  weightRange: [0, 1],
}

export const useGraphViewStore = create<GraphViewState>()(
  persist(
    (set) => ({
      physics: { ...DEFAULT_PHYSICS_CONFIG },
      labelMinZoom: 0.6,
      summaryMinZoom: 1.5,
      linkWidthMultiplier: 1,
      enableCommunityColor: true,
      filter: { ...DEFAULT_FILTER },

      updatePhysics: (patch) =>
        set((state) => ({ physics: { ...state.physics, ...patch } })),
      updateView: (patch) => set((state) => ({ ...state, ...patch })),
      updateFilter: (patch) =>
        set((state) => ({ filter: { ...state.filter, ...patch } })),
      resetAll: () =>
        set({
          physics: { ...DEFAULT_PHYSICS_CONFIG },
          labelMinZoom: 0.6,
          summaryMinZoom: 1.5,
          linkWidthMultiplier: 1,
          enableCommunityColor: true,
          filter: { ...DEFAULT_FILTER, nodeTypes: [], channels: [], statuses: [] },
        }),
    }),
    {
      name: 'galaxy:graph-view',
      version: 1,
    },
  ),
)
