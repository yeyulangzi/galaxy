import { z } from 'zod'

export const RELATION_TYPES = ['contains', 'related', 'opposes', 'instance_of', 'evolved_from', 'cites', 'evidence_for', 'evidence_against', 'refines'] as const

/** domain 字段的 LLM 描述规则（单一来源，所有消费方共享） */
export const DOMAIN_RULE_DESCRIPTION =
  '知识领域，用 "/" 分隔层级，最多三级。' +
  '必须优先复用图谱中已有的一级和二级领域，禁止自创语义相近的新领域。' +
  '如果新领域与已有领域的含义有 70% 以上重合，必须合并到已有领域下。' +
  '只有当内容属于全新的、与所有已有领域都不相关的学科时，才可以创建新的一级领域。'

export const SuggestedEdgeSchema = z.object({
  target_node_title: z.string(),
  relation_type: z.enum(RELATION_TYPES),
})

export const NewNodeExtractionSchema = z.object({
  title: z.string().max(20),
  summary: z.string().max(200),
  domain: z.string().describe(DOMAIN_RULE_DESCRIPTION),
  node_type: z.enum(['concept', 'claim', 'case', 'resource']),
  channel: z.enum(['core', 'light']),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  suggested_edges: z.array(SuggestedEdgeSchema),
})

export const NewEdgeExtractionSchema = z.object({
  source_title: z.string(),
  target_title: z.string(),
  relation_type: z.enum(RELATION_TYPES),
  origin: z.enum(['manual', 'ai_suggested', 'ai_confirmed']),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
})

export const FillAspectExtractionSchema = z.object({
  node_title: z.string(),
  aspect_title: z.string(),
  content: z.string(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
})

export const FeedExtractionResultSchema = z.object({
  new_nodes: z.array(NewNodeExtractionSchema),
  new_edges: z.array(NewEdgeExtractionSchema).default([]),
  fill_aspects: z.array(FillAspectExtractionSchema).default([]),
})

export type FeedExtractionResult = z.infer<typeof FeedExtractionResultSchema>
