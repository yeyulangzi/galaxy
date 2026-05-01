import { getDb } from '@galaxy/db'
import { suggestions } from '@galaxy/db/schema'
import { eq, and, sql } from 'drizzle-orm'

interface BucketStats {
  lower: number
  upper: number
  acceptedCount: number
  totalCount: number
}

const MINIMUM_BUCKET_SAMPLES = 3
const LOOKBACK_DAYS = 90

function getBucketIndex(confidence: number): number {
  if (confidence >= 1.0) return 4
  if (confidence < 0) return 0
  return Math.min(Math.floor(confidence / 0.2), 4)
}

/**
 * 基于历史数据校准 AI 置信度。
 * 将相同 (type, source) 的历史已决定建议按置信度分桶，
 * 用每桶的实际接受率替代原始置信度。
 */
export function calibrateConfidence(
  db: ReturnType<typeof getDb>,
  rawConfidence: number,
  suggestionType: string,
  source: string,
): number {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - LOOKBACK_DAYS)
  const cutoffIso = cutoffDate.toISOString()

  const decidedSuggestions = db
    .select({
      confidence: suggestions.confidence,
      status: suggestions.status,
    })
    .from(suggestions)
    .where(
      and(
        sql`${suggestions.type} = ${suggestionType}`,
        sql`${suggestions.source} = ${source}`,
        sql`${suggestions.status} IN ('accepted', 'rejected', 'accepted_modified')`,
        sql`${suggestions.decided_at} >= ${cutoffIso}`,
      ),
    )
    .all()

  if (decidedSuggestions.length === 0) {
    return rawConfidence
  }

  const buckets: BucketStats[] = [
    { lower: 0, upper: 0.2, acceptedCount: 0, totalCount: 0 },
    { lower: 0.2, upper: 0.4, acceptedCount: 0, totalCount: 0 },
    { lower: 0.4, upper: 0.6, acceptedCount: 0, totalCount: 0 },
    { lower: 0.6, upper: 0.8, acceptedCount: 0, totalCount: 0 },
    { lower: 0.8, upper: 1.0, acceptedCount: 0, totalCount: 0 },
  ]

  for (const suggestion of decidedSuggestions) {
    const bucketIndex = getBucketIndex(suggestion.confidence)
    const bucket = buckets[bucketIndex]
    if (!bucket) continue
    bucket.totalCount++
    if (suggestion.status === 'accepted' || suggestion.status === 'accepted_modified') {
      bucket.acceptedCount++
    }
  }

  const targetBucketIndex = getBucketIndex(rawConfidence)
  const targetBucket = buckets[targetBucketIndex]

  if (!targetBucket || targetBucket.totalCount < MINIMUM_BUCKET_SAMPLES) {
    return rawConfidence
  }

  return targetBucket.acceptedCount / targetBucket.totalCount
}

/**
 * 重新校准所有待处理建议的置信度。
 * 查询所有 status='pending' 的建议，对每条重新计算 calibrated_confidence。
 */
export function recalibrateAllPending(db: ReturnType<typeof getDb>): void {
  const pendingSuggestions = db
    .select({
      id: suggestions.id,
      confidence: suggestions.confidence,
      type: suggestions.type,
      source: suggestions.source,
    })
    .from(suggestions)
    .where(eq(suggestions.status, 'pending'))
    .all()

  for (const pending of pendingSuggestions) {
    const calibrated = calibrateConfidence(db, pending.confidence, pending.type, pending.source)

    db.update(suggestions)
      .set({ calibrated_confidence: calibrated })
      .where(eq(suggestions.id, pending.id))
      .run()
  }
}
