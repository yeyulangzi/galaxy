import { z } from 'zod'

const RELATION_TYPES = ['contains', 'related', 'opposes', 'instance_of', 'evolved_from', 'cites'] as const

export const SuggestedEdgeSchema = z.object({
  target_node_title: z.string(),
  relation_type: z.enum(RELATION_TYPES),
})

export const NewNodeExtractionSchema = z.object({
  title: z.string().max(50),
  summary: z.string().max(200),
  domain: z.string(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  suggested_edges: z.array(SuggestedEdgeSchema),
})

export const NewEdgeExtractionSchema = z.object({
  source_title: z.string(),
  target_title: z.string(),
  relation_type: z.enum(RELATION_TYPES),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
})

export const FillAspectExtractionSchema = z.object({
  node_title: z.string(),
  template_key: z.string(),
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
