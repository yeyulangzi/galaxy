import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const feedbackStats = sqliteTable('feedback_stats', {
  id: text('id').primaryKey(),
  dimension_key: text('dimension_key').notNull().unique(),
  suggestion_type: text('suggestion_type').notNull(),
  source: text('source').notNull(),
  strategy: text('strategy'),
  total_count: integer('total_count').notNull().default(0),
  accepted_count: integer('accepted_count').notNull().default(0),
  rejected_count: integer('rejected_count').notNull().default(0),
  modified_count: integer('modified_count').notNull().default(0),
  avg_confidence: real('avg_confidence').default(0),
  avg_accepted_confidence: real('avg_accepted_confidence').default(0),
  avg_rejected_confidence: real('avg_rejected_confidence').default(0),
  window_start: text('window_start'),
  updated_at: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
})

export type FeedbackStatsRow = typeof feedbackStats.$inferSelect
export type NewFeedbackStatsRow = typeof feedbackStats.$inferInsert
