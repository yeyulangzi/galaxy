import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const feedItems = sqliteTable('feed_items', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['text', 'url', 'file_md', 'file_pdf'] }).notNull(),
  raw_content: text('raw_content'),
  file_path: text('file_path'),
  source_url: text('source_url'),
  status: text('status', { enum: ['processing', 'done', 'failed'] }).notNull().default('processing'),
  error_message: text('error_message'),
  suggestions_count: integer('suggestions_count').notNull().default(0),
  created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
})

export type FeedItemRow = typeof feedItems.$inferSelect
export type NewFeedItemRow = typeof feedItems.$inferInsert
