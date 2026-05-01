import { eq, and } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schemaTypes from '@galaxy/db/schema'
import { generateId, nowIso } from '@galaxy/shared'

type DatabaseSchema = typeof schemaTypes
type Database = BetterSQLite3Database<DatabaseSchema>

type FeedbackAction = 'accept' | 'reject' | 'accept_modified'

interface ScanScope {
  strategies?: string[]
}

export function collectFeedback(
  db: Database,
  suggestionId: string,
  action: FeedbackAction,
): void {
  // Dynamic import to avoid circular dependency at module level
  const { suggestions, feedbackStats, scanRuns } = db._.schema as unknown as {
    suggestions: DatabaseSchema['suggestions']
    feedbackStats: DatabaseSchema['feedbackStats']
    scanRuns: DatabaseSchema['scanRuns']
  }

  const suggestion = db
    .select()
    .from(suggestions)
    .where(eq(suggestions.id, suggestionId))
    .get()

  if (!suggestion) {
    throw new Error(`Suggestion not found: ${suggestionId}`)
  }

  const { type, source, confidence, source_ref_id: sourceRefId } = suggestion

  // Determine strategy from scan_run scope if applicable
  let strategy: string | null = null
  if (source === 'proactive_scan' && sourceRefId) {
    const scanRun = db
      .select()
      .from(scanRuns)
      .where(eq(scanRuns.id, sourceRefId))
      .get()

    if (scanRun?.scope) {
      const scope = scanRun.scope as ScanScope
      strategy = scope.strategies?.join(',') ?? null
    }
  }

  const dimensionKey = `${type}:${source}:${strategy ?? 'none'}`
  const now = nowIso()

  // Query existing feedback stats for this dimension
  const existing = db
    .select()
    .from(feedbackStats)
    .where(eq(feedbackStats.dimension_key, dimensionKey))
    .get()

  if (!existing) {
    // Insert new record
    db.insert(feedbackStats)
      .values({
        id: generateId('f'),
        dimension_key: dimensionKey,
        suggestion_type: type,
        source,
        strategy,
        total_count: 1,
        accepted_count: action === 'accept' ? 1 : 0,
        rejected_count: action === 'reject' ? 1 : 0,
        modified_count: action === 'accept_modified' ? 1 : 0,
        avg_confidence: confidence,
        avg_accepted_confidence: action === 'accept' ? confidence : 0,
        avg_rejected_confidence: action === 'reject' ? confidence : 0,
        updated_at: now,
      })
      .run()
  } else {
    // Incremental mean: newAvg = oldAvg + (newValue - oldAvg) / newCount
    const newTotalCount = existing.total_count + 1
    const newAvgConfidence =
      (existing.avg_confidence ?? 0) + (confidence - (existing.avg_confidence ?? 0)) / newTotalCount

    let newAcceptedCount = existing.accepted_count
    let newRejectedCount = existing.rejected_count
    let newModifiedCount = existing.modified_count
    let newAvgAcceptedConfidence = existing.avg_accepted_confidence ?? 0
    let newAvgRejectedConfidence = existing.avg_rejected_confidence ?? 0

    if (action === 'accept') {
      newAcceptedCount += 1
      newAvgAcceptedConfidence += (confidence - newAvgAcceptedConfidence) / newAcceptedCount
    } else if (action === 'reject') {
      newRejectedCount += 1
      newAvgRejectedConfidence += (confidence - newAvgRejectedConfidence) / newRejectedCount
    } else {
      newModifiedCount += 1
    }

    db.update(feedbackStats)
      .set({
        total_count: newTotalCount,
        accepted_count: newAcceptedCount,
        rejected_count: newRejectedCount,
        modified_count: newModifiedCount,
        avg_confidence: newAvgConfidence,
        avg_accepted_confidence: newAvgAcceptedConfidence,
        avg_rejected_confidence: newAvgRejectedConfidence,
        updated_at: now,
      })
      .where(eq(feedbackStats.id, existing.id))
      .run()
  }

  // Update scan_run acceptance_rate if applicable
  if (source === 'proactive_scan' && sourceRefId) {
    const allSuggestions = db
      .select()
      .from(suggestions)
      .where(
        and(
          eq(suggestions.source, 'proactive_scan'),
          eq(suggestions.source_ref_id, sourceRefId),
        ),
      )
      .all()

    const decided = allSuggestions.filter((s) =>
      s.status === 'accepted' || s.status === 'accepted_modified' || s.status === 'rejected',
    )

    if (decided.length > 0) {
      const acceptedOrModified = decided.filter(
        (s) => s.status === 'accepted' || s.status === 'accepted_modified',
      ).length
      const acceptanceRate = acceptedOrModified / decided.length

      db.update(scanRuns)
        .set({ acceptance_rate: acceptanceRate })
        .where(eq(scanRuns.id, sourceRefId))
        .run()
    }
  }

  // Mark suggestion as feedback_processed
  db.update(suggestions)
    .set({ feedback_processed: true })
    .where(eq(suggestions.id, suggestionId))
    .run()
}
