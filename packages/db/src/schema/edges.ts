import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core'
import { nodes } from './nodes'

export const edges = sqliteTable(
  'edges',
  {
    id: text('id').primaryKey(),
    source_node_id: text('source_node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    target_node_id: text('target_node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    relation_type: text('relation_type', {
      enum: ['contains', 'related', 'opposes', 'instance_of', 'evolved_from', 'cites'],
    }).notNull(),
    weight: real('weight').notNull().default(1.0),
    description: text('description'),
    created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updated_at: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    created_by: text('created_by', {
      enum: ['user', 'ai_feed', 'ai_proactive', 'ai_deepdive'],
    })
      .notNull()
      .default('user'),
    ai_metadata: text('ai_metadata', { mode: 'json' }),
  },
  (t) => ({
    tripleUnique: uniqueIndex('uq_edges_triple').on(t.source_node_id, t.target_node_id, t.relation_type),
    sourceIdx: index('idx_edges_source').on(t.source_node_id),
    targetIdx: index('idx_edges_target').on(t.target_node_id),
  }),
)

export type EdgeRow = typeof edges.$inferSelect
export type NewEdgeRow = typeof edges.$inferInsert
