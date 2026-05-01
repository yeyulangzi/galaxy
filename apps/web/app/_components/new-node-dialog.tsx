'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
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
  const { addNode, nodes } = useGraphStore()
  const [title, setTitle] = useState('')
  const [domain, setDomain] = useState('')
  const [domainOpen, setDomainOpen] = useState(false)
  const [summary, setSummary] = useState('')
  const [isSeed, setIsSeed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const domainInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 从现有节点中提取去重的领域列表
  const existingDomains = useMemo(() => {
    const domains = nodes
      .map((n) => n.domain)
      .filter((d): d is string => !!d && d.trim().length > 0)
    return [...new Set(domains)].sort()
  }, [nodes])

  // 根据输入过滤领域选项
  const filteredDomains = useMemo(() => {
    if (!domain.trim()) return existingDomains
    const keyword = domain.trim().toLowerCase()
    return existingDomains.filter((d) => d.toLowerCase().includes(keyword))
  }, [domain, existingDomains])

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        domainInputRef.current && !domainInputRef.current.contains(e.target as Node)
      ) {
        setDomainOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
        domain: domain.trim(),
        summary: summary.trim(),
        is_seed: isSeed,
        node_type: 'concept',
        channel: 'light',
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
          <div className="space-y-1 relative">
            <Label htmlFor="new-domain">领域</Label>
            <Input
              ref={domainInputRef}
              id="new-domain"
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value)
                setDomainOpen(true)
              }}
              onFocus={() => setDomainOpen(true)}
              placeholder="选择或输入新领域"
              autoComplete="off"
            />
            {domainOpen && filteredDomains.length > 0 && (
              <div
                ref={dropdownRef}
                className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-md border bg-popover shadow-md"
              >
                {filteredDomains.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent truncate"
                    onClick={() => {
                      setDomain(d)
                      setDomainOpen(false)
                    }}
                  >
                    {d}
                  </button>
                ))}
                {domain.trim() && !existingDomains.includes(domain.trim()) && (
                  <div className="px-3 py-1.5 text-xs" style={{ color: 'var(--clay-muted)' }}>
                    回车创建新领域「{domain.trim()}」
                  </div>
                )}
              </div>
            )}
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
