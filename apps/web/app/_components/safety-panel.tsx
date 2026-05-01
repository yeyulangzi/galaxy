'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2, Undo2, AlertTriangle, DollarSign, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api/client'

interface UndoableOp {
  id: string
  operation: string
  affected_ids: unknown
  user_note: string | null
  created_at: string
}

interface SafetyPanelProps {
  inboxBacklog: number
  budget: { enabled: boolean; monthlyBudgetUsd: number; currentCostUsd: number; usageRate: number }
}

export function SafetyPanel({ inboxBacklog, budget }: SafetyPanelProps) {
  const [undoOps, setUndoOps] = useState<UndoableOp[]>([])
  const [undoing, setUndoing] = useState<string | null>(null)

  const loadUndoOps = useCallback(async () => {
    try {
      const data = await api.listUndoableOps()
      setUndoOps(data)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadUndoOps()
  }, [loadUndoOps])

  const handleUndo = async (opId: string) => {
    setUndoing(opId)
    try {
      const result = await api.undoOperation(opId)
      toast.success(`已撤销操作：${result.operation}`)
      loadUndoOps()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '撤销失败')
    } finally {
      setUndoing(null)
    }
  }

  const budgetPercent = budget.enabled ? Math.round(budget.usageRate * 100) : 0
  const budgetColor = budgetPercent >= 100 ? 'var(--clay-error)' : budgetPercent >= 80 ? 'var(--clay-warning)' : 'var(--clay-success)'

  return (
    <div className="space-y-4">
      {/* 月度预算 */}
      {budget.enabled && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5" style={{ color: budgetColor }} />
            <span className="text-[13px] font-medium" style={{ color: 'var(--clay-ink)' }}>月度预算</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--clay-surface-soft)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(budgetPercent, 100)}%`, background: budgetColor }}
              />
            </div>
            <span className="text-[11px] tabular-nums" style={{ color: budgetColor }}>
              ${budget.currentCostUsd.toFixed(2)} / ${budget.monthlyBudgetUsd}
            </span>
          </div>
          {budgetPercent >= 80 && (
            <p className="text-[11px] flex items-center gap-1" style={{ color: budgetColor }}>
              <AlertTriangle className="h-3 w-3" />
              {budgetPercent >= 100 ? '预算已用尽，AI 任务已暂停' : '接近预算上限'}
            </p>
          )}
        </div>
      )}

      {/* Inbox 积压告警 */}
      {inboxBacklog > 0 && (
        <div className="flex items-center gap-2">
          <Inbox className="h-3.5 w-3.5" style={{ color: inboxBacklog > 50 ? 'var(--clay-error)' : 'var(--clay-warning)' }} />
          <span className="text-[13px]" style={{ color: inboxBacklog > 50 ? 'var(--clay-error)' : 'var(--clay-muted)' }}>
            Inbox 积压 {inboxBacklog} 条待审建议
            {inboxBacklog > 100 && ' — 建议尽快处理'}
          </span>
        </div>
      )}

      {/* 操作撤销 */}
      {undoOps.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Undo2 className="h-3.5 w-3.5" style={{ color: 'var(--clay-ink)' }} />
            <span className="text-[13px] font-medium" style={{ color: 'var(--clay-ink)' }}>
              最近可撤销操作（{undoOps.length}）
            </span>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {undoOps.slice(0, 5).map((op) => (
              <div key={op.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded" style={{ background: 'var(--clay-surface-soft)' }}>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] truncate" style={{ color: 'var(--clay-ink)' }}>{op.user_note ?? op.operation}</p>
                  <p className="text-[10px]" style={{ color: 'var(--clay-muted)' }}>
                    {new Date(op.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  disabled={undoing === op.id}
                  onClick={() => handleUndo(op.id)}
                >
                  {undoing === op.id ? <Loader2 className="h-3 w-3 animate-spin" /> : '撤销'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
