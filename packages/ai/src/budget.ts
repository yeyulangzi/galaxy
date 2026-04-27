import { getDb } from '@galaxy/db'
import { settings, aiCallLogs } from '@galaxy/db/schema'
import { eq, sql } from 'drizzle-orm'

/**
 * 检查当月预算是否超限。
 * 返回 true 表示还有预算，false 表示已超限。
 */
export function checkBudget(): { withinBudget: boolean; currentCost: number; budgetLimit: number } {
  const db = getDb()
  const row = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!row || !row.enable_monthly_budget) {
    return { withinBudget: true, currentCost: 0, budgetLimit: Infinity }
  }

  const currentMonthKey = new Date().toISOString().slice(0, 7) // YYYY-MM

  // 如果是新月份，重置累计
  if (row.current_month_key !== currentMonthKey) {
    db.update(settings)
      .set({ current_month_key: currentMonthKey, current_month_cost_usd: 0 })
      .where(eq(settings.id, 1))
      .run()
    return { withinBudget: true, currentCost: 0, budgetLimit: row.monthly_budget_usd }
  }

  return {
    withinBudget: row.current_month_cost_usd < row.monthly_budget_usd,
    currentCost: row.current_month_cost_usd,
    budgetLimit: row.monthly_budget_usd,
  }
}

/**
 * 累加本月消费。
 */
export function addCost(costUsd: number): void {
  const db = getDb()
  const currentMonthKey = new Date().toISOString().slice(0, 7)
  db.update(settings)
    .set({
      current_month_cost_usd: sql`${settings.current_month_cost_usd} + ${costUsd}`,
      current_month_key: currentMonthKey,
    })
    .where(eq(settings.id, 1))
    .run()
}
