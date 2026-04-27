'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useGraphStore } from '@/lib/store/graph-store'

export function NodeDetailPanel() {
  const { nodes, selectedNodeId, selectNode, patchNode, removeNode } = useGraphStore()
  const node = nodes.find((n) => n.id === selectedNodeId) || null
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [domain, setDomain] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!node) return
    setTitle(node.title)
    setSummary(node.summary ?? '')
    setDomain(node.domain ?? '')
  }, [node?.id])

  if (!node) return null

  const onSave = async () => {
    setSaving(true)
    try {
      await patchNode(node.id, { title, summary: summary || null, domain: domain || null })
      toast.success('已保存')
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '保存失败'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    if (!confirm(`删除节点「${node.title}」？相关边也会被删除。`)) return
    try {
      await removeNode(node.id)
      toast.success('已删除')
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '删除失败'
      toast.error(message)
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && selectNode(null)}>
      <SheetContent side="right" className="w-[400px] sm:w-[480px]">
        <SheetHeader>
          <SheetTitle>节点详情</SheetTitle>
          <SheetDescription>{node.id}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="title">标题</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="domain">领域</Label>
            <Input id="domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="summary">摘要</Label>
            <Textarea id="summary" rows={6} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="destructive" onClick={onDelete}>删除</Button>
            <Button onClick={onSave} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
