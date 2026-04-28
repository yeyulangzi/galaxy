import { NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { aiCallLogs } from '@galaxy/db/schema'
import { sql } from 'drizzle-orm'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

interface ProviderCostStat {
  providerId: string
  costUsd: number
  calls: number
}

export async function GET() {
  ensureDb()
  const db = getDb()

  // 总计统计
  const totalRow = db
    .select({
      totalCostUsd: sql<number>`coalesce(sum(${aiCallLogs.cost_usd}), 0)`,
      totalCalls: sql<number>`count(*)`,
    })
    .from(aiCallLogs)
    .get()

  // 本月统计
  const monthKey = new Date().toISOString().slice(0, 7) // "YYYY-MM"
  const thisMonthRow = db
    .select({
      thisMonthCostUsd: sql<number>`coalesce(sum(${aiCallLogs.cost_usd}), 0)`,
      thisMonthCalls: sql<number>`count(*)`,
    })
    .from(aiCallLogs)
    .where(sql`substr(${aiCallLogs.created_at}, 1, 7) = ${monthKey}`)
    .get()

  // 按 provider 分组
  const byProviderRows = db
    .select({
      providerId: aiCallLogs.provider_id,
      costUsd: sql<number>`coalesce(sum(${aiCallLogs.cost_usd}), 0)`,
      calls: sql<number>`count(*)`,
    })
    .from(aiCallLogs)
    .groupBy(aiCallLogs.provider_id)
    .all()

  const byProvider: ProviderCostStat[] = byProviderRows.map((row) => ({
    providerId: row.providerId ?? 'unknown',
    costUsd: row.costUsd,
    calls: row.calls,
  }))

  return NextResponse.json({
    data: {
      totalCostUsd: totalRow?.totalCostUsd ?? 0,
      totalCalls: totalRow?.totalCalls ?? 0,
      thisMonthCostUsd: thisMonthRow?.thisMonthCostUsd ?? 0,
      thisMonthCalls: thisMonthRow?.thisMonthCalls ?? 0,
      byProvider,
    },
  })
}
