import { NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { settings, scanRuns } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { generateId, nowIso } from '@galaxy/shared'
import { ProviderRegistry, decrypt, checkBudget, runScan } from '@galaxy/ai'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

export async function POST() {
  ensureDb()
  const db = getDb()

  const row = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!row) {
    return NextResponse.json({ error: 'Settings not initialized' }, { status: 500 })
  }

  // 检查预算
  const budgetCheck = checkBudget()
  if (!budgetCheck.withinBudget) {
    return NextResponse.json({ error: 'Monthly budget exceeded' }, { status: 429 })
  }

  // 获取 provider 配置
  const providerId = row.default_provider
  const model = row.default_model
  if (!providerId || !model) {
    return NextResponse.json({ error: 'No default provider/model configured' }, { status: 400 })
  }

  const credentials = (row.provider_credentials ?? {}) as Record<string, { api_key?: string; base_url?: string }>
  const providerCred = credentials[providerId]
  if (!providerCred?.api_key) {
    return NextResponse.json({ error: `No API key configured for provider: ${providerId}` }, { status: 400 })
  }

  let apiKey: string
  try {
    apiKey = decrypt(providerCred.api_key)
  } catch {
    apiKey = providerCred.api_key
  }

  const registry = new ProviderRegistry()
  try {
    registry.registerBuiltIn(providerId as Parameters<ProviderRegistry['registerBuiltIn']>[0], { apiKey, baseUrl: providerCred.base_url })
  } catch {
    return NextResponse.json({ error: `Unsupported provider: ${providerId}` }, { status: 400 })
  }

  const provider = registry.getOrThrow(providerId)

  // 读取扫描配置
  const strategies = (row.proactive_scan_strategies ?? ['islands', 'gaps']) as string[]
  const maxSuggestions = row.proactive_scan_max_suggestions ?? 10

  // 创建 scan_runs 记录
  const scanRunId = generateId('r')
  db.insert(scanRuns)
    .values({
      id: scanRunId,
      trigger: 'manual',
      status: 'running',
      started_at: nowIso(),
      provider_id: providerId,
      model,
    })
    .run()

  // 异步执行扫描，不阻塞请求
  runScan({
    strategies,
    provider,
    model,
    maxSuggestions,
    scanRunId,
  }).catch((error) => {
    console.error('[scan/trigger] Scan failed:', error)
  })

  return NextResponse.json({ data: { scanRunId } })
}
