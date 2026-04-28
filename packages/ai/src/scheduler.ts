import { getDb } from '@galaxy/db'
import { settings, scanRuns } from '@galaxy/db/schema'
import { generateId, nowIso } from '@galaxy/shared'
import { eq } from 'drizzle-orm'
import { ProviderRegistry } from './providers/registry'
import { decrypt } from './crypto'
import { checkBudget } from './budget'
import { runScan } from './tasks/run-scan'

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
