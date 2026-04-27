import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { nodes } from './nodes.js'

export const deepDiveSessions = sqliteTable(
  'deep_dive_sessions',
  {
    id: text('id').primaryKey(),
    node_id: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    agent_type: text('agent_type', { enum: ['thinker', 'partner', 'direct'] }).notNull(),
    bridge_task_path: text('bridge_task_path'),
    status: text('status', { enum: ['active', 'completed', 'abandoned'] }).notNull().default('active'),
    created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updated_at: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    final_suggestion_ids: text('final_suggestion_ids', { mode: 'json' }),
    provider_id: text('provider_id'),
    model: text('model'),
  },
  (t) => ({
    nodeIdx: index('idx_deep_dive_node').on(t.node_id),
  }),
)

export const deepDiveMessages = sqliteTable(
  'deep_dive_messages',
  {
    id: text('id').primaryKey(),
    session_id: text('session_id')
      .notNull()
      .references(() => deepDiveSessions.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'ai', 'system'] }).notNull(),
    content: text('content').notNull(),
    created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => ({
    sessionIdx: index('idx_deep_dive_messages_session').on(t.session_id),
  }),
)

export type DeepDiveSessionRow = typeof deepDiveSessions.$inferSelect
export type DeepDiveMessageRow = typeof deepDiveMessages.$inferSelect
