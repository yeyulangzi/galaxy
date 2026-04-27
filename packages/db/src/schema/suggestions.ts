import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'

export const suggestions = sqliteTable(
  'suggestions',
  {
    id: text('id').primaryKey(),
    type: text('type', {
      enum: ['new_node', 'new_edge', 'fill_aspect', 'update_aspect', 'merge_nodes'],
    }).notNull(),
    source: text('source', { enum: ['feed', 'proactive_scan', 'deepdive'] }).notNull(),
    source_ref_id: text('source_ref_id'),

    payload: text('payload', { mode: 'json' }).notNull(),

    rationale: text('rationale'),
    confidence: real('confidence').notNull().default(0.5),

    status: text('status', {
      enum: ['pending', 'accepted', 'rejected', 'accepted_modified', 'expired', 'paused'],
    })
      .notNull()
      .default('pending'),
    decided_at: text('decided_at'),
    decided_payload: text('decided_payload', { mode: 'json' }),
    decision_note: text('decision_note'),

    created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    expires_at: text('expires_at'),

    provider_id: text('provider_id'),
    model: text('model'),
  },
  (t) => ({
    statusIdx: index('idx_suggestions_status').on(t.status),
    sourceIdx: index('idx_suggestions_source').on(t.source),
    typeIdx: index('idx_suggestions_type').on(t.type),
    confidenceIdx: index('idx_suggestions_confidence').on(t.confidence),
  }),
)

export type SuggestionRow = typeof suggestions.$inferSelect
export type NewSuggestionRow = typeof suggestions.$inferInsert
