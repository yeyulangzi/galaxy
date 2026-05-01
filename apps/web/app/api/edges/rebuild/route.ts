import { NextResponse } from 'next/server'
import { ensureDb } from '@/lib/api/ensure-db'
import { startRebuildTask, getTask, getActiveTask, isTaskRunning, getLastFinishedTask, clearLastFinishedTask } from '@/lib/api/edge-refresh-task'

export const dynamic = 'force-dynamic'

/**
 * POST /api/edges/rebuild
 * 启动异步重建关联任务（全量 backfill + regenerate 所有边描述），立即返回 taskId
 */
export async function POST() {
  ensureDb()

  if (isTaskRunning()) {
    const active = getActiveTask()!
    return NextResponse.json({
      data: {
        taskId: active.id,
        phase: active.phase,
        progress: active.progress,
        message: '已有任务正在执行',
      },
    })
  }

  try {
    const taskId = startRebuildTask()
    return NextResponse.json({
      data: {
        taskId,
        phase: 'backfilling',
        progress: { current: 0, total: 0 },
      },
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '启动任务失败' },
      { status: 400 },
    )
  }
}

/**
 * GET /api/edges/rebuild?taskId=xxx
 * 查询任务状态和进度（复用 refresh 的任务存储）
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get('taskId')

  if (!taskId) {
    const active = getActiveTask()
    if (!active) {
      const lastFinished = getLastFinishedTask()
      if (lastFinished) {
        clearLastFinishedTask()
        return NextResponse.json({
          data: {
            taskId: lastFinished.id,
            phase: lastFinished.phase,
            progress: lastFinished.progress,
            result: lastFinished.result,
            error: lastFinished.error,
          },
        })
      }
      return NextResponse.json({ data: { phase: 'idle' } })
    }
    return NextResponse.json({
      data: {
        taskId: active.id,
        phase: active.phase,
        progress: active.progress,
        result: active.result,
        error: active.error,
      },
    })
  }

  const task = getTask(taskId)
  if (!task) {
    return NextResponse.json({ error: '任务不存在或已过期' }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      taskId: task.id,
      phase: task.phase,
      progress: task.progress,
      result: task.result,
      error: task.error,
    },
  })
}
