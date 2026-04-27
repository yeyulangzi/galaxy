import { z } from 'zod'
import { RELATION_TYPES, NODE_STATUSES } from '@galaxy/shared'

export const CreateNodeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(2000).nullish(),
  domain: z.string().max(100).nullish(),
  is_seed: z.boolean().optional().default(false),
})
export type CreateNodeInput = z.infer<typeof CreateNodeSchema>

export const UpdateNodeSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().max(2000).nullish(),
  domain: z.string().max(100).nullish(),
  is_seed: z.boolean().optional(),
  status: z.enum(NODE_STATUSES).optional(),
})
export type UpdateNodeInput = z.infer<typeof UpdateNodeSchema>

export const CreateEdgeSchema = z
  .object({
    source_node_id: z.string().min(1),
    target_node_id: z.string().min(1),
    relation_type: z.enum(RELATION_TYPES),
    weight: z.number().min(0).max(1).optional().default(1),
    description: z.string().max(500).nullish(),
  })
  .refine((v) => v.source_node_id !== v.target_node_id, {
    message: 'source and target must differ',
    path: ['target_node_id'],
  })
export type CreateEdgeInput = z.infer<typeof CreateEdgeSchema>
