import { sql } from 'drizzle-orm'
import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'

export const sources = sqliteTable(
  'sources',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    type: text('type', { enum: ['article', 'note', 'url', 'pdf'] }).notNull(),
    content: text('content'),
    url: text('url'),
    feed_item_id: text('feed_item_id'),
    created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => ({
    typeIdx: index('idx_sources_type').on(t.type),
    feedItemIdx: index('idx_sources_feed_item').on(t.feed_item_id),
  }),
)

export type SourceRow = typeof sources.$inferSelect
export type NewSourceRow = typeof sources.$inferInsert
