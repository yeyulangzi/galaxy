'use client'

import { useEffect, useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Inbox } from 'lucide-react'
import type { Suggestion } from '@galaxy/shared'
import { Button } from '@/components/ui/button'
import { useInboxStore } from '@/lib/store/inbox-store'
import { InboxCard } from '../_components/inbox-card'
import { InboxConfirmDialog } from '../_components/inbox-confirm-dialog'
import { NavBar } from '../_components/nav-bar'

export default function InboxPage() {
  const {
    suggestions, total, loading, error,
    loadInbox, confirmOne, batchConfirm,
    selectedIds, toggleSelect, selectAll, clearSelection,
  } = useInboxStore()

  const [editTarget, setEditTarget] = useState<Suggestion | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  useEffect(() => {
    loadInbox({ status: 'pending', limit: '500' })
  }, [loadInbox])

  const handleAccept = useCallback(async (id: string) => {
    try {
      await confirmOne(id, 'accept')
      toast.success('已接受')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    }
  }, [confirmOne])

  const handleReject = useCallback(async (id: string) => {
    try {
      await confirmOne(id, 'reject')
      toast.success('已拒绝')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    }
  }, [confirmOne])

  const handleEdit = useCallback((suggestion: Suggestion) => {
    setEditTarget(suggestion)
    setEditDialogOpen(true)
  }, [])

  const handleEditConfirm = useCallback(async (modifiedPayload: unknown, decisionNote: string) => {
    if (!editTarget) return
    try {
      await confirmOne(editTarget.id, 'accept_modified', { modified_payload: modifiedPayload, decision_note: decisionNote })
      toast.success('修改后已接受')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    }
  }, [editTarget, confirmOne])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const focused = suggestions[0]
      if (!focused) return
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); handleAccept(focused.id) }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); handleReject(focused.id) }
      if (e.key === 'e' || e.key === 'E') { e.preventDefault(); handleEdit(focused) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [suggestions, handleAccept, handleReject, handleEdit])

  return (
    <>
      <NavBar />
      <div className="mx-auto max-w-5xl px-6 py-8 animate-fade-in">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-display-sm">待审队列</h1>
            <p className="mt-1 text-body-md" style={{ color: 'var(--clay-muted)' }}>{total} 条待处理建议</p>
          </div>
          <div className="flex gap-2">
            {selectedIds.size > 0 ? (
              <>
                <Button
                  size="sm"
                  onClick={() => batchConfirm('accept').then(() => toast.success('批量接受完成'))}
                  className="h-8 rounded-[var(--radius-md)]"
                  style={{ background: 'var(--clay-primary)', color: 'var(--clay-on-primary)' }}
                >
                  接受 {selectedIds.size} 条
                </Button>
                <Button
                  size="sm"
                  onClick={() => batchConfirm('reject').then(() => toast.success('批量拒绝完成'))}
                  className="h-8 rounded-[var(--radius-md)]"
                  style={{ background: 'var(--clay-coral)', color: 'var(--clay-on-primary)' }}
                >
                  拒绝
                </Button>
                <button onClick={clearSelection} className="h-8 px-2 text-xs transition-colors" style={{ color: 'var(--clay-muted)' }}>
                  取消
                </button>
              </>
            ) : (
              <button onClick={selectAll} className="h-8 px-2 text-xs transition-colors" style={{ color: 'var(--clay-muted)' }}>
                全选
              </button>
            )}
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: 'var(--clay-hairline)', borderTopColor: 'var(--clay-primary)', borderRadius: '999px' }} />
          </div>
        )}
        {error && <p className="text-center py-8" style={{ color: 'var(--clay-error)' }}>{error}</p>}

        <div className="space-y-2">
          {suggestions.map((s) => (
            <InboxCard
              key={s.id}
              suggestion={s}
              selected={selectedIds.has(s.id)}
              onToggleSelect={() => toggleSelect(s.id)}
              onAccept={() => handleAccept(s.id)}
              onReject={() => handleReject(s.id)}
              onEdit={() => handleEdit(s)}
            />
          ))}
        </div>

        {!loading && suggestions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[var(--radius-xl)] clay-card">
              <Inbox className="h-7 w-7" style={{ color: 'var(--clay-muted)' }} />
            </div>
            <p className="text-title-md" style={{ color: 'var(--clay-muted)' }}>队列已清空</p>
            <p className="mt-1 text-body-md" style={{ color: 'var(--clay-muted-soft)' }}>投喂新内容后，AI 建议会出现在这里</p>
          </div>
        )}

        <InboxConfirmDialog
          suggestion={editTarget}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onConfirm={handleEditConfirm}
        />
      </div>
    </>
  )
}
