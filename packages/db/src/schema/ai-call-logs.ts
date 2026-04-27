import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'

export const aiCallLogs = sqliteTable(
  'ai_call_logs',
  {
    id: text('id').primaryKey(),
    channel: text('channel', { enum: ['direct', 'bridge'] }).notNull(),
    task: text('task').notNull(),
    provider_id: text('provider_id'),
    model: text('model'),
    base_url: text('base_url'),
    prompt_template: text('prompt_template'),
    context_summary: text('context_summary'),
    input_tokens: integer('input_tokens').notNull().default(0),
    output_tokens: integer('output_tokens').notNull().default(0),
    cost_usd: real('cost_usd').notNull().default(0),
    duration_ms: integer('duration_ms').notNull().default(0),
    status: text('status', { enum: ['success', 'failed', 'timeout'] }).notNull(),
    error_message: text('error_message'),
    created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => ({
    createdIdx: index('idx_ai_call_logs_created').on(t.created_at),
    providerIdx: index('idx_ai_call_logs_provider').on(t.provider_id),
  }),
)

export type AiCallLogRow = typeof aiCallLogs.$inferSelect
