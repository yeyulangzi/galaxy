
import { NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { suggestions, settings, nodes, feedbackStats, userPreferences } from '@galaxy/db/schema'
import { eq, and, gte, sql, inArray } from 'drizzle-orm'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

/**
 * 简单的字符串相似度计算（基于 bigram）。
 * 返回 0~1 之间的值，1 表示完全相同。
 */
function bigramSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().trim()
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1
  if (na.length < 2 || nb.length < 2) return 0

  const bigramsA = new Set<string>()
  for (let i = 0; i < na.length - 1; i++) bigramsA.add(na.slice(i, i + 2))

  const bigramsB = new Set<string>()
  for (let i = 0; i < nb.length - 1; i++) bigramsB.add(nb.slice(i, i + 2))

  let intersection = 0
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size)
}

export async function GET() {
  ensureDb()
  const db = getDb()

  // 1. 接受率统计（最近 30 天）
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const recentTotal =
    db
      .select({ count: sql<number>`count(*)` })
      .from(suggestions)
      .where(gte(suggestions.created_at, thirtyDaysAgo))
      .get()?.count ?? 0

  const recentAccepted =
    db
      .select({ count: sql<number>`count(*)` })
      .from(suggestions)
      .where(
        and(
          gte(suggestions.created_at, thirtyDaysAgo),
          eq(suggestions.status, 'accepted'),
        ),
      )
      .get()?.count ?? 0

  const acceptanceRate = recentTotal > 0 ? recentAccepted / recentTotal : 0

  // 2. Inbox 积压量
  const pendingCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(suggestions)
      .where(eq(suggestions.status, 'pending'))
      .get()?.count ?? 0

  // 3. 本月预算使用率
  const settingsRow = db.select().from(settings).where(eq(settings.id, 1)).get()
  const budgetEnabled = settingsRow?.enable_monthly_budget ?? false
  const monthlyBudget = settingsRow?.monthly_budget_usd ?? 20
  const currentCost = settingsRow?.current_month_cost_usd ?? 0
  const budgetUsageRate = budgetEnabled && monthlyBudget > 0 ? currentCost / monthlyBudget : 0

  // 4. 重复节点检测（title 相似度 > 80%）
  const allNodes = db
    .select({ id: nodes.id, title: nodes.title })
    .from(nodes)
    .where(eq(nodes.status, 'active'))
    .all()

  const duplicatePairs: Array<{ nodeA: string; nodeB: string; titleA: string; titleB: string; similarity: number }> = []
  for (let i = 0; i < allNodes.length; i++) {
    for (let j = i + 1; j < allNodes.length; j++) {
      const similarity = bigramSimilarity(allNodes[i]!.title, allNodes[j]!.title)
      if (similarity > 0.8) {
        duplicatePairs.push({
          nodeA: allNodes[i]!.id,
          nodeB: allNodes[j]!.id,
          titleA: allNodes[i]!.title,
          titleB: allNodes[j]!.title,
          similarity: Math.round(similarity * 100) / 100,
        })
      }
    }
  }

  // 5. 校准曲线（calibration）— 最近 90 天已决定的 suggestions
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const decidedStatuses = ['accepted', 'rejected', 'accepted_modified'] as const

  const decidedRows = db
    .select({
      confidence: suggestions.confidence,
      status: suggestions.status,
    })
    .from(suggestions)
    .where(
      and(
        gte(suggestions.decided_at, ninetyDaysAgo),
        inArray(suggestions.status, [...decidedStatuses]),
      ),
    )
    .all()

  const bucketBounds = [
    { min: 0, max: 0.2, midpoint: 0.1 },
    { min: 0.2, max: 0.4, midpoint: 0.3 },
    { min: 0.4, max: 0.6, midpoint: 0.5 },
    { min: 0.6, max: 0.8, midpoint: 0.7 },
    { min: 0.8, max: 1.0, midpoint: 0.9 },
  ]

  const calibration = bucketBounds.map((bucket) => {
    const inBucket = decidedRows.filter(
      (row) => row.confidence >= bucket.min && row.confidence < (bucket.max === 1.0 ? 1.01 : bucket.max),
    )
    const acceptedInBucket = inBucket.filter(
      (row) => row.status === 'accepted' || row.status === 'accepted_modified',
    ).length
    const count = inBucket.length
    const actualRate = count > 0 ? acceptedInBucket / count : 0

    return {
      range: `[${bucket.min}-${bucket.max})`,
      count,
      rawConfidence: bucket.midpoint,
      actualRate: Math.round(actualRate * 1000) / 1000,
    }
  })

  const calibrationErrors = calibration
    .filter((b) => b.count > 0)
    .map((b) => Math.abs(b.rawConfidence - b.actualRate))
  const overallCalibrationError =
    calibrationErrors.length > 0
      ? Math.round((calibrationErrors.reduce((sum, e) => sum + e, 0) / calibrationErrors.length) * 1000) / 1000
      : 0

  // 6. 用户偏好（preferences）
  const preferenceRows = db.select().from(userPreferences).all()
  const preferences: Record<string, unknown> = {}
  for (const row of preferenceRows) {
    try {
      preferences[row.preference_key] = JSON.parse(row.preference_value)
    } catch {
      preferences[row.preference_key] = row.preference_value
    }
  }

  // 7. 按类型趋势（trendByType）
  const statsRows = db.select().from(feedbackStats).all()
  const typeAggregation = new Map<string, { totalCount: number; acceptedCount: number }>()
  for (const row of statsRows) {
    const existing = typeAggregation.get(row.suggestion_type)
    if (existing) {
      existing.totalCount += row.total_count
      existing.acceptedCount += row.accepted_count
    } else {
      typeAggregation.set(row.suggestion_type, {
        totalCount: row.total_count,
        acceptedCount: row.accepted_count,
      })
    }
  }

  const trendByType: Array<{ type: string; acceptanceRate: number; count: number }> = []
  for (const [type, stats] of typeAggregation) {
    trendByType.push({
      type,
      acceptanceRate: stats.totalCount > 0 ? Math.round((stats.acceptedCount / stats.totalCount) * 100) / 100 : 0,
      count: stats.totalCount,
    })
  }

  return NextResponse.json({
    data: {
      acceptance: { accepted: recentAccepted, total: recentTotal, rate: Math.round(acceptanceRate * 100) / 100 },
      inboxBacklog: pendingCount,
      budget: {
        enabled: budgetEnabled,
        monthlyBudgetUsd: monthlyBudget,
        currentCostUsd: currentCost,
        usageRate: Math.round(budgetUsageRate * 100) / 100,
      },
      duplicateNodes: duplicatePairs,
      calibration: {
        buckets: calibration,
        overallCalibrationError,
        sampleSize: decidedRows.length,
      },
      preferences,
      trendByType,
    },
  })
}
