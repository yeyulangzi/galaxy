'use client'

import { useState, useEffect } from 'react'
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
  const [enableAiExtract, setEnableAiExtract] = useState(true)
  const { loadInbox } = useInboxStore()

  // 打开弹窗时读取设置
  useEffect(() => {
    if (!open) return
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        setEnableAiExtract(data?.data?.enable_feed_ai ?? true)
      })
      .catch(() => {})
  }, [open])

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
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full clay-button transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg"
        title="投喂知识"
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">投喂知识</DialogTitle>
            <p className="text-sm text-muted-foreground">粘贴文本或 URL，AI 会自动抽取知识节点</p>
          </DialogHeader>

          <div className="flex gap-1 rounded-[var(--radius-pill)] p-1" style={{ background: 'var(--clay-surface-soft)' }}>
            <button
              onClick={() => setMode('text')}
              className={`flex-1 rounded-[var(--radius-pill)] px-3 py-1.5 text-sm font-medium transition-all ${mode === 'text' ? 'bg-[var(--clay-canvas)] text-[var(--clay-ink)] shadow-sm' : 'text-[var(--clay-muted)] hover:text-[var(--clay-ink)]'}`}
            >
              文本
            </button>
            <button
              onClick={() => setMode('url')}
              className={`flex-1 rounded-[var(--radius-pill)] px-3 py-1.5 text-sm font-medium transition-all ${mode === 'url' ? 'bg-[var(--clay-canvas)] text-[var(--clay-ink)] shadow-sm' : 'text-[var(--clay-muted)] hover:text-[var(--clay-ink)]'}`}
            >
              URL
            </button>
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

          {/* AI 抽取开关 */}
          <div className="flex items-center justify-between py-1">
            <div>
              <span className="text-[13px] font-medium" style={{ color: 'var(--clay-ink)' }}>AI 自动抽取</span>
              <p className="text-[11px]" style={{ color: 'var(--clay-muted)' }}>
                {enableAiExtract ? '投喂后 AI 自动抽取知识节点' : '仅保存原文，不做 AI 抽取'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enableAiExtract}
              onClick={() => {
                const next = !enableAiExtract
                setEnableAiExtract(next)
                fetch('/api/settings', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ enable_feed_ai: next }),
                }).catch(() => {})
              }}
              className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
              style={{ background: enableAiExtract ? 'var(--clay-primary)' : 'var(--clay-hairline)' }}
            >
              <span
                className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
                style={{ transform: enableAiExtract ? 'translateX(16px)' : 'translateX(0)' }}
              />
            </button>
          </div>

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
