import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { nodes } from './nodes'

export const aspects = sqliteTable(
  'aspects',
  {
    id: text('id').primaryKey(),
    node_id: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    template_key: text('template_key').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    source_type: text('source_type', {
      enum: ['dialogue', 'attachment', 'manual'],
    })
      .notNull()
      .default('manual'),
    source_id: text('source_id'),
    order: integer('order').notNull().default(0),
    created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updated_at: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    created_by: text('created_by', {
      enum: ['user', 'ai_feed', 'ai_proactive', 'ai_deepdive', 'ai_extract'],
    })
      .notNull()
      .default('user'),
    ai_metadata: text('ai_metadata', { mode: 'json' }),
  },
  (t) => ({
    nodeIdx: index('idx_aspects_node').on(t.node_id),
    nodeTemplateUniq: uniqueIndex('uq_aspects_node_template').on(t.node_id, t.template_key),
  }),
)

export type AspectRow = typeof aspects.$inferSelect
export type NewAspectRow = typeof aspects.$inferInsert
