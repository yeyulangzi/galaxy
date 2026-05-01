import fs from 'node:fs'
import path from 'node:path'

export interface BridgeTaskFile {
  task_id: string
  task_type: 'deepdive'
  node_context: {
    id: string
    title: string
    summary: string
    domain: string
  }
  conversation_history: Array<{ role: string; content: string }>
  agent_type: 'thinker' | 'partner'
  output_schema: {
    format: 'json'
    fields: string[]
  }
  expected_output: string
  created_at: string
  timeout_minutes: number
}

const SUBDIRS = ['pending', 'done', 'cancelled', 'archive'] as const

export function ensureBridgeDirs(bridgeDir: string): void {
  for (const sub of SUBDIRS) {
    const dirPath = path.join(bridgeDir, sub)
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
  }
}

/**
 * 将任务文件写入 pending/ 目录，返回文件路径。
 */
export function createBridgeTask(bridgeDir: string, task: BridgeTaskFile): string {
  ensureBridgeDirs(bridgeDir)

  const fileName = `${task.task_id}.json`
  const filePath = path.join(bridgeDir, 'pending', fileName)

  fs.writeFileSync(filePath, JSON.stringify(task, null, 2), 'utf-8')

  return filePath
}

/**
 * 读取 done/ 目录中的结果文件。
 */
export function readBridgeResult(resultPath: string): unknown {
  const content = fs.readFileSync(resultPath, 'utf-8')
  return JSON.parse(content)
}

/**
 * 将任务从 pending/ 移到 cancelled/。
 */
export function cancelBridgeTask(taskPath: string, bridgeDir: string): void {
  ensureBridgeDirs(bridgeDir)

  const fileName = path.basename(taskPath)
  const destPath = path.join(bridgeDir, 'cancelled', fileName)

  if (fs.existsSync(taskPath)) {
    fs.renameSync(taskPath, destPath)
  }
}

/**
 * 将结果从 done/ 移到 archive/。
 */
export function archiveBridgeTask(taskPath: string, bridgeDir: string): void {
  ensureBridgeDirs(bridgeDir)

  const fileName = path.basename(taskPath)
  const destPath = path.join(bridgeDir, 'archive', fileName)

  if (fs.existsSync(taskPath)) {
    fs.renameSync(taskPath, destPath)
  }
}
