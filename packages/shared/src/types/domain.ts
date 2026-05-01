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
export const NODE_STATUSES = ['active', 'archived'] as const
export type NodeStatus = (typeof NODE_STATUSES)[number]

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
export const RELATION_TYPES = [
  'contains',
  'related',
  'opposes',
  'instance_of',
  'evolved_from',
  'cites',
  'evidence_for',
  'evidence_against',
  'refines',
] as const
export type RelationType = (typeof RELATION_TYPES)[number]

/** 节点类型（与 nodes.node_type 列字面一致） */
export const NODE_TYPES = ['concept', 'model', 'methodology', 'phenomenon', 'practice', 'phase', 'entity'] as const
export type NodeType = (typeof NODE_TYPES)[number]

/** 通道类型（与 nodes.channel 列字面一致） */
export const CHANNELS = ['core', 'light'] as const
export type Channel = (typeof CHANNELS)[number]

/** 内化状态（与 nodes.internalization_status 列字面一致） */
export const INTERNALIZATION_STATUSES = ['draft', 'linked', 'dialogued', 'mastered'] as const
export type InternalizationStatus = (typeof INTERNALIZATION_STATUSES)[number]

/** 边的来源（与 edges.origin 列字面一致） */
export const EDGE_ORIGINS = ['manual', 'ai_suggested', 'ai_confirmed'] as const
export type EdgeOrigin = (typeof EDGE_ORIGINS)[number]

/** 维度卡来源类型（与 aspects.source_type 列字面一致） */
export const ASPECT_SOURCE_TYPES = ['dialogue', 'attachment', 'manual'] as const
export type AspectSourceType = (typeof ASPECT_SOURCE_TYPES)[number]

/** 附件类型（与 node_attachments.type 列字面一致） */
export const ATTACHMENT_TYPES = ['md', 'link'] as const
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number]

/** AI 调用的状态（M2 ai_call_logs 表会引用此类型） */
export const AI_CALL_STATUSES = ['success', 'failed', 'timeout'] as const
export type AiCallStatus = (typeof AI_CALL_STATUSES)[number]

/** 候选建议的状态（与 suggestions.status 列字面一致，6 值） */
export const SUGGESTION_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'accepted_modified',
  'expired',
  'paused',
] as const
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number]

/**
 * 记录的创建者（与 nodes / edges / aspects 等表的 created_by 列字面一致）。
 * 复用同一个枚举，避免每张表重复定义。
 */
export const AUTHORS = ['user', 'ai_feed', 'ai_proactive', 'ai_deepdive'] as const
export type Author = (typeof AUTHORS)[number]

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
  node_type: NodeType
  channel: Channel
  internalization_status: InternalizationStatus
  my_thoughts: string | null
  last_accessed_at: string | null
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
  origin: EdgeOrigin
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
  title: string
  content: string
  source_type: AspectSourceType
  source_id: string | null
  order: number
  created_at: string
  updated_at: string
  created_by: Author
  ai_metadata: unknown | null
}

/**
 * 「我的思考」版本 —— `node_thought_versions` 表的镜像。
 */
export interface ThoughtVersion {
  id: string
  node_id: string
  content: string
  version_label: string | null
  saved_at: string
}

/**
 * 节点附件 —— `node_attachments` 表的镜像。
 */
export interface Attachment {
  id: string
  node_id: string
  type: AttachmentType
  title: string
  content_or_url: string
  created_at: string
}

/** 建议类型 */
export const SUGGESTION_TYPES = ['new_node', 'new_edge', 'fill_aspect', 'update_aspect', 'merge_nodes'] as const
export type SuggestionType = (typeof SUGGESTION_TYPES)[number]

/** 建议来源 */
export const SUGGESTION_SOURCES = ['feed', 'proactive_scan', 'deepdive'] as const
export type SuggestionSource = (typeof SUGGESTION_SOURCES)[number]

/** 投喂类型 */
export const FEED_ITEM_TYPES = ['text', 'url', 'file_md', 'file_pdf'] as const
export type FeedItemType = (typeof FEED_ITEM_TYPES)[number]

/** 投喂状态 */
export const FEED_ITEM_STATUSES = ['processing', 'done', 'failed'] as const
export type FeedItemStatus = (typeof FEED_ITEM_STATUSES)[number]

/**
 * 待审建议 —— `suggestions` 表的镜像。
 */
export interface Suggestion {
  id: string
  type: SuggestionType
  source: SuggestionSource
  source_ref_id: string | null
  payload: unknown
  rationale: string | null
  confidence: number
  calibrated_confidence: number | null
  status: SuggestionStatus
  decided_at: string | null
  decided_payload: unknown | null
  decision_note: string | null
  provider_id: string | null
  /** AI 调用时使用的模型 ID */
  model: string | null
  created_at: string
  expires_at: string | null
}

/**
 * 投喂记录 —— `feed_items` 表的镜像。
 */
export interface FeedItem {
  id: string
  type: FeedItemType
  raw_content: string | null
  file_path: string | null
  source_url: string | null
  status: FeedItemStatus
  error_message: string | null
  suggestions_count: number
  created_at: string
}

/**
 * AI 调用日志 —— `ai_call_logs` 表的镜像。
 */
export interface AiCallLog {
  id: string
  channel: 'direct' | 'bridge'
  task: string
  provider_id: string | null
  model: string | null
  base_url: string | null
  input_tokens: number
  output_tokens: number
  cost_usd: number
  duration_ms: number
  status: 'success' | 'failed' | 'timeout'
  error_message: string | null
  created_at: string
}
