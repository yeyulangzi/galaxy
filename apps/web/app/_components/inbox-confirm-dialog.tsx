'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { Suggestion } from '@galaxy/shared'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface Props {
  suggestion: Suggestion | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (modifiedPayload: unknown, decisionNote: string) => Promise<void>
}

export function InboxConfirmDialog({ suggestion, open, onOpenChange, onConfirm }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [decisionNote, setDecisionNote] = useState('')

  const payload = suggestion
    ? typeof suggestion.payload === 'string' ? JSON.parse(suggestion.payload) : suggestion.payload
    : null

  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [domain, setDomain] = useState('')

  const resetForm = () => {
    if (payload) {
      setTitle(payload.title ?? '')
      setSummary(payload.summary ?? '')
      setDomain(payload.domain ?? '')
    }
    setDecisionNote('')
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) resetForm()
    onOpenChange(nextOpen)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const modifiedPayload = { ...payload, title, summary, domain }
      await onConfirm(modifiedPayload, decisionNote)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  if (!suggestion) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>修改后接受</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>标题</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>摘要</Label>
            <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>领域</Label>
            <Input value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>决策备注（可选）</Label>
            <Input value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder="为什么要修改？" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSubmit} disabled={submitting || !title.trim()}>
            {submitting ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> 提交中…</> : '修改并接受'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
