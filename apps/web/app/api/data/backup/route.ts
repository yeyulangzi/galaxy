
import { NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { resolveDbPath } from '@galaxy/db'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

export async function POST() {
  ensureDb()

  const dbPath = resolveDbPath()
  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({ error: 'Database file not found' }, { status: 500 })
  }

  const backupsDir = path.join(path.dirname(dbPath), 'backups')
  fs.mkdirSync(backupsDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFileName = `galaxy-${timestamp}.db`
  const backupPath = path.join(backupsDir, backupFileName)

  fs.copyFileSync(dbPath, backupPath)

  // 也复制 WAL 和 SHM 文件（如果存在）
  const walPath = dbPath + '-wal'
  const shmPath = dbPath + '-shm'
  if (fs.existsSync(walPath)) fs.copyFileSync(walPath, backupPath + '-wal')
  if (fs.existsSync(shmPath)) fs.copyFileSync(shmPath, backupPath + '-shm')

  // 保留最近 14 个备份，删除更早的
  const allBackups = fs
    .readdirSync(backupsDir)
    .filter((f) => f.startsWith('galaxy-') && f.endsWith('.db'))
    .sort()
    .reverse()

  const toDelete = allBackups.slice(14)
  for (const oldBackup of toDelete) {
    const oldPath = path.join(backupsDir, oldBackup)
    fs.unlinkSync(oldPath)
    // 清理关联的 WAL/SHM 文件
    if (fs.existsSync(oldPath + '-wal')) fs.unlinkSync(oldPath + '-wal')
    if (fs.existsSync(oldPath + '-shm')) fs.unlinkSync(oldPath + '-shm')
  }

  const remainingCount = Math.min(allBackups.length, 14)

  return NextResponse.json({
    data: { backupPath: backupPath, backupsCount: remainingCount },
  })
}
