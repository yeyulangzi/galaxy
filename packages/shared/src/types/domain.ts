/**
 * Galaxy 领域核心类型（跨 db / web / ai 包共享）。
 *
 * 字段命名说明：本文件 interface 字段统一采用 `snake_case`，与底层 SQLite 列名保持一致，
 * 以省去 ORM 层的字段映射开销。这是有意识的工程权衡，请勿"纠正"为 camelCase。
 */

/** 节点状态 */
export type NodeStatus = 'active' | 'archived'

/** 边的关系类型（M1 仅区分 related，M2+ 会扩展为 part-of / depends-on / contrasts-with 等） */
export type RelationType =
  | 'related'
  | 'part-of'
  | 'depends-on'
  | 'contrasts-with'
  | 'derived-from'

/** AI 调用的状态 */
export type AiCallStatus = 'success' | 'failed' | 'timeout'

/** 候选建议的状态 */
export type SuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'merged' | 'expired'

/** 节点视角切片的来源 */
export type AspectSource = 'manual' | 'deep-dive' | 'extracted'

/**
 * 节点（图谱顶点）
 */
export interface Node {
  id: string
  title: string
  slug: string
  domain: string | null
  summary: string | null
  is_seed: boolean
  status: NodeStatus
  created_at: string
  updated_at: string
}

/**
 * 边（图谱有向连接）
 */
export interface Edge {
  id: string
  source_node_id: string
  target_node_id: string
  relation_type: RelationType
  weight: number
  note: string | null
  created_at: string
}

/**
 * 节点视角切片（M5 才会落地，但类型先就位）
 */
export interface Aspect {
  id: string
  node_id: string
  perspective: string
  content: string
  source: AspectSource
  created_at: string
  updated_at: string
}
