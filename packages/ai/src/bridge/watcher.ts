import fs from 'node:fs'
import path from 'node:path'

interface WatcherEntry {
  taskId: string
  callback: (result: unknown) => void
  watcher: fs.FSWatcher
  timer: ReturnType<typeof setTimeout>
}

/**
 * 监听 bridge done/ 目录，当匹配 taskId 的结果文件出现时回调。
 */
export class BridgeWatcher {
  private readonly doneDir: string
  private readonly entries = new Map<string, WatcherEntry>()

  constructor(bridgeDir: string) {
    this.doneDir = path.join(bridgeDir, 'done')
    if (!fs.existsSync(this.doneDir)) {
      fs.mkdirSync(this.doneDir, { recursive: true })
    }
  }

  /**
   * 监听 done/ 目录中匹配 taskId 的结果文件。
   * 超时后自动停止并以 null 回调。
   * 返回 cleanup 函数。
   */
  watch(
    taskId: string,
    callback: (result: unknown) => void,
    timeoutMs: number,
  ): () => void {
    const resultFileName = `${taskId}.json`
    const resultPath = path.join(this.doneDir, resultFileName)

    // 先检查是否已经有结果
    if (fs.existsSync(resultPath)) {
      const content = fs.readFileSync(resultPath, 'utf-8')
      callback(JSON.parse(content))
      return () => {}
    }

    const watcher = fs.watch(this.doneDir, (eventType, fileName) => {
      if (fileName === resultFileName && fs.existsSync(resultPath)) {
        const content = fs.readFileSync(resultPath, 'utf-8')
        this.stopWatching(taskId)
        callback(JSON.parse(content))
      }
    })

    const timer = setTimeout(() => {
      this.stopWatching(taskId)
      callback(null)
    }, timeoutMs)

    this.entries.set(taskId, { taskId, callback, watcher, timer })

    return () => this.stopWatching(taskId)
  }

  private stopWatching(taskId: string): void {
    const entry = this.entries.get(taskId)
    if (!entry) return

    clearTimeout(entry.timer)
    entry.watcher.close()
    this.entries.delete(taskId)
  }

  /**
   * 关闭所有 watcher。
   */
  close(): void {
    for (const [taskId] of this.entries) {
      this.stopWatching(taskId)
    }
  }
}
