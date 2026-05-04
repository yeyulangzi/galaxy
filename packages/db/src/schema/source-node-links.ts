import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sources } from './sources'
import { nodes } from './nodes'

export const sourceNodeLinks = sqliteTable(
  'source_node_links',
  {
    id: text('id').primaryKey(),
    source_id: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    node_id: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    excerpt: text('excerpt'),
    position: integer('position'),
    created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => ({
    sourceIdx: index('idx_snl_source').on(t.source_id),
    nodeIdx: index('idx_snl_node').on(t.node_id),
    uniqueLink: uniqueIndex('uq_snl_source_node').on(t.source_id, t.node_id),
  }),
)

export type SourceNodeLinkRow = typeof sourceNodeLinks.$inferSelect
export type NewSourceNodeLinkRow = typeof sourceNodeLinks.$inferInsert
