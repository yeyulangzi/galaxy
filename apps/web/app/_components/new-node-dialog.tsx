'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useGraphStore } from '@/lib/store/graph-store'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewNodeDialog({ open, onOpenChange }: Props) {
  const { addNode } = useGraphStore()
  const [title, setTitle] = useState('')
  const [domain, setDomain] = useState('')
  const [summary, setSummary] = useState('')
  const [isSeed, setIsSeed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setTitle('')
    setDomain('')
    setSummary('')
    setIsSeed(false)
  }

  const onSubmit = async () => {
    if (!title.trim()) {
      toast.error('标题不能为空')
      return
    }
    setSubmitting(true)
    try {
      await addNode({
        title: title.trim(),
        domain: domain.trim() || null,
        summary: summary.trim() || null,
        is_seed: isSeed,
      })
      toast.success('已创建节点')
      reset()
      onOpenChange(false)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '创建失败'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>新建节点</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="new-title">标题 *</Label>
            <Input
              id="new-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：前置仓"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-domain">领域</Label>
            <Input
              id="new-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="如：即时零售"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-summary">摘要</Label>
            <Textarea
              id="new-summary"
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isSeed}
              onChange={(e) => setIsSeed(e.target.checked)}
            />
            标记为种子节点
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting ? '创建中…' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
