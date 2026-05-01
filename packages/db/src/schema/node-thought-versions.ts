import { sql } from 'drizzle-orm'
import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'
import { nodes } from './nodes'

export const nodeThoughtVersions = sqliteTable(
  'node_thought_versions',
  {
    id: text('id').primaryKey(),
    node_id: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    version_label: text('version_label'),
    saved_at: text('saved_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => ({
    nodeIdx: index('idx_thought_versions_node').on(t.node_id),
  }),
)

export type ThoughtVersionRow = typeof nodeThoughtVersions.$inferSelect
export type NewThoughtVersionRow = typeof nodeThoughtVersions.$inferInsert
