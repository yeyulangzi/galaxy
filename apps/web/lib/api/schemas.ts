import { z } from 'zod'
import {
  RELATION_TYPES,
  NODE_STATUSES,
  NODE_TYPES,
  CHANNELS,
  INTERNALIZATION_STATUSES,
  EDGE_ORIGINS,
  ASPECT_SOURCE_TYPES,
  ATTACHMENT_TYPES,
} from '@galaxy/shared'

export const CreateNodeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(2000).nullish(),
  domain: z.string().trim().min(1, 'domain is required').max(100),
  is_seed: z.boolean().optional().default(false),
  node_type: z.enum(NODE_TYPES).optional().default('concept'),
  channel: z.enum(CHANNELS).optional().default('light'),
})
export type CreateNodeInput = z.infer<typeof CreateNodeSchema>

export const UpdateNodeSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().max(2000).nullish(),
  domain: z.string().max(100).nullish(),
  is_seed: z.boolean().optional(),
  status: z.enum(NODE_STATUSES).optional(),
  node_type: z.enum(NODE_TYPES).optional(),
  channel: z.enum(CHANNELS).optional(),
  internalization_status: z.enum(INTERNALIZATION_STATUSES).optional(),
  my_thoughts: z.string().max(100000).nullish(),
  last_accessed_at: z.string().nullish(),
})
export type UpdateNodeInput = z.infer<typeof UpdateNodeSchema>

export const CreateEdgeSchema = z
  .object({
    source_node_id: z.string().min(1),
    target_node_id: z.string().min(1),
    relation_type: z.enum(RELATION_TYPES),
    origin: z.enum(EDGE_ORIGINS).optional().default('manual'),
    weight: z.number().min(0).max(1).optional().default(1),
    description: z.string().max(500).nullish(),
  })
  .refine((v) => v.source_node_id !== v.target_node_id, {
    message: 'source and target must differ',
    path: ['target_node_id'],
  })
export type CreateEdgeInput = z.infer<typeof CreateEdgeSchema>

export const UpdateEdgeSchema = z.object({
  origin: z.enum(EDGE_ORIGINS).optional(),
  relation_type: z.enum(RELATION_TYPES).optional(),
  weight: z.number().min(0).max(1).optional(),
  description: z.string().max(500).nullish(),
})
export type UpdateEdgeInput = z.infer<typeof UpdateEdgeSchema>

export const FeedTextSchema = z.object({
  type: z.literal('text'),
  content: z.string().trim().min(1).max(100000),
})

export const FeedUrlSchema = z.object({
  type: z.literal('url'),
  url: z.string().url(),
})

export const FeedFileSchema = z.object({
  type: z.enum(['file_md', 'file_pdf']),
  /** Base64 编码的文件内容 */
  file_content: z.string().min(1),
  file_name: z.string().min(1),
})

export const FeedSchema = z.discriminatedUnion('type', [FeedTextSchema, FeedUrlSchema, FeedFileSchema])
export type FeedInput = z.infer<typeof FeedSchema>

export const ConfirmActionSchema = z.object({
  action: z.enum(['accept', 'reject', 'accept_modified']),
  modified_payload: z.unknown().optional(),
  decision_note: z.string().max(500).optional(),
})
export type ConfirmAction = z.infer<typeof ConfirmActionSchema>

export const BatchConfirmSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(1000),
  action: z.enum(['accept', 'reject']),
  decision_note: z.string().max(500).optional(),
})
export type BatchConfirmInput = z.infer<typeof BatchConfirmSchema>

export const CreateAspectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().max(100000),
  source_type: z.enum(ASPECT_SOURCE_TYPES).optional().default('manual'),
  source_id: z.string().max(200).nullish(),
})
export type CreateAspectInput = z.infer<typeof CreateAspectSchema>

export const UpdateAspectSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().max(100000).optional(),
  source_type: z.enum(ASPECT_SOURCE_TYPES).optional(),
  source_id: z.string().max(200).nullish(),
})
export type UpdateAspectInput = z.infer<typeof UpdateAspectSchema>

export const CreateAttachmentSchema = z.object({
  type: z.enum(ATTACHMENT_TYPES),
  title: z.string().trim().min(1).max(200),
  content_or_url: z.string().min(1).max(500000),
})
export type CreateAttachmentInput = z.infer<typeof CreateAttachmentSchema>

export const SaveThoughtVersionSchema = z.object({
  content: z.string().max(100000).nullish(),
  version_label: z.string().max(100).nullish(),
})
export type SaveThoughtVersionInput = z.infer<typeof SaveThoughtVersionSchema>
