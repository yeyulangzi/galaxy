import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const operationLogs = sqliteTable('operation_logs', {
  id: text('id').primaryKey(),
  operation: text('operation').notNull(),
  affected_ids: text('affected_ids', { mode: 'json' }).notNull(),
  payload_snapshot: text('payload_snapshot', { mode: 'json' }),
  user_note: text('user_note'),
  is_undone: integer('is_undone', { mode: 'boolean' }).notNull().default(false),
  undone_at: text('undone_at'),
  created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
})

export type OperationLogRow = typeof operationLogs.$inferSelect
