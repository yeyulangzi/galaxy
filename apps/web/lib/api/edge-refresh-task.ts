/**
 * 异步边刷新任务管理器（内存存储）
 * 
 * 流程：POST 启动任务 → 后台执行 backfill + regenerate → GET 轮询状态
 */

import { getDb } from '@galaxy/db'
import { edges, nodes, settings } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { ProviderRegistry, backfillEdgesForNode, generateEdgeDescription } from '@galaxy/ai'
import type { BackfillNodeInfo } from '@galaxy/ai'

export type TaskPhase = 'backfilling' | 'regenerating' | 'completed' | 'failed'

export interface RefreshTaskProgress {
  current: number
  total: number
}

export interface RefreshTaskResult {
  created: number
  scanned: number
  updated: number
  totalEdges: number
}

export interface RefreshTask {
  id: string
  phase: TaskPhase
  progress: RefreshTaskProgress
  result: RefreshTaskResult
  error?: string
  startedAt: number
}

/**
 * 使用 globalThis 存储任务状态，避免 Next.js dev 模式热编译导致模块级变量被重置。
 * 模块被重新加载后，globalThis 上的数据仍然保留。
 */
const TASK_STORE_KEY = '__galaxy_edge_refresh_tasks__' as const
const ACTIVE_TASK_KEY = '__galaxy_edge_refresh_active__' as const
const LAST_FINISHED_KEY = '__galaxy_edge_refresh_last_finished__' as const

function getTaskStore(): Map<string, RefreshTask> {
  if (!(globalThis as Record<string, unknown>)[TASK_STORE_KEY]) {
    (globalThis as Record<string, unknown>)[TASK_STORE_KEY] = new Map<string, RefreshTask>()
  }
  return (globalThis as Record<string, unknown>)[TASK_STORE_KEY] as Map<string, RefreshTask>
}

function getActiveTaskId(): string | null {
  return ((globalThis as Record<string, unknown>)[ACTIVE_TASK_KEY] as string | null) ?? null
}

function setActiveTaskId(id: string | null): void {
  (globalThis as Record<string, unknown>)[ACTIVE_TASK_KEY] = id
}

export function getLastFinishedTask(): RefreshTask | null {
  return ((globalThis as Record<string, unknown>)[LAST_FINISHED_KEY] as RefreshTask | null) ?? null
}

function setLastFinishedTask(task: RefreshTask): void {
  (globalThis as Record<string, unknown>)[LAST_FINISHED_KEY] = task
}

export function clearLastFinishedTask(): void {
  (globalThis as Record<string, unknown>)[LAST_FINISHED_KEY] = null
}

export function getTask(taskId: string): RefreshTask | undefined {
  return getTaskStore().get(taskId)
}

export function getActiveTask(): RefreshTask | undefined {
  const activeId = getActiveTaskId()
  if (!activeId) return undefined
  return getTaskStore().get(activeId)
}

export function isTaskRunning(): boolean {
  return getActiveTaskId() !== null
}

function generateTaskId(): string {
  return `rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/** 初始化 AI provider（复用 backfill/regenerate 的逻辑） */
function initProvider() {
  const db = getDb()
  const settingsRow = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!settingsRow) {
    throw new Error('请先在设置中配置 AI 提供商')
  }

  const registry = new ProviderRegistry()
  const envMap: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    bailian: 'DASHSCOPE_API_KEY',
    volcengine: 'ARK_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
  }
  const creds = (settingsRow?.provider_credentials ?? {}) as Record<string, { api_key?: string; base_url?: string }>
  for (const [providerId, envKey] of Object.entries(envMap)) {
    const apiKey = process.env[envKey] ?? creds[providerId]?.api_key
    if (apiKey) {
      registry.registerBuiltIn(providerId as any, { apiKey, baseUrl: creds[providerId]?.base_url })
    }
  }

  const defaultProvider = settingsRow?.default_provider ?? process.env.GALAXY_DEFAULT_PROVIDER ?? 'openai'
  const defaultModel = settingsRow?.default_model ?? process.env.GALAXY_DEFAULT_MODEL ?? 'gpt-4o-mini'
  const provider = registry.get(defaultProvider)
  if (!provider) {
    throw new Error('无可用的 AI 提供商')
  }

  return { db, provider, defaultModel }
}

/**
 * 启动异步刷新任务（增量：backfill + 只 regenerate 缺失描述的边）
 * 返回 taskId，后台执行
 */
export function startRefreshTask(): string {
  return launchTask('incremental')
}

/**
 * 启动异步重建任务（全量：backfill + regenerate 所有边描述）
 * 返回 taskId，后台执行
 */
export function startRebuildTask(): string {
  return launchTask('full')
}

function launchTask(mode: 'incremental' | 'full'): string {
  if (getActiveTaskId()) {
    throw new Error('已有任务正在执行')
  }

  const taskId = generateTaskId()
  const task: RefreshTask = {
    id: taskId,
    phase: 'backfilling',
    progress: { current: 0, total: 0 },
    result: { created: 0, scanned: 0, updated: 0, totalEdges: 0 },
    startedAt: Date.now(),
  }

  const store = getTaskStore()
  store.set(taskId, task)
  setActiveTaskId(taskId)

  // 后台执行（不 await）
  runTask(taskId, mode).catch(() => {})

  // 清理 30 分钟前的旧任务
  const cutoff = Date.now() - 30 * 60 * 1000
  for (const [id, oldTask] of store) {
    if (oldTask.startedAt < cutoff && id !== taskId) {
      store.delete(id)
    }
  }

  return taskId
}

async function runTask(taskId: string, mode: 'incremental' | 'full' = 'full') {
  const task = getTaskStore().get(taskId)!
  try {
    const { db, provider, defaultModel } = initProvider()

    // ═══ Phase 1: Backfill ═══
    task.phase = 'backfilling'

    const allNodes = db.select().from(nodes).all()
    const nodeMap = new Map(allNodes.map((n) => [n.id, n]))
    const titleToId = new Map(allNodes.map((n) => [n.title, n.id]))

    let allEdges = db.select().from(edges).all()
    const existingPairs = new Set<string>()
    const edgeCountMap = new Map<string, number>()

    for (const edge of allEdges) {
      existingPairs.add(`${edge.source_node_id}::${edge.target_node_id}`)
      existingPairs.add(`${edge.target_node_id}::${edge.source_node_id}`)
      edgeCountMap.set(edge.source_node_id, (edgeCountMap.get(edge.source_node_id) ?? 0) + 1)
      edgeCountMap.set(edge.target_node_id, (edgeCountMap.get(edge.target_node_id) ?? 0) + 1)
    }

    const sparseNodes = allNodes.filter((n) => (edgeCountMap.get(n.id) ?? 0) < 3)
    const candidates = allNodes.map((n) => ({ title: n.title }))
    task.progress = { current: 0, total: sparseNodes.length }

    for (let i = 0; i < sparseNodes.length; i++) {
      const anchor = sparseNodes[i]
      task.progress.current = i + 1

      const existingTargetTitles = new Set<string>()
      for (const edge of allEdges) {
        if (edge.source_node_id === anchor.id) {
          const target = nodeMap.get(edge.target_node_id)
          if (target) existingTargetTitles.add(target.title)
        } else if (edge.target_node_id === anchor.id) {
          const source = nodeMap.get(edge.source_node_id)
          if (source) existingTargetTitles.add(source.title)
        }
      }

      const anchorInfo: BackfillNodeInfo = {
        id: anchor.id,
        title: anchor.title,
        summary: anchor.summary,
        domain: anchor.domain,
      }

      try {
        const suggestions = await backfillEdgesForNode(anchorInfo, candidates, existingTargetTitles, provider, defaultModel)

        for (const suggestion of suggestions) {
          const targetId = titleToId.get(suggestion.targetTitle)
          if (!targetId) continue
          if (existingPairs.has(`${anchor.id}::${targetId}`)) continue

          const edgeId = `e_bf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
          db.insert(edges).values({
            id: edgeId,
            source_node_id: anchor.id,
            target_node_id: targetId,
            relation_type: suggestion.relationType,
            weight: suggestion.confidence,
            origin: 'ai_suggested',
            description: suggestion.rationale,
            created_at: new Date().toISOString(),
          }).run()

          existingPairs.add(`${anchor.id}::${targetId}`)
          existingPairs.add(`${targetId}::${anchor.id}`)
          task.result.created++
        }
      } catch {
        // 单个 anchor 失败不中断
      }
    }

    task.result.scanned = sparseNodes.length

    // ═══ Phase 2: Regenerate descriptions ═══
    task.phase = 'regenerating'

    // 重新加载边（包括 backfill 新创建的）
    allEdges = db.select().from(edges).all()
    task.result.totalEdges = allEdges.length

    // 增量模式：只处理缺失描述的边；全量模式：处理所有边
    const edgesToProcess = mode === 'incremental'
      ? allEdges.filter((e) => !e.description || e.description.trim().length === 0)
      : allEdges
    task.progress = { current: 0, total: edgesToProcess.length }

    for (let i = 0; i < edgesToProcess.length; i++) {
      const edge = edgesToProcess[i]
      task.progress.current = i + 1

      const src = nodeMap.get(edge.source_node_id)
      const tgt = nodeMap.get(edge.target_node_id)
      if (!src || !tgt) continue

      try {
        const result = await generateEdgeDescription(
          {
            sourceTitle: src.title,
            sourceSummary: src.summary ?? null,
            targetTitle: tgt.title,
            targetSummary: tgt.summary ?? null,
            relationType: edge.relation_type,
          },
          provider,
          defaultModel,
        )

        db.update(edges)
          .set({ description: result.description, weight: result.weight })
          .where(eq(edges.id, edge.id))
          .run()
        task.result.updated++
      } catch {
        // 单条失败不中断
      }
    }

    task.phase = 'completed'
  } catch (error: unknown) {
    task.phase = 'failed'
    task.error = error instanceof Error ? error.message : '未知错误'
  } finally {
    setLastFinishedTask({ ...task })
    setActiveTaskId(null)
  }
}
