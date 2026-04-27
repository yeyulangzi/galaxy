#!/usr/bin/env tsx
/**
 * Galaxy 开发启动脚本：
 * 1) 确保 ~/galaxy/data/ 目录存在
 * 2) 调用 db 包的 initDb 跑迁移 + seed
 * 3) spawn next dev（apps/web）
 */
import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { initDb, closeDb, resolveDbPath } from '@galaxy/db'

async function main() {
  const dbPath = resolveDbPath()
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  console.log(`[galaxy] DB path: ${dbPath}`)
  initDb()
  console.log('[galaxy] DB initialized.')
  closeDb()

  const child = spawn('pnpm', ['--filter', '@galaxy/web', 'dev'], {
    stdio: 'inherit',
    env: process.env,
  })

  const onExit = () => {
    child.kill('SIGTERM')
    process.exit(0)
  }
  process.on('SIGINT', onExit)
  process.on('SIGTERM', onExit)

  child.on('exit', (code) => process.exit(code ?? 0))
}

main().catch((err) => {
  console.error('[galaxy] dev script failed:', err)
  process.exit(1)
})
