import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),

  // AI 开关
  enable_feed_ai: integer('enable_feed_ai', { mode: 'boolean' }).notNull().default(true),
  enable_proactive_scan: integer('enable_proactive_scan', { mode: 'boolean' }).notNull().default(false),
  enable_deepdive: integer('enable_deepdive', { mode: 'boolean' }).notNull().default(true),

  // 主动扫描配置
  proactive_scan_cron: text('proactive_scan_cron').notNull().default('0 3 * * *'),
  proactive_scan_max_suggestions: integer('proactive_scan_max_suggestions').notNull().default(10),
  proactive_scan_strategies: text('proactive_scan_strategies', { mode: 'json' })
    .notNull()
    .default(sql`(json('["islands","gaps"]'))`),

  // 多 Provider 配置
  default_provider: text('default_provider'),
  default_model: text('default_model'),
  default_base_url: text('default_base_url'),
  provider_credentials: text('provider_credentials', { mode: 'json' }),
  task_provider_overrides: text('task_provider_overrides', { mode: 'json' }),
  custom_providers: text('custom_providers', { mode: 'json' }),

  // 桥接配置
  qoder_bridge_dir: text('qoder_bridge_dir').default('~/galaxy/bridge/'),
  bridge_timeout_minutes: integer('bridge_timeout_minutes').notNull().default(30),

  // 思考模式
  enable_thinking: integer('enable_thinking', { mode: 'boolean' }).notNull().default(false),
  thinking_budget_tokens: integer('thinking_budget_tokens').notNull().default(10000),

  // 风险控制
  enable_monthly_budget: integer('enable_monthly_budget', { mode: 'boolean' }).notNull().default(false),
  monthly_budget_usd: real('monthly_budget_usd').notNull().default(20),
  current_month_cost_usd: real('current_month_cost_usd').notNull().default(0),
  current_month_key: text('current_month_key').notNull().default(''),

  updated_at: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
})

export type SettingsRow = typeof settings.$inferSelect
