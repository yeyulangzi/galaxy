import path from 'node:path'
import fs from 'node:fs'
import { initDb } from '@galaxy/db'

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
 * 模块级惰性初始化 DB（仅首次调用时执行 initDb）。
 * 显式传入 migrationsFolder 以绕过 webpack 对 import.meta.url 的路径转换。
 */
export function ensureDb() {
  if (!initialized) {
    initDb(findMigrationsFolder())
    initialized = true
  }
}
