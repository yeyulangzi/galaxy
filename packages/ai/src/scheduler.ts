import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '@galaxy/db'
import { settings, scanRuns, operationLogs, suggestions, deepDiveSessions } from '@galaxy/db/schema'
import { generateId, nowIso } from '@galaxy/shared'
import { eq, and, lt, isNotNull } from 'drizzle-orm'
import { ProviderRegistry } from './providers/registry'
import { decrypt } from './crypto'
import { checkBudget } from './budget'
import { runScan } from './tasks/run-scan'
import { recalibrateAllPending } from './feedback/calibrator'
import { learnPreferences } from './feedback/personalizer'

let schedulerTimer: ReturnType<typeof setInterval> | null = null
let lastCheckMinute = ''

/**
 * 解析简单 cron 表达式（分 时 日 月 周）。
 * 仅支持数字和 * 通配符，足以满足基本调度需求。
 */
function matchesCron(cronExpression: string, date: Date): boolean {
  const parts = cronExpression.trim().split(/\s+/)
  if (parts.length !== 5) return false

  const [cronMinute, cronHour, cronDay, cronMonth, cronWeekday] = parts
  const minute = date.getMinutes()
  const hour = date.getHours()
  const day = date.getDate()
  const month = date.getMonth() + 1
  const weekday = date.getDay()

  return (
    matchesCronField(cronMinute!, minute) &&
    matchesCronField(cronHour!, hour) &&
    matchesCronField(cronDay!, day) &&
    matchesCronField(cronMonth!, month) &&
    matchesCronField(cronWeekday!, weekday)
  )
}

/**
 * 匹配单个 cron 字段。支持：
 * - * （任意值）
 * - 数字（精确匹配）
 * - a/b（步进，如 * /5 表示每 5 单位）
 * - a,b,c（多值列表）
 */
function matchesCronField(field: string, value: number): boolean {
  if (field === '*') return true

  // 步进：*/n
  if (field.includes('/')) {
    const [base, stepStr] = field.split('/')
    const step = parseInt(stepStr!, 10)
    if (isNaN(step) || step <= 0) return false
    if (base === '*') return value % step === 0
    const baseValue = parseInt(base!, 10)
    if (isNaN(baseValue)) return false
    return value >= baseValue && (value - baseValue) % step === 0
  }

  // 多值列表：a,b,c
  if (field.includes(',')) {
    return field.split(',').some((part) => parseInt(part, 10) === value)
  }

  // 精确匹配
  return parseInt(field, 10) === value
}

/**
 * 构建 ProviderRegistry 并获取扫描使用的 provider。
 */
function buildProviderForScan(): { provider: ReturnType<ProviderRegistry['getOrThrow']>; providerId: string; model: string } | null {
  const db = getDb()
  const row = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!row) return null

  const providerId = row.default_provider
  const model = row.default_model
  if (!providerId || !model) return null

  const credentials = (row.provider_credentials ?? {}) as Record<string, { api_key?: string }>
  const providerCred = credentials[providerId]
  if (!providerCred?.api_key) return null

  let apiKey: string
  try {
    apiKey = decrypt(providerCred.api_key)
  } catch {
    apiKey = providerCred.api_key
  }

  const registry = new ProviderRegistry()
  try {
    registry.registerBuiltIn(providerId as Parameters<ProviderRegistry['registerBuiltIn']>[0], { apiKey })
  } catch {
    return null
  }

  const provider = registry.get(providerId)
  if (!provider) return null

  return { provider, providerId, model }
}

/**
 * 执行一次扫描的内部逻辑。
 */
async function executeScan(trigger: 'cron' | 'manual'): Promise<string | null> {
  const db = getDb()
  const row = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!row) return null

  const budgetCheck = checkBudget()
  if (!budgetCheck.withinBudget) return null

  const providerInfo = buildProviderForScan()
  if (!providerInfo) return null

  const strategies = (row.proactive_scan_strategies ?? ['islands', 'gaps']) as string[]
  const maxSuggestions = row.proactive_scan_max_suggestions ?? 10
  const scanRunId = generateId('r')

  db.insert(scanRuns)
    .values({
      id: scanRunId,
      trigger,
      status: 'running',
      started_at: nowIso(),
      provider_id: providerInfo.providerId,
      model: providerInfo.model,
    })
    .run()

  // 异步执行扫描，不阻塞
  runScan({
    strategies,
    provider: providerInfo.provider,
    model: providerInfo.model,
    maxSuggestions,
    scanRunId,
  }).catch((error) => {
    console.error('[scheduler] Scan failed:', error)
  })

  return scanRunId
}

/**
 * 调度器 tick：每分钟检查是否应该执行扫描。
 */
function tick(): void {
  const now = new Date()
  const currentMinute = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`

  // 防止同一分钟内重复触发
  if (currentMinute === lastCheckMinute) return
  lastCheckMinute = currentMinute

  try {
    const db = getDb()

    // 每日凌晨 4:00 执行置信度重校准
    if (now.getHours() === 4 && now.getMinutes() === 0) {
      try {
        console.log('[scheduler] Running daily confidence recalibration')
        recalibrateAllPending(db)
        db.insert(operationLogs)
          .values({
            id: generateId('o'),
            operation: 'recalibrate_confidence',
            affected_ids: JSON.stringify([]),
            user_note: 'Daily confidence recalibration completed',
            created_at: nowIso(),
          })
          .run()
      } catch (recalError) {
        console.error('[scheduler] Recalibration failed:', recalError)
      }
    }

    // 每日凌晨 4:30 执行用户偏好学习
    if (now.getHours() === 4 && now.getMinutes() === 30) {
      try {
        console.log('[scheduler] Running daily preference learning')
        learnPreferences(db)
        db.insert(operationLogs)
          .values({
            id: generateId('o'),
            operation: 'learn_preferences',
            affected_ids: JSON.stringify([]),
            user_note: 'Daily preference learning completed',
            created_at: nowIso(),
          })
          .run()
      } catch (prefError) {
        console.error('[scheduler] Preference learning failed:', prefError)
      }
    }

    // ── 每小时整点：过期 pending suggestions ──
    if (now.getMinutes() === 0) {
      try {
        const nowStr = now.toISOString()
        const expired = db
          .update(suggestions)
          .set({ status: 'expired', decided_at: nowStr })
          .where(
            and(
              eq(suggestions.status, 'pending'),
              isNotNull(suggestions.expires_at),
              lt(suggestions.expires_at, nowStr),
            ),
          )
          .run()

        if (expired.changes > 0) {
          console.log(`[scheduler] Expired ${expired.changes} stale suggestions`)
        }
      } catch (expireError) {
        console.error('[scheduler] Suggestion expiry failed:', expireError)
      }
    }

    // ── 每日 05:00：清理 Bridge archive 超过 7 天的文件 ──
    if (now.getHours() === 5 && now.getMinutes() === 0) {
      try {
        const row = db.select().from(settings).where(eq(settings.id, 1)).get()
        const bridgeDir = row?.qoder_bridge_dir?.replace(/^~/, process.env.HOME ?? '') ?? ''
        const archiveDir = path.join(bridgeDir, 'archive')

        if (fs.existsSync(archiveDir)) {
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
          const files = fs.readdirSync(archiveDir)
          let cleaned = 0

          for (const file of files) {
            const filePath = path.join(archiveDir, file)
            const stat = fs.statSync(filePath)
            if (stat.mtimeMs < sevenDaysAgo) {
              fs.unlinkSync(filePath)
              cleaned++
            }
          }

          if (cleaned > 0) {
            console.log(`[scheduler] Cleaned ${cleaned} archived bridge files older than 7 days`)
          }
        }
      } catch (archiveError) {
        console.error('[scheduler] Bridge archive cleanup failed:', archiveError)
      }
    }

    // ── 每 30 分钟（整点和半点）：Deep Dive 超时检测 ──
    if (now.getMinutes() === 0 || now.getMinutes() === 30) {
      try {
        const row = db.select().from(settings).where(eq(settings.id, 1)).get()
        const timeoutMinutes = row?.bridge_timeout_minutes ?? 30
        const cutoff = new Date(now.getTime() - timeoutMinutes * 60 * 1000).toISOString()

        const timedOut = db
          .update(deepDiveSessions)
          .set({ status: 'abandoned', updated_at: now.toISOString() })
          .where(
            and(
              eq(deepDiveSessions.status, 'active'),
              lt(deepDiveSessions.updated_at, cutoff),
            ),
          )
          .run()

        if (timedOut.changes > 0) {
          console.log(`[scheduler] Marked ${timedOut.changes} stale deep-dive sessions as abandoned`)
        }
      } catch (timeoutError) {
        console.error('[scheduler] Deep Dive timeout check failed:', timeoutError)
      }
    }

    const row = db.select().from(settings).where(eq(settings.id, 1)).get()
    if (!row || !row.enable_proactive_scan) return

    const cronExpr = row.proactive_scan_cron ?? '0 3 * * *'
    if (matchesCron(cronExpr, now)) {
      executeScan('cron').catch((error) => {
        console.error('[scheduler] Cron scan trigger failed:', error)
      })
    }
  } catch (error) {
    console.error('[scheduler] Tick error:', error)
  }
}

/**
 * 启动调度器：每 30 秒检查一次 cron 是否匹配。
 */
export function startScheduler(): void {
  if (schedulerTimer) return
  console.log('[scheduler] Starting proactive scan scheduler')
  schedulerTimer = setInterval(tick, 30_000)
  // 立即执行一次检查
  tick()
}

/**
 * 停止调度器。
 */
export function stopScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer)
    schedulerTimer = null
    console.log('[scheduler] Stopped proactive scan scheduler')
  }
}

/**
 * 手动触发一次扫描。
 * 返回 scanRunId，扫描在后台异步执行。
 */
export async function triggerManualScan(): Promise<string | null> {
  return executeScan('manual')
}
