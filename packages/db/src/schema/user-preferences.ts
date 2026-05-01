import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const userPreferences = sqliteTable('user_preferences', {
  id: text('id').primaryKey(),
  preference_key: text('preference_key').notNull().unique(),
  preference_value: text('preference_value').notNull(),
  source: text('source').notNull().default('learned'),
  evidence_count: integer('evidence_count').notNull().default(0),
  learned_at: text('learned_at'),
  updated_at: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
})

export type UserPreferenceRow = typeof userPreferences.$inferSelect
export type NewUserPreferenceRow = typeof userPreferences.$inferInsert
