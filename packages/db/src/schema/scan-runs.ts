import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const scanRuns = sqliteTable('scan_runs', {
  id: text('id').primaryKey(),
  trigger: text('trigger', { enum: ['cron', 'manual'] }).notNull(),
  status: text('status', { enum: ['running', 'done', 'failed'] }).notNull().default('running'),
  started_at: text('started_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  finished_at: text('finished_at'),
  scope: text('scope', { mode: 'json' }),
  suggestions_count: integer('suggestions_count').notNull().default(0),
  cost_tokens: integer('cost_tokens').notNull().default(0),
  cost_usd: real('cost_usd').notNull().default(0),
  acceptance_rate: real('acceptance_rate'),
  error_message: text('error_message'),
  provider_id: text('provider_id'),
  model: text('model'),
})

export type ScanRunRow = typeof scanRuns.$inferSelect
export type NewScanRunRow = typeof scanRuns.$inferInsert
