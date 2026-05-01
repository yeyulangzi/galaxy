import { getDb } from '@galaxy/db'
import { feedbackStats, suggestions, userPreferences } from '@galaxy/db/schema'
import { eq, and, desc } from 'drizzle-orm'

/**
 * 构建历史反馈摘要，注入到 AI prompt 中以提高建议质量。
 * 如果没有任何反馈数据，返回空字符串。
 */
export function buildFeedbackContext(db: ReturnType<typeof getDb>): string {
  const allStats = db.select().from(feedbackStats).all()

  if (allStats.length === 0) {
    return ''
  }

  const sections: string[] = []

  // --- 历史反馈统计 ---
  const statsLines: string[] = ['## 历史反馈（近期统计）', '']
  for (const stat of allStats) {
    const totalCount = stat.total_count
    if (totalCount === 0) continue

    const acceptanceRate = stat.accepted_count / totalCount
    const modifiedRate = stat.modified_count / totalCount
    const ratePercent = (acceptanceRate * 100).toFixed(1)

    let line = `- **${stat.suggestion_type}**（${stat.source}）: 接受率 ${ratePercent}%, 总数 ${totalCount}`

    if (acceptanceRate < 0.3) {
      line += ' ← 需提高质量'
    }

    if (modifiedRate > 0.2) {
      line += '  ⚠ 用户常修改此类建议'
    }

    statsLines.push(line)
  }
  sections.push(statsLines.join('\n'))

  // --- 最近被拒绝的建议及原因 ---
  const rejectedSuggestions = db
    .select({
      type: suggestions.type,
      decision_note: suggestions.decision_note,
    })
    .from(suggestions)
    .where(
      and(
        eq(suggestions.status, 'rejected'),
      ),
    )
    .orderBy(desc(suggestions.decided_at))
    .limit(20)
    .all()
    .filter((row) => row.decision_note !== null && row.decision_note.trim() !== '')
    .slice(0, 5)

  if (rejectedSuggestions.length > 0) {
    const rejectionLines: string[] = ['', '### 近期拒绝原因', '']
    for (const suggestion of rejectedSuggestions) {
      rejectionLines.push(`- [${suggestion.type}] ${suggestion.decision_note}`)
    }
    sections.push(rejectionLines.join('\n'))
  }

  // --- 用户知识偏好 ---
  const preferences = db.select().from(userPreferences).all()

  if (preferences.length > 0) {
    const prefLines: string[] = ['', '## 用户知识偏好', '']
    for (const pref of preferences) {
      prefLines.push(`- **${pref.preference_key}**: ${pref.preference_value}（证据数: ${pref.evidence_count}）`)
    }
    sections.push(prefLines.join('\n'))
  }

  return sections.join('\n')
}
