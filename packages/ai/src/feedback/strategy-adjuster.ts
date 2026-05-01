import { getDb } from '@galaxy/db'
import { feedbackStats } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'

export interface AdjustedStrategies {
  strategies: string[]
  weights: Record<string, number>
  paused: string[]
}

/**
 * 根据历史接受率动态调整扫描策略权重。
 * 冷启动（无 feedbackStats 数据）时直接返回原始策略列表。
 */
export function getAdjustedStrategies(
  db: ReturnType<typeof getDb>,
  requestedStrategies: string[],
): AdjustedStrategies {
  const rows = db
    .select()
    .from(feedbackStats)
    .where(eq(feedbackStats.source, 'proactive_scan'))
    .all()

  if (rows.length === 0) {
    const defaultWeights: Record<string, number> = {}
    for (const strategy of requestedStrategies) {
      defaultWeights[strategy] = 1
    }
    return { strategies: requestedStrategies, weights: defaultWeights, paused: [] }
  }

  const statsByStrategy = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    if (row.strategy) {
      statsByStrategy.set(row.strategy, row)
    }
  }

  const activeStrategies: string[] = []
  const weights: Record<string, number> = {}
  const paused: string[] = []

  for (const strategy of requestedStrategies) {
    const stats = statsByStrategy.get(strategy)

    if (!stats) {
      activeStrategies.push(strategy)
      weights[strategy] = 1
      continue
    }

    const totalCount = stats.total_count
    const acceptedCount = stats.accepted_count
    const acceptanceRate = totalCount < 5 ? 0.5 : acceptedCount / totalCount

    if (acceptanceRate < 0.15 && totalCount >= 10) {
      paused.push(strategy)
      continue
    }

    const rawWeight = acceptanceRate * Math.log(totalCount + 1)
    activeStrategies.push(strategy)
    weights[strategy] = rawWeight
  }

  return { strategies: activeStrategies, weights, paused }
}
