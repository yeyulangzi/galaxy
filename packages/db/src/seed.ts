import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { settings } from './schema/settings.js'
import type * as schema from './schema/index.js'

/**
 * 确保 settings 表存在唯一一行（id = 1）。幂等。
 */
export function seedDefaultSettings(db: BetterSQLite3Database<typeof schema>): void {
  db.insert(settings)
    .values({ id: 1 })
    .onConflictDoNothing({ target: settings.id })
    .run()
}
