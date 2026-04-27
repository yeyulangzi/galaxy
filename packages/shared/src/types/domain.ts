/**
 * Galaxy 领域核心类型（跨 db / web / ai 包共享）。
 *
 * 字段命名说明：本文件 interface 字段统一采用 `snake_case`，与底层 SQLite 列名保持一致，
 * 以省去 ORM 层的字段映射开销。这是有意识的工程权衡，请勿"纠正"为 camelCase。
 *
 * 设计契约：本文件是 `packages/db/src/schema/*.ts` 中 Drizzle 表定义的精准镜像 ——
 *   - 字段名、可空性、字面量枚举与 SQL 列保持字面一致；
 *   - 节点/边/切片均含 SQL 层的审计列（`created_by` / `ai_metadata`）；
 *   - 任何 schema 变更都必须双向同步，未来可在 Task 22 加 satisfies 编译期校验。
 */

/** 节点状态（与 nodes.status 列字面一致） */
export type NodeStatus = 'active' | 'archived'

/**
 * 边的关系类型（与 edges.relation_type 列字面一致）。
 *
 * 6 个枚举值的语义：
 *   - contains      包含/聚合（A 包含 B）
 *   - related       泛相关（无方向语义，调用方需显式约定）
 *   - opposes       对立/反义
 *   - instance_of   是某概念的实例
 *   - evolved_from  从 X 演化而来
 *   - cites         引用/参考
 */
export type RelationType =
  | 'contains'
  | 'related'
  | 'opposes'
  | 'instance_of'
  | 'evolved_from'
  | 'cites'

/** AI 调用的状态（M2 ai_call_logs 表会引用此类型） */
export type AiCallStatus = 'success' | 'failed' | 'timeout'

/** 候选建议的状态（与 suggestions.status 列字面一致，6 值） */
export type SuggestionStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'accepted_modified'
  | 'expired'
  | 'paused'

/**
 * 记录的创建者（与 nodes / edges / aspects 等表的 created_by 列字面一致）。
 * 复用同一个枚举，避免每张表重复定义。
 */
export type Author = 'user' | 'ai_feed' | 'ai_proactive' | 'ai_deepdive'

/**
 * 节点（图谱顶点） —— `nodes` 表的镜像。
 */
export interface Node {
  id: string
  title: string
  slug: string
  summary: string | null
  domain: string | null
  is_seed: boolean
  status: NodeStatus
  created_at: string
  updated_at: string
  created_by: Author
  ai_metadata: unknown | null
}

/**
 * 边（图谱有向连接） —— `edges` 表的镜像。
 */
export interface Edge {
  id: string
  source_node_id: string
  target_node_id: string
  relation_type: RelationType
  weight: number
  description: string | null
  created_at: string
  updated_at: string
  created_by: Author
  ai_metadata: unknown | null
}

/**
 * 节点视角切片 —— `aspects` 表的镜像（M5 才会落地完整业务，但类型先就位）。
 */
export interface Aspect {
  id: string
  node_id: string
  template_key: string
  title: string
  content: string
  order: number
  created_at: string
  updated_at: string
  created_by: Author
  ai_metadata: unknown | null
}
