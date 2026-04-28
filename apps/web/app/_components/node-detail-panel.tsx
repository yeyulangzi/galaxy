'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { MessageCircle, History } from 'lucide-react'
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
import { api } from '@/lib/api/client'
import type { DeepDiveSession } from '@/lib/api/client'
import type { Aspect } from '@galaxy/shared'
import { DeepDiveDialog } from './deep-dive-dialog'

export function NodeDetailPanel() {
  const { nodes, selectedNodeId, selectNode, patchNode, removeNode } = useGraphStore()
  const node = nodes.find((n) => n.id === selectedNodeId) || null
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [domain, setDomain] = useState('')
  const [saving, setSaving] = useState(false)

  const [aspects, setAspects] = useState<Aspect[]>([])
  const [activeTemplateKey, setActiveTemplateKey] = useState<string | null>(null)
  const [aspectContent, setAspectContent] = useState('')
  const [aspectSaving, setAspectSaving] = useState(false)

  const [deepDiveOpen, setDeepDiveOpen] = useState(false)
  const [sessions, setSessions] = useState<DeepDiveSession[]>([])
  const [historySessionId, setHistorySessionId] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!node) return
    setTitle(node.title)
    setSummary(node.summary ?? '')
    setDomain(node.domain ?? '')
  }, [node?.id])

  useEffect(() => {
    if (!node) return
    let cancelled = false
    api.listAspects(node.id).then((data) => {
      if (cancelled) return
      const sorted = [...data].sort((a, b) => a.order - b.order)
      setAspects(sorted)
      if (sorted.length > 0) {
        setActiveTemplateKey(sorted[0].template_key)
        setAspectContent(sorted[0].content)
      }
    })
    return () => { cancelled = true }
  }, [node?.id])

  useEffect(() => {
    if (!node) return
    let cancelled = false
    api.listNodeSessions(node.id).then((data) => {
      if (!cancelled) setSessions(data)
    }).catch(() => {
      /* silently ignore — sessions may not exist yet */
    })
    return () => { cancelled = true }
  }, [node?.id, deepDiveOpen])

  const openNewDeepDive = useCallback(() => {
    setHistorySessionId(undefined)
    setDeepDiveOpen(true)
  }, [])

  const openHistorySession = useCallback((sessionId: string) => {
    setHistorySessionId(sessionId)
    setDeepDiveOpen(true)
  }, [])

  const activeAspect = aspects.find((a) => a.template_key === activeTemplateKey) ?? null

  const handleTabChange = useCallback(
    (templateKey: string) => {
      const target = aspects.find((a) => a.template_key === templateKey)
      if (!target) return
      setActiveTemplateKey(templateKey)
      setAspectContent(target.content)
    },
    [aspects],
  )

  const handleAspectBlur = useCallback(async () => {
    if (!node || !activeAspect) return
    if (aspectContent === activeAspect.content) return
    setAspectSaving(true)
    try {
      const updated = await api.updateAspect(node.id, {
        templateKey: activeAspect.template_key,
        content: aspectContent,
      })
      setAspects((prev) =>
        prev.map((a) => (a.template_key === updated.template_key ? updated : a)),
      )
      toast.success(`「${activeAspect.title}」已保存`)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '保存失败'
      toast.error(message)
    } finally {
      setAspectSaving(false)
    }
  }, [node, activeAspect, aspectContent])

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
      <SheetContent side="right" className="w-[400px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle>节点详情</SheetTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={openNewDeepDive} title="Deep Dive">
                <MessageCircle className="h-4 w-4" />
                Deep Dive
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (sessions.length === 0) {
                    toast.info('暂无历史对话')
                    return
                  }
                  openHistorySession(sessions[0].id)
                }}
                title="历史对话"
                className="relative"
              >
                <History className="h-4 w-4" />
                历史
                {sessions.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground px-1">
                    {sessions.length}
                  </span>
                )}
              </Button>
            </div>
          </div>
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
          {/* Aspect Tabs */}
          {aspects.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">视角</Label>
              <div className="flex gap-1 border-b border-border/30 overflow-x-auto">
                {aspects.map((aspect) => (
                  <button
                    key={aspect.template_key}
                    type="button"
                    onClick={() => handleTabChange(aspect.template_key)}
                    className={`shrink-0 rounded-t-xl px-3 py-1.5 text-sm transition-all duration-200 ${
                      activeTemplateKey === aspect.template_key
                        ? 'border-b-2 border-primary text-foreground font-medium bg-muted/30'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {aspect.template_key === 'deepdive-summary' ? '💡 Deep Dive 总结' : aspect.title}
                  </button>
                ))}
              </div>
              {activeTemplateKey === 'deepdive-summary' ? (
                <div
                  className="text-sm whitespace-pre-wrap bg-transparent p-2 rounded-md border border-border min-h-[160px] max-h-[300px] overflow-y-auto"
                >
                  {aspectContent || '暂无总结内容'}
                </div>
              ) : (
                <Textarea
                  value={aspectContent}
                  onChange={(e) => setAspectContent(e.target.value)}
                  onBlur={handleAspectBlur}
                  rows={8}
                  placeholder={activeAspect ? `编辑「${activeAspect.title}」内容…` : ''}
                  className="bg-transparent resize-none text-sm"
                />
              )}
              {aspectSaving && (
                <p className="text-xs text-muted-foreground">保存中…</p>
              )}
            </div>
          )}

          {/* History sessions list */}
          {sessions.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">历史对话</Label>
              <div className="space-y-1 max-h-[120px] overflow-y-auto">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => openHistorySession(session.id)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs rounded-xl hover:bg-muted/60 transition-colors text-left"
                  >
                    <span className="text-foreground truncate">
                      {session.agent_type === 'direct' ? '直接对话' : session.agent_type === 'thinker' ? '思辨者' : '产品合伙人'}
                    </span>
                    <span className="text-muted-foreground shrink-0 ml-2">
                      {new Date(session.created_at).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="destructive" onClick={onDelete}>删除</Button>
            <Button onClick={onSave} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
          </div>
        </div>

        <DeepDiveDialog
          open={deepDiveOpen}
          onOpenChange={setDeepDiveOpen}
          nodeId={node.id}
          nodeTitle={node.title}
          existingSessionId={historySessionId}
        />
      </SheetContent>
    </Sheet>
  )
}
