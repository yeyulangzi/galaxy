'use client'

import { useEffect, useCallback, useState } from 'react'
import { toast } from 'sonner'
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
    loadInbox({ status: 'pending' })
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
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">📥 待审队列 ({total})</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>全选</Button>
            <Button variant="outline" size="sm" onClick={clearSelection}>取消选择</Button>
            {selectedIds.size > 0 && (
              <>
                <Button size="sm" onClick={() => batchConfirm('accept').then(() => toast.success('批量接受完成'))}>
                  批量接受 ({selectedIds.size})
                </Button>
                <Button variant="destructive" size="sm" onClick={() => batchConfirm('reject').then(() => toast.success('批量拒绝完成'))}>
                  批量拒绝 ({selectedIds.size})
                </Button>
              </>
            )}
          </div>
        </div>

        {loading && <p className="text-center text-muted-foreground">加载中…</p>}
        {error && <p className="text-center text-red-500">{error}</p>}

        <div className="space-y-3">
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
          <div className="py-16 text-center text-muted-foreground">
            <p className="text-4xl mb-2">🎉</p>
            <p>Inbox 清空了！去投喂一些内容吧。</p>
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
