import path from 'node:path'
import fs from 'node:fs'
import { initDb, getDb } from '@galaxy/db'
import { startScheduler } from '@galaxy/ai'
import { sql } from 'drizzle-orm'

let initialized = false

/**
 * 定位 packages/db/drizzle 迁移目录。
 * Next.js dev cwd 可能是 monorepo 根或 apps/web，两种都要兼容。
 */
function findMigrationsFolder(): string {
  const candidates = [
    path.resolve(process.cwd(), 'packages', 'db', 'drizzle'),
    path.resolve(process.cwd(), '..', '..', 'packages', 'db', 'drizzle'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  throw new Error(`Cannot find drizzle migrations folder. Tried: ${candidates.join(', ')}`)
}

/**
 * 模块级惰性初始化 DB + 启动调度器（仅首次调用时执行）。
 * 显式传入 migrationsFolder 以绕过 webpack 对 import.meta.url 的路径转换。
 */
export function ensureDb() {
  if (!initialized) {
    initDb(findMigrationsFolder())
    initialized = true
    // 启动主动扫描调度器（每 30s 检查 cron，只在 enable_proactive_scan 时执行）
    try { startScheduler() } catch (e) { console.warn('Scheduler start failed:', e) }

    // 一次性回填：为没有标题的会话补上标题（取第一条用户消息的前 50 字符）
    try {
      const db = getDb()
      db.run(sql`
        UPDATE deep_dive_sessions
        SET title = (
          SELECT SUBSTR(REPLACE(content, CHAR(10), ' '), 1, 50)
          FROM deep_dive_messages
          WHERE deep_dive_messages.session_id = deep_dive_sessions.id
            AND deep_dive_messages.role = 'user'
          ORDER BY deep_dive_messages.created_at ASC
          LIMIT 1
        )
        WHERE title IS NULL
          AND EXISTS (
            SELECT 1 FROM deep_dive_messages
            WHERE deep_dive_messages.session_id = deep_dive_sessions.id
              AND deep_dive_messages.role = 'user'
          )
      `)
    } catch (e) { console.warn('Session title backfill failed:', e) }
  }
}
