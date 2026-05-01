import { sql } from 'drizzle-orm'
import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'
import { nodes } from './nodes'

export const nodeAttachments = sqliteTable(
  'node_attachments',
  {
    id: text('id').primaryKey(),
    node_id: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['md', 'link'] }).notNull(),
    title: text('title').notNull(),
    content_or_url: text('content_or_url').notNull(),
    created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => ({
    nodeIdx: index('idx_attachments_node').on(t.node_id),
  }),
)

export type AttachmentRow = typeof nodeAttachments.$inferSelect
export type NewAttachmentRow = typeof nodeAttachments.$inferInsert
