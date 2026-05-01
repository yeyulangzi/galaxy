import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { settings } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { ensureDb } from '@/lib/api/ensure-db'
import { ensureBridgeDirs } from '@galaxy/ai'

export const dynamic = 'force-dynamic'

interface BridgeFile {
  name: string
  modifiedAt: string
  taskId: string
}

function listBridgeFiles(dirPath: string): BridgeFile[] {
  if (!fs.existsSync(dirPath)) return []

  return fs.readdirSync(dirPath)
    .filter((f) => f.endsWith('.json'))
    .map((name) => {
      const filePath = path.join(dirPath, name)
      const stat = fs.statSync(filePath)
      return {
        name,
        modifiedAt: stat.mtime.toISOString(),
        taskId: name.replace(/\.json$/, ''),
      }
    })
    .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
}

/**
 * GET /api/bridge/status — 获取 Bridge 各子目录的任务文件状态
 */
export async function GET() {
  ensureDb()
  const db = getDb()

  const row = db.select().from(settings).where(eq(settings.id, 1)).get()
  const rawDir = row?.qoder_bridge_dir ?? '~/galaxy/bridge/'
  const bridgeDir = rawDir.replace(/^~/, process.env.HOME ?? '')

  try {
    ensureBridgeDirs(bridgeDir)
  } catch {
    return NextResponse.json(
      { error: 'Bridge directory not accessible', bridgeDir },
      { status: 500 },
    )
  }

  const data = {
    bridgeDir,
    pending: listBridgeFiles(path.join(bridgeDir, 'pending')),
    done: listBridgeFiles(path.join(bridgeDir, 'done')),
    cancelled: listBridgeFiles(path.join(bridgeDir, 'cancelled')),
    archive: listBridgeFiles(path.join(bridgeDir, 'archive')),
  }

  return NextResponse.json({ data })
}
