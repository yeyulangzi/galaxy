import { initDb } from '@galaxy/db'

let initialized = false

/** 模块级惰性初始化 DB（仅首次调用时执行 initDb） */
export function ensureDb() {
  if (!initialized) {
    initDb()
    initialized = true
  }
}
