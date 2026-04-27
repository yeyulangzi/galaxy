'use client'

import { useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api/client'
import { useInboxStore } from '@/lib/store/inbox-store'

export function FeedFab() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'text' | 'url'>('text')
  const [textContent, setTextContent] = useState('')
  const [urlContent, setUrlContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { loadInbox } = useInboxStore()

  const reset = () => {
    setTextContent('')
    setUrlContent('')
    setMode('text')
  }

  const onSubmit = async () => {
    setSubmitting(true)
    try {
      const input = mode === 'text'
        ? { type: 'text' as const, content: textContent.trim() }
        : { type: 'url' as const, url: urlContent.trim() }
      const result = await api.submitFeed(input)
      toast.success(`✅ 抽取出 ${result.suggestions_count} 条建议`)
      reset()
      setOpen(false)
      loadInbox({ status: 'pending' })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '投喂失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        size="icon"
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-6 w-6" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>投喂知识</DialogTitle>
          </DialogHeader>

          <div className="flex gap-2 border-b pb-2">
            <Button variant={mode === 'text' ? 'default' : 'outline'} size="sm" onClick={() => setMode('text')}>文本</Button>
            <Button variant={mode === 'url' ? 'default' : 'outline'} size="sm" onClick={() => setMode('url')}>URL</Button>
          </div>

          {mode === 'text' ? (
            <div className="space-y-1">
              <Label>粘贴文本内容</Label>
              <Textarea
                rows={8}
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="粘贴一段文章、笔记、摘抄……AI 会从中抽取知识节点"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label>输入 URL</Label>
              <Input
                type="url"
                value={urlContent}
                onChange={(e) => setUrlContent(e.target.value)}
                placeholder="https://..."
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={onSubmit} disabled={submitting || (mode === 'text' ? !textContent.trim() : !urlContent.trim())}>
              {submitting ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> 分析中…</> : '投喂'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
