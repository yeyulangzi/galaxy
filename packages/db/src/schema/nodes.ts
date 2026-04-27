import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const nodes = sqliteTable(
  'nodes',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    summary: text('summary'),
    domain: text('domain'),
    is_seed: integer('is_seed', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: ['active', 'archived'] }).notNull().default('active'),
    created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updated_at: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    created_by: text('created_by', {
      enum: ['user', 'ai_feed', 'ai_proactive', 'ai_deepdive'],
    })
      .notNull()
      .default('user'),
    ai_metadata: text('ai_metadata', { mode: 'json' }),
  },
  (t) => ({
    titleIdx: index('idx_nodes_title').on(t.title),
    domainIdx: index('idx_nodes_domain').on(t.domain),
    slugUnique: uniqueIndex('uq_nodes_slug').on(t.slug),
  }),
)

export type NodeRow = typeof nodes.$inferSelect
export type NewNodeRow = typeof nodes.$inferInsert
