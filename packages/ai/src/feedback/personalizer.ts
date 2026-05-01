import { getDb } from '@galaxy/db'
import { suggestions, feedbackStats, userPreferences } from '@galaxy/db/schema'
import { generateId, nowIso } from '@galaxy/shared'
import { eq, sql, desc, and, gte } from 'drizzle-orm'

type Database = ReturnType<typeof getDb>

// ── helpers ───────────────────────────────────────────────────────────

function upsertPreference(
  db: Database,
  key: string,
  value: string,
  evidenceCount: number,
): void {
  const now = nowIso()
  const existing = db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.preference_key, key))
    .get()

  if (existing) {
    db.update(userPreferences)
      .set({
        preference_value: value,
        evidence_count: evidenceCount,
        learned_at: now,
        updated_at: now,
      })
      .where(eq(userPreferences.id, existing.id))
      .run()
  } else {
    db.insert(userPreferences)
      .values({
        id: generateId('pref'),
        preference_key: key,
        preference_value: value,
        source: 'learned',
        evidence_count: evidenceCount,
        learned_at: now,
        updated_at: now,
      })
      .run()
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    const left = sorted[mid - 1] ?? 0
    const right = sorted[mid] ?? 0
    return (left + right) / 2
  }
  return sorted[mid] ?? 0
}

// ── main ──────────────────────────────────────────────────────────────

/**
 * Analyze historical feedback and upsert learned user preferences.
 *
 * Covers four dimensions:
 *   1. Minimum confidence threshold (from rejected suggestions)
 *   2. Suggestion-type preferences (from feedbackStats acceptance rates)
 *   3. Title-length preference (from accepted_modified suggestions)
 *   4. Relation-type preferences (from new_edge suggestions)
 */
export function learnPreferences(db: ReturnType<typeof getDb>): void {
  learnConfidenceThreshold(db)
  learnTypePreferences(db)
  learnTitleLengthPreference(db)
  learnRelationTypePreferences(db)
}

// ── a. confidence threshold ───────────────────────────────────────────

function learnConfidenceThreshold(db: Database): void {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

  const rejectedRows = db
    .select({ confidence: suggestions.confidence })
    .from(suggestions)
    .where(
      and(
        eq(suggestions.status, 'rejected'),
        gte(suggestions.decided_at, sixtyDaysAgo),
      ),
    )
    .all()

  if (rejectedRows.length === 0) return

  const confidenceValues = rejectedRows.map((row) => row.confidence)
  const threshold = median(confidenceValues)

  upsertPreference(
    db,
    'min_confidence_threshold',
    JSON.stringify({ threshold, sample_size: rejectedRows.length }),
    rejectedRows.length,
  )
}

// ── b. type preferences ──────────────────────────────────────────────

function learnTypePreferences(db: Database): void {
  const rows = db
    .select({
      suggestionType: feedbackStats.suggestion_type,
      totalCount: feedbackStats.total_count,
      acceptedCount: feedbackStats.accepted_count,
    })
    .from(feedbackStats)
    .all()

  if (rows.length === 0) return

  // Aggregate across all sources/strategies per suggestion_type
  const aggregated = new Map<string, { totalCount: number; acceptedCount: number }>()
  for (const row of rows) {
    const existing = aggregated.get(row.suggestionType)
    if (existing) {
      existing.totalCount += row.totalCount
      existing.acceptedCount += row.acceptedCount
    } else {
      aggregated.set(row.suggestionType, {
        totalCount: row.totalCount,
        acceptedCount: row.acceptedCount,
      })
    }
  }

  const preferred: string[] = []
  const avoided: string[] = []
  const rates: Record<string, number> = {}

  for (const [type, stats] of aggregated) {
    if (stats.totalCount === 0) continue
    const acceptanceRate = stats.acceptedCount / stats.totalCount
    rates[type] = acceptanceRate

    if (acceptanceRate > 0.6) {
      preferred.push(type)
    } else if (acceptanceRate < 0.2) {
      avoided.push(type)
    }
  }

  upsertPreference(
    db,
    'type_preferences',
    JSON.stringify({ preferred, avoided, rates }),
    rows.length,
  )
}

// ── c. title length preference ───────────────────────────────────────

function learnTitleLengthPreference(db: Database): void {
  const modifiedRows = db
    .select({
      payload: suggestions.payload,
      decidedPayload: suggestions.decided_payload,
    })
    .from(suggestions)
    .where(eq(suggestions.status, 'accepted_modified'))
    .all()

  if (modifiedRows.length === 0) return

  let originalTotalLength = 0
  let modifiedTotalLength = 0
  let validCount = 0

  for (const row of modifiedRows) {
    const original = row.payload as Record<string, unknown> | null
    const modified = row.decidedPayload as Record<string, unknown> | null

    const originalTitle = original?.title
    const modifiedTitle = modified?.title

    if (typeof originalTitle !== 'string' || typeof modifiedTitle !== 'string') continue

    originalTotalLength += originalTitle.length
    modifiedTotalLength += modifiedTitle.length
    validCount += 1
  }

  if (validCount === 0) return

  const averageOriginalLength = originalTotalLength / validCount
  const averageModifiedLength = modifiedTotalLength / validCount

  upsertPreference(
    db,
    'title_length_preference',
    JSON.stringify({
      average_original_length: averageOriginalLength,
      average_modified_length: averageModifiedLength,
      sample_size: validCount,
    }),
    validCount,
  )
}

// ── d. relation type preferences ─────────────────────────────────────

function learnRelationTypePreferences(db: Database): void {
  const edgeRows = db
    .select({
      payload: suggestions.payload,
      status: suggestions.status,
    })
    .from(suggestions)
    .where(eq(suggestions.type, 'new_edge'))
    .all()

  if (edgeRows.length === 0) return

  const stats = new Map<string, { total: number; accepted: number }>()

  for (const row of edgeRows) {
    const payload = row.payload as Record<string, unknown> | null
    const relationType = payload?.relation_type
    if (typeof relationType !== 'string') continue

    const existing = stats.get(relationType) ?? { total: 0, accepted: 0 }
    existing.total += 1

    if (row.status === 'accepted' || row.status === 'accepted_modified') {
      existing.accepted += 1
    }

    stats.set(relationType, existing)
  }

  const rates: Record<string, number> = {}
  for (const [type, stat] of stats) {
    rates[type] = stat.total > 0 ? stat.accepted / stat.total : 0
  }

  upsertPreference(
    db,
    'relation_type_preferences',
    JSON.stringify({ rates, sample_size: edgeRows.length }),
    edgeRows.length,
  )
}
