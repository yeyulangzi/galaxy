import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema/index'
import { seedDefaultSettings } from './seed'

let _db: BetterSQLite3Database<typeof schema> | null = null
let _sqlite: Database.Database | null = null

/**
 * 解析 SQLite 数据库文件的最终路径。
 * 优先级：环境变量 GALAXY_DB_PATH > 默认 `~/galaxy/data/galaxy.db`
 */
export function resolveDbPath(): string {
  return process.env.GALAXY_DB_PATH || path.join(os.homedir(), 'galaxy', 'data', 'galaxy.db')
}

/**
 * 获取（或惰性创建）单例 drizzle 客户端。
 * 首次调用时会：
 *   1. 确保数据库文件所在目录存在
 *   2. 打开 better-sqlite3 连接
 *   3. 启用 WAL 模式 + 外键约束 + NORMAL 同步策略 + 5s busy timeout（避免后台 worker 与前台读并发时立即抛 SQLITE_BUSY）
 */
export function getDb(): BetterSQLite3Database<typeof schema> {
  if (_db) return _db
  const dbPath = resolveDbPath()
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  _sqlite = new Database(dbPath)
  _sqlite.pragma('journal_mode = WAL')
  _sqlite.pragma('foreign_keys = ON')
  _sqlite.pragma('synchronous = NORMAL')
  _sqlite.pragma('busy_timeout = 5000')
  _db = drizzle(_sqlite, { schema })
  return _db
}

/** 关闭数据库连接并重置单例（主要供测试与脚本退出使用） */
export function closeDb(): void {
  try {
    _sqlite?.close()
  } finally {
    _sqlite = null
    _db = null
  }
}

/**
 * 启动时调用：执行尚未应用的 migrations。
 * `migrationsFolder` 默认指向 `packages/db/drizzle/`（drizzle-kit generate 的输出目录）。
 */
export function initDb(migrationsFolder?: string): void {
  const db = getDb()
  const dir = migrationsFolder || path.resolve(new URL('.', import.meta.url).pathname, '..', 'drizzle')
  if (!fs.existsSync(dir)) {
    throw new Error(`Drizzle migrations folder not found: ${dir}. Run \`pnpm db:generate\` first.`)
  }
  migrate(db, { migrationsFolder: dir })
  seedDefaultSettings(db)
}
