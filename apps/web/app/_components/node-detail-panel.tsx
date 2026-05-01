'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { MessageCircle, X, FileText, Link2, Trash2, Edit3, Plus, Save, Clock, ChevronLeft, Loader2, Upload, Download } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useGraphStore } from '@/lib/store/graph-store'
import { api } from '@/lib/api/client'
import type { DeepDiveSession } from '@/lib/api/client'
import {
  NODE_TYPES,
  INTERNALIZATION_STATUSES,
  ATTACHMENT_TYPES,
} from '@galaxy/shared'
import type {
  Aspect,
  ThoughtVersion,
  Attachment,
  NodeType,
  Channel,
  InternalizationStatus,
  AspectSourceType,
  EdgeOrigin,
} from '@galaxy/shared'
import coreDomains from '@/config/core-domains.json'
import { DeepDiveDialog } from './deep-dive-dialog'
import { ThoughtDiffViewer } from './thought-diff-viewer'

/* ═══════════════════ constants ═══════════════════ */

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

/** 解析层级 domain 字符串为 [一级, 二级, 三级] */
function parseDomainLevels(domain: string): [string, string, string] {
  const parts = domain.split('/').map((s) => s.trim())
  return [parts[0] ?? '', parts[1] ?? '', parts[2] ?? '']
}

/** 将三级合并为存储格式 "一级/二级/三级"，去掉尾部空层级 */
function joinDomainLevels(level1: string, level2: string, level3: string): string {
  const parts = [level1.trim(), level2.trim(), level3.trim()]
  // 去掉尾部空层级
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop()
  return parts.join('/')
}

function routeChannel(domain: string): Channel {
  const [level1, level2] = parseDomainLevels(domain)
  // 任何层级命中核心领域即为 core
  return coreDomains.coreDomains.includes(level1) || coreDomains.coreDomains.includes(level2)
    ? 'core'
    : 'light'
}

const CHANNEL_ICON: Record<Channel, string> = { core: '🔥', light: '🌿' }
const CHANNEL_LABEL: Record<Channel, string> = { core: '核心', light: '泛读' }

const NODE_TYPE_LABEL: Record<NodeType, string> = {
  concept: '概念/术语',
  model: '模型/框架',
  methodology: '方法论/策略',
  phenomenon: '现象/效应',
  practice: '实践/案例',
  phase: '阶段/周期',
  entity: '角色/实体',
}

const INTERNALIZATION_LABELS: Record<InternalizationStatus, string> = {
  draft: '草稿',
  linked: '已关联',
  dialogued: '已对话',
  mastered: '已掌握',
}

const SOURCE_TYPE_ICON: Record<AspectSourceType, string> = {
  dialogue: '💬',
  attachment: '📎',
  manual: '✍️',
}

const ATTACHMENT_TYPE_ICON: Record<string, string> = { md: '📄', link: '🔗' }

const EDGE_ORIGIN_LABEL: Record<EdgeOrigin, string> = {
  manual: '手动',
  ai_suggested: 'AI建议',
  ai_confirmed: 'AI确认',
}

/* ═══════════════════ sub-components ═══════════════════ */

function Overlay({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="relative w-[90vw] max-w-[640px] max-h-[80vh] overflow-y-auto p-6"
        style={{
          background: 'var(--clay-canvas)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-title-sm" style={{ color: 'var(--clay-ink)' }}>{title}</h3>
          <button type="button" onClick={onClose}>
            <X className="h-4 w-4" style={{ color: 'var(--clay-muted)' }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="text-title-sm font-bold pt-4 pb-1.5"
      style={{ color: 'var(--clay-ink)', borderTop: '1px solid var(--clay-hairline-soft)' }}
    >
      {children}
    </h3>
  )
}

/* ═══════════════════ main component ═══════════════════ */

export function NodeDetailPanel() {
  const { nodes, edges, selectedNodeId, selectNode, patchNode, removeNode, confirmNodeEdges } = useGraphStore()
  const node = nodes.find((n) => n.id === selectedNodeId) || null

  /* Block 1: Header */
  const [title, setTitle] = useState('')
  const [domain, setDomain] = useState('')
  const [nodeType, setNodeType] = useState<NodeType>('concept')
  const [channel, setChannel] = useState<Channel>('light')
  const [internalizationStatus, setInternalizationStatus] = useState<InternalizationStatus>('draft')
  const [saving, setSaving] = useState(false)

  /* Block 2: My Thoughts */
  const [myThoughts, setMyThoughts] = useState('')
  const [thoughtVersions, setThoughtVersions] = useState<ThoughtVersion[]>([])
  const [showThoughtHistory, setShowThoughtHistory] = useState(false)
  const [viewingThought, setViewingThought] = useState<ThoughtVersion | null>(null)
  const [showThoughtEditor, setShowThoughtEditor] = useState(false)
  const [thoughtHistoryTab, setThoughtHistoryTab] = useState<'list' | 'diff'>('list')

  /* Block 3: Aspects */
  const [aspects, setAspects] = useState<Aspect[]>([])
  const [showAddAspect, setShowAddAspect] = useState(false)
  const [showAspectSessionPicker, setShowAspectSessionPicker] = useState(false)
  const [newAspectTitle, setNewAspectTitle] = useState('')
  const [newAspectContent, setNewAspectContent] = useState('')
  const [editingAspectId, setEditingAspectId] = useState<string | null>(null)
  const [editAspectTitle, setEditAspectTitle] = useState('')
  const [editAspectContent, setEditAspectContent] = useState('')

  /* Block 4: Attachments */
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showAddAttachment, setShowAddAttachment] = useState(false)
  const [newAttachType, setNewAttachType] = useState<'md' | 'link'>('md')
  const [newAttachTitle, setNewAttachTitle] = useState('')
  const [newAttachContent, setNewAttachContent] = useState('')
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [autoExtractAspects, setAutoExtractAspects] = useState(false)
  const [extractingAspects, setExtractingAspects] = useState<string | null>(null) // null or attachmentId being extracted

  /* Block 5: Deep Dive */
  const [deepDiveOpen, setDeepDiveOpen] = useState(false)
  const [sessions, setSessions] = useState<DeepDiveSession[]>([])
  const [historySessionId, setHistorySessionId] = useState<string | undefined>(undefined)

  /* ═══════════════════ effects ═══════════════════ */

  useEffect(() => {
    if (!node) return
    setTitle(node.title)
    setDomain(node.domain ?? '')
    setNodeType(node.node_type ?? 'concept')
    setChannel(node.channel ?? 'light')
    setInternalizationStatus(node.internalization_status ?? 'draft' as const)
    setMyThoughts(node.my_thoughts ?? '')
    // 自动更新 last_accessed_at
    api.updateNode(node.id, { last_accessed_at: new Date().toISOString() }).catch(() => {})
  }, [node?.id])

  useEffect(() => {
    if (!node) return
    let cancelled = false
    api.listAspects(node.id).then((data) => {
      if (cancelled) return
      setAspects([...data].sort((a, b) => a.order - b.order))
    })
    return () => { cancelled = true }
  }, [node?.id])

  useEffect(() => {
    if (!node) return
    let cancelled = false
    fetch(`/api/nodes/${node.id}/attachments`)
      .then((r) => r.json())
      .then((json: { data: Attachment[] }) => {
        if (!cancelled) setAttachments(json.data ?? [])
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [node?.id])

  useEffect(() => {
    if (!node) return
    let cancelled = false
    api.listNodeSessions(node.id).then((data) => {
      if (!cancelled) setSessions(data as unknown as DeepDiveSession[])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [node?.id, deepDiveOpen])

  /* ═══════════════════ handlers ═══════════════════ */

  const handleDomainChange = useCallback((level1: string, level2: string, level3: string) => {
    const joined = joinDomainLevels(level1, level2, level3)
    setDomain(joined)
    setChannel(routeChannel(joined))
  }, [])

  const handleSaveNode = useCallback(async () => {
    if (!node) return
    if (!domain.trim()) { toast.error('领域（domain）为必填项'); return }
    setSaving(true)
    try {
      await patchNode(node.id, {
        title,
        domain: domain || null,
        node_type: nodeType,
        channel,
        internalization_status: internalizationStatus,
        my_thoughts: myThoughts || null,
      })
      toast.success('已保存')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }, [node, title, domain, nodeType, channel, internalizationStatus, myThoughts, patchNode])

  const handleDeleteNode = useCallback(async () => {
    if (!node) return
    if (!confirm(`删除节点「${node.title}」？相关边也会被删除。`)) return
    const deletedTitle = node.title
    try {
      const operationLogId = await removeNode(node.id)
      toast.success(`已删除「${deletedTitle}」`, {
        duration: 8000,
        action: {
          label: '撤销',
          onClick: async () => {
            try {
              await api.undoOperation(operationLogId)
              toast.success(`已恢复「${deletedTitle}」`)
              const { loadAll } = useGraphStore.getState()
              await loadAll()
            } catch (err: unknown) {
              toast.error(err instanceof Error ? err.message : '撤销失败')
            }
          },
        },
      })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    }
  }, [node, removeNode])

  const handleSaveThoughtVersion = useCallback(async () => {
    if (!node) return
    const versionLabel = prompt('版本标签（可选）：')
    try {
      await fetch(`/api/nodes/${node.id}/thoughts`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ content: myThoughts, version_label: versionLabel || null }),
      })
      toast.success('思考版本已保存')
    } catch {
      toast.error('保存版本失败')
    }
  }, [node, myThoughts])

  const handleLoadThoughtHistory = useCallback(async () => {
    if (!node) return
    try {
      const response = await fetch(`/api/nodes/${node.id}/thoughts`)
      const json = (await response.json()) as { data: ThoughtVersion[] }
      setThoughtVersions(json.data ?? [])
      setShowThoughtHistory(true)
    } catch {
      toast.error('加载版本历史失败')
    }
  }, [node])

  const handleAddAspect = useCallback(async () => {
    if (!node || !newAspectTitle.trim()) return
    try {
      const response = await fetch(`/api/nodes/${node.id}/aspects`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ title: newAspectTitle.trim(), content: newAspectContent, source_type: 'manual' }),
      })
      const json = (await response.json()) as { data: Aspect }
      setAspects((prev) => [...prev, json.data])
      setNewAspectTitle('')
      setNewAspectContent('')
      setShowAddAspect(false)
      toast.success('维度已添加')
    } catch {
      toast.error('添加维度失败')
    }
  }, [node, newAspectTitle, newAspectContent])

  const handleUpdateAspect = useCallback(async (aspectId: string) => {
    if (!node) return
    try {
      const response = await fetch(`/api/nodes/${node.id}/aspects`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ aspectId, title: editAspectTitle, content: editAspectContent }),
      })
      const json = (await response.json()) as { data: Aspect }
      setAspects((prev) => prev.map((a) => (a.id === aspectId ? json.data : a)))
      setEditingAspectId(null)
      toast.success('维度已更新')
    } catch {
      toast.error('更新维度失败')
    }
  }, [node, editAspectTitle, editAspectContent])

  const handleDeleteAspect = useCallback(async (aspectId: string) => {
    if (!node) return
    const aspect = aspects.find((a) => a.id === aspectId)
    if (!confirm(`确认删除维度「${aspect?.title ?? ''}」？`)) return
    try {
      const res = await fetch(`/api/nodes/${node.id}/aspects?aspectId=${aspectId}`, { method: 'DELETE' })
      const json = await res.json() as { data: { id: string; operation_log_id?: string } }
      setAspects((prev) => prev.filter((a) => a.id !== aspectId))
      toast.success(`维度「${aspect?.title ?? ''}」已删除`, {
        duration: 8000,
        action: json.data.operation_log_id ? {
          label: '撤销',
          onClick: async () => {
            try {
              await api.undoOperation(json.data.operation_log_id!)
              toast.success('已恢复')
              if (node) {
                const data = await api.listAspects(node.id)
                setAspects(data)
              }
            } catch (err: unknown) {
              toast.error(err instanceof Error ? err.message : '撤销失败')
            }
          },
        } : undefined,
      })
    } catch {
      toast.error('删除维度失败')
    }
  }, [node, aspects])

  const handleExtractAspectsFromSession = useCallback(async (targetSessionId: string) => {
    setExtractingAspects('__session__')
    setShowAspectSessionPicker(false)
    try {
      const result = await api.summarizeConversation(targetSessionId, 'extract-aspects')
      toast.success(`已提取到 ${result.aspectsUpdated ?? 0} 个切面`)
      // 刷新 aspects 列表
      if (node) {
        const data = await api.listAspects(node.id)
        setAspects(data)
      }
    } catch {
      toast.error('从对话提取切面失败')
    } finally {
      setExtractingAspects(null)
    }
  }, [node])

  const extractAspectsFromContent = useCallback(async (content: string, attachmentId?: string) => {
    if (!node) return
    setExtractingAspects(attachmentId ?? '__new__')
    try {
      const response = await fetch(`/api/nodes/${node.id}/extract-aspects`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ content, sourceId: attachmentId }),
      })
      const json = (await response.json()) as { data: { extractedCount: number; updatedCount: number; createdCount: number } }
      toast.success(`已提取 ${json.data.extractedCount} 个维度（新增 ${json.data.createdCount}，更新 ${json.data.updatedCount}）`)
      // 刷新 aspects 列表
      const aspectsResponse = await fetch(`/api/nodes/${node.id}/aspects`)
      const aspectsJson = (await aspectsResponse.json()) as { data: Aspect[] }
      setAspects(aspectsJson.data ?? [])
    } catch {
      toast.error('提取维度信息失败')
    } finally {
      setExtractingAspects(null)
    }
  }, [node])

  const handleAddAttachment = useCallback(async () => {
    if (!node || !newAttachTitle.trim() || !newAttachContent.trim()) return
    try {
      const response = await fetch(`/api/nodes/${node.id}/attachments`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ type: newAttachType, title: newAttachTitle.trim(), content_or_url: newAttachContent.trim() }),
      })
      const json = (await response.json()) as { data: Attachment }
      setAttachments((prev) => [...prev, json.data])
      const savedContent = newAttachContent.trim()
      const savedAttachmentId = json.data.id
      setNewAttachType('md')
      setNewAttachTitle('')
      setNewAttachContent('')
      setShowAddAttachment(false)
      toast.success('附件已添加')

      // 如果开启了自动提取维度，异步调用
      if (autoExtractAspects && newAttachType === 'md') {
        extractAspectsFromContent(savedContent, savedAttachmentId)
      }
    } catch {
      toast.error('添加附件失败')
    }
  }, [node, newAttachType, newAttachTitle, newAttachContent, autoExtractAspects, extractAspectsFromContent])

  const handleDeleteAttachment = useCallback(async (attachmentId: string) => {
    if (!node) return
    const attachment = attachments.find((a) => a.id === attachmentId)
    if (!confirm(`确认删除附件「${attachment?.title ?? ''}」？`)) return
    try {
      const res = await fetch(`/api/nodes/${node.id}/attachments?attachmentId=${attachmentId}`, { method: 'DELETE' })
      const json = await res.json() as { data: { id: string; operation_log_id?: string } }
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
      toast.success(`附件「${attachment?.title ?? ''}」已删除`, {
        duration: 8000,
        action: json.data.operation_log_id ? {
          label: '撤销',
          onClick: async () => {
            try {
              await api.undoOperation(json.data.operation_log_id!)
              toast.success('已恢复')
            } catch (err: unknown) {
              toast.error(err instanceof Error ? err.message : '撤销失败')
            }
          },
        } : undefined,
      })
    } catch {
      toast.error('删除附件失败')
    }
  }, [node, attachments])

  const handleAttachmentClick = useCallback((attachment: Attachment) => {
    if (attachment.type === 'link') {
      window.open(attachment.content_or_url, '_blank')
    } else {
      setPreviewAttachment(attachment)
    }
  }, [])

  const openNewDeepDive = useCallback(() => {
    setHistorySessionId(undefined)
    setDeepDiveOpen(true)
  }, [])

  const openHistorySession = useCallback((sessionId: string) => {
    setHistorySessionId(sessionId)
    setDeepDiveOpen(true)
  }, [])

  /* ═══════════════════ derived ═══════════════════ */

  const connectedEdges = node
    ? edges
        .filter((e) => e.source_node_id === node.id || e.target_node_id === node.id)
        .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    : []

  const hasAiSuggestedEdges = connectedEdges.some((e) => e.origin === 'ai_suggested')
  const [confirming, setConfirming] = useState(false)

  if (!node) return null

  const progressIndex = INTERNALIZATION_STATUSES.indexOf(internalizationStatus)

  /* ═══════════════════ render ═══════════════════ */

  const cardStyle = {
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--clay-hairline-soft)',
    background: 'var(--clay-surface-card)',
  } as const

  return (
    <div className="h-full overflow-y-auto px-5 py-5 space-y-3">
      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between">
        <h2 className="text-title-lg" style={{ color: 'var(--clay-ink)' }}>节点详情</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleDeleteNode} title="删除" className="rounded-[var(--radius-md)] text-red-500">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => selectNode(null)} title="关闭" className="h-7 w-7 rounded-[var(--radius-md)]">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ═══ 基本信息 卡片 ═══ */}
      <div className="p-4 space-y-3" style={cardStyle}>

        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-title-sm font-medium mb-2" placeholder="节点标题" />

        {/* 介绍（summary） */}
        <div className="space-y-1 mb-2">
          <Label htmlFor="summary" className="text-caption">介绍</Label>
          <Textarea
            id="summary"
            value={node.summary ?? ''}
            onChange={(e) => {
              /* summary 通过 patchNode 保存 */
              const value = e.target.value
              patchNode(node.id, { summary: value || null }).catch(() => {})
            }}
            rows={2}
            placeholder="用一两句话描述这个节点…"
            className="bg-transparent resize-none text-body-sm"
          />
        </div>

        <div className="space-y-1.5 mb-2">
          <Label className="text-caption">领域（必填）</Label>
          <div className="flex gap-1.5">
            <Input
              value={parseDomainLevels(domain)[0]}
              onChange={(e) => handleDomainChange(e.target.value, parseDomainLevels(domain)[1], parseDomainLevels(domain)[2])}
              placeholder="一级，如：互联网"
              className="flex-1"
            />
            <span className="self-center text-caption" style={{ color: 'var(--clay-muted-soft)' }}>/</span>
            <Input
              value={parseDomainLevels(domain)[1]}
              onChange={(e) => handleDomainChange(parseDomainLevels(domain)[0], e.target.value, parseDomainLevels(domain)[2])}
              placeholder="二级，如：产品方法论"
              className="flex-1"
            />
            <span className="self-center text-caption" style={{ color: 'var(--clay-muted-soft)' }}>/</span>
            <Input
              value={parseDomainLevels(domain)[2]}
              onChange={(e) => handleDomainChange(parseDomainLevels(domain)[0], parseDomainLevels(domain)[1], e.target.value)}
              placeholder="三级（选填）"
              className="flex-1"
            />
          </div>
        </div>

        <div className="flex gap-2 mb-2">
          <div className="w-[140px] space-y-1">
            <Label htmlFor="nodeType" className="text-caption">类型</Label>
            <select
              id="nodeType"
              value={nodeType}
              onChange={(e) => setNodeType(e.target.value as NodeType)}
              className="w-full h-9 px-3 rounded-md text-body-sm"
              style={{ border: '1px solid var(--clay-hairline-soft)', background: 'var(--clay-canvas)', color: 'var(--clay-ink)' }}
            >
              {NODE_TYPES.map((type) => (
                <option key={type} value={type}>{NODE_TYPE_LABEL[type] ?? type}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <span className="text-caption shrink-0" style={{ color: 'var(--clay-muted)' }}>深度：</span>
          <div className="flex gap-1.5">
            {(['core', 'light'] as Channel[]).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setChannel(ch)}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-caption font-medium transition-all"
                style={{
                  borderRadius: 'var(--radius-md)',
                  border: channel === ch ? '1.5px solid transparent' : '1.5px solid var(--clay-hairline-soft)',
                  background: channel === ch
                    ? (ch === 'core' ? 'rgba(255,100,50,0.12)' : 'rgba(100,180,255,0.12)')
                    : 'transparent',
                  color: channel === ch
                    ? (ch === 'core' ? 'var(--clay-coral)' : 'var(--clay-primary)')
                    : 'var(--clay-muted)',
                  cursor: 'pointer',
                }}
              >
                {CHANNEL_ICON[ch]} {CHANNEL_LABEL[ch]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-caption" style={{ color: 'var(--clay-muted)' }}>内化进度</span>
            <span className="text-caption font-medium" style={{ color: 'var(--clay-ink)' }}>
              {INTERNALIZATION_LABELS[internalizationStatus]}
            </span>
          </div>
          <div className="flex gap-1">
            {INTERNALIZATION_STATUSES.map((status, index) => (
              <button
                key={status}
                type="button"
                onClick={() => setInternalizationStatus(status)}
                className="flex-1 h-2 rounded-full transition-colors"
                style={{ background: index <= progressIndex ? 'var(--clay-primary)' : 'var(--clay-hairline-soft)' }}
                title={INTERNALIZATION_LABELS[status]}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end mt-1">
          <Button onClick={handleSaveNode} disabled={saving} size="sm">
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>

      {/* ═══ Deep Dive 卡片 ═══ */}
      <div className="p-4 space-y-2" style={cardStyle}>
          <div className="flex items-center justify-between">
            <SectionTitle>💬 Deep Dive</SectionTitle>
            <Button variant="ghost" size="sm" onClick={openNewDeepDive} className="rounded-[var(--radius-md)]">
              <MessageCircle className="h-3.5 w-3.5 mr-1" />
              新对话
            </Button>
          </div>
          {sessions.length === 0 ? (
            <p className="text-caption" style={{ color: 'var(--clay-muted-soft)' }}>暂无历史对话</p>
          ) : (
            <div className="space-y-1 max-h-[160px] overflow-y-auto">
              {sessions.map((session) => {
                const agentLabel = session.agent_type === 'direct' ? '直接对话' : session.agent_type === 'thinker' ? '思辨者' : session.agent_type === 'partner' ? '产品合伙人' : session.agent_type
                return (
                  <div
                    key={session.id}
                    className="group flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors"
                    style={{ borderRadius: 'var(--radius-md)', color: 'var(--clay-ink)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--clay-surface-soft)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => openHistorySession(session.id)}
                  >
                    <MessageCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--clay-muted)' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--clay-ink)' }}>
                        {session.title || '未命名对话'}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{ background: 'var(--clay-primary-alpha-10)', color: 'var(--clay-primary)' }}
                        >
                          {agentLabel}
                        </span>
                        {session.status === 'completed' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--clay-surface-soft)', color: 'var(--clay-muted)' }}>
                            已结束
                          </span>
                        )}
                        <span className="text-[10px]" style={{ color: 'var(--clay-muted)' }}>
                          {new Date(session.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation()
                        if (!confirm('确认删除此对话？')) return
                        try {
                          await api.deleteDeepDiveSession(session.id)
                          setSessions((prev) => prev.filter((s) => s.id !== session.id))
                          toast.success('已删除')
                        } catch {
                          toast.error('删除失败')
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-black/10 flex-shrink-0"
                      style={{ color: 'var(--clay-muted)' }}
                      title="删除对话"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
      </div>

      {/* ═══ 我的思考 卡片 ═══ */}
      <div className="p-4 space-y-2" style={cardStyle}>
          <div className="flex items-center justify-between">
            <SectionTitle>✍️ 我的思考</SectionTitle>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={handleSaveThoughtVersion} title="保存为版本" className="rounded-[var(--radius-md)]">
                <Save className="h-3.5 w-3.5 mr-1" />
                保存为版本
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLoadThoughtHistory} title="版本历史" className="rounded-[var(--radius-md)]">
                <Clock className="h-3.5 w-3.5 mr-1" />
                版本历史
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowThoughtEditor(true)}
            className="w-full text-left px-3 py-2.5 text-body-sm transition-colors cursor-pointer"
            style={{
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--clay-hairline-soft)',
              background: 'var(--clay-surface-soft)',
              color: myThoughts ? 'var(--clay-body)' : 'var(--clay-muted-soft)',
              minHeight: '60px',
              maxHeight: '120px',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 4,
              WebkitBoxOrient: 'vertical' as const,
              whiteSpace: 'pre-wrap',
            }}
          >
            {myThoughts || '点击展开编辑你的思考…'}
          </button>
      </div>

      {/* ═══ 维度解释 卡片 ═══ */}
      <div className="p-4 space-y-2" style={cardStyle}>
          <SectionTitle>🔍 维度解释</SectionTitle>
          {aspects.length === 0 && (
            <p className="text-caption" style={{ color: 'var(--clay-muted-soft)' }}>暂无维度，点击下方按钮添加</p>
          )}
          <div className="space-y-2">
            {aspects.map((aspect) => (
              <div
                key={aspect.id}
                className="p-3 space-y-1"
                style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--clay-hairline-soft)', background: 'var(--clay-surface-soft)' }}
              >
                {editingAspectId === aspect.id ? (
                  <div className="space-y-2">
                    <Input value={editAspectTitle} onChange={(e) => setEditAspectTitle(e.target.value)} placeholder="维度标题" />
                    <Textarea value={editAspectContent} onChange={(e) => setEditAspectContent(e.target.value)} rows={4} placeholder="维度内容" className="bg-transparent resize-none text-body-sm" />
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setEditingAspectId(null)}>取消</Button>
                      <Button size="sm" onClick={() => handleUpdateAspect(aspect.id)}>保存</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-body-sm" style={{ color: 'var(--clay-ink)' }}>{aspect.title}</span>
                        <span className="text-caption" title={aspect.source_type}>{SOURCE_TYPE_ICON[aspect.source_type] ?? '✍️'}</span>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => { setEditingAspectId(aspect.id); setEditAspectTitle(aspect.title); setEditAspectContent(aspect.content) }}
                          className="p-1 rounded" style={{ color: 'var(--clay-muted)' }} title="编辑"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => handleDeleteAspect(aspect.id)} className="p-1 rounded" style={{ color: 'var(--clay-muted)' }} title="删除">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-body-sm whitespace-pre-wrap" style={{ color: 'var(--clay-body)' }}>{aspect.content || '（无内容）'}</p>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 relative">
            <Button variant="ghost" size="sm" onClick={() => setShowAddAspect(true)} className="rounded-[var(--radius-md)]">
              <Plus className="h-3.5 w-3.5 mr-1" />
              手动添加
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAspectSessionPicker((v) => !v)}
              disabled={extractingAspects}
              className="rounded-[var(--radius-md)]"
            >
              {extractingAspects ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <MessageCircle className="h-3.5 w-3.5 mr-1" />
              )}
              {extractingAspects ? '提取中…' : '从对话提取'}
            </Button>

            {/* 对话选择下拉 */}
            {showAspectSessionPicker && (
              <div
                className="absolute top-full left-0 mt-1 w-[260px] z-30 rounded-[var(--radius-md)] shadow-lg overflow-hidden"
                style={{ background: 'var(--clay-surface-card)', border: '1px solid var(--clay-hairline)' }}
              >
                <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--clay-hairline-soft)' }}>
                  <p className="text-caption font-medium" style={{ color: 'var(--clay-ink)' }}>选择对话来提取切面</p>
                </div>
                {sessions.length === 0 ? (
                  <p className="px-3 py-4 text-caption text-center" style={{ color: 'var(--clay-muted-soft)' }}>暂无对话记录</p>
                ) : (
                  <div className="max-h-[200px] overflow-y-auto">
                    {sessions.map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => handleExtractAspectsFromSession(session.id)}
                        className="w-full text-left px-3 py-2 text-body-sm transition-colors hover:opacity-80"
                        style={{ color: 'var(--clay-body)', borderBottom: '1px solid var(--clay-hairline-soft)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--clay-surface-soft)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">
                            <span className="font-medium">{session.agent_type === 'direct' ? '直接' : session.agent_type === 'thinker' ? '思辨' : '合伙人'}</span>
                            {' '}
                            {session.title ?? '新对话'}
                          </span>
                          <span className="text-caption shrink-0 ml-2" style={{ color: 'var(--clay-muted-soft)' }}>
                            {new Date(session.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowAspectSessionPicker(false)}
                  className="w-full px-3 py-1.5 text-caption text-center transition-colors"
                  style={{ color: 'var(--clay-muted)', borderTop: '1px solid var(--clay-hairline-soft)' }}
                >
                  取消
                </button>
              </div>
            )}
          </div>
      </div>

      {/* ═══ 联结 卡片 ═══ */}
      <div className="p-4 space-y-2" style={cardStyle}>
          <div className="flex items-center justify-between">
            <SectionTitle>🔗 联结</SectionTitle>
            {hasAiSuggestedEdges && (
              <button
                type="button"
                disabled={confirming}
                className="px-2.5 py-1 text-[11px] font-medium rounded-md transition-all"
                style={{
                  background: confirming ? 'var(--clay-surface-soft)' : 'rgba(93, 184, 166, 0.12)',
                  color: confirming ? 'var(--clay-muted)' : '#3d8b7a',
                  border: '1px solid rgba(93, 184, 166, 0.25)',
                  cursor: confirming ? 'not-allowed' : 'pointer',
                }}
                onClick={async () => {
                  if (!node) return
                  setConfirming(true)
                  try {
                    const count = await confirmNodeEdges(node.id)
                    if (count > 0) {
                      // 边的 origin 已由 store 更新，UI 自动刷新
                    }
                  } finally {
                    setConfirming(false)
                  }
                }}
              >
                {confirming ? '确认中…' : '✓ 全部确认'}
              </button>
            )}
          </div>
          {connectedEdges.length === 0 && (
            <p className="text-caption" style={{ color: 'var(--clay-muted-soft)' }}>暂无联结</p>
          )}
          <div className="space-y-1.5">
            {connectedEdges.map((edge) => {
              const isSource = edge.source_node_id === node.id
              const otherNodeId = isSource ? edge.target_node_id : edge.source_node_id
              const otherNode = nodes.find((n) => n.id === otherNodeId)
              return (
                <div
                  key={edge.id}
                  className="px-3 py-2.5 text-body-sm cursor-pointer transition-colors"
                  style={{
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--clay-ink)',
                    background: 'var(--clay-surface-soft)',
                    border: '1px solid var(--clay-hairline-soft)',
                  }}
                  onClick={() => selectNode(otherNodeId)}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate flex-1">
                      {isSource ? '→' : '←'} {otherNode?.title ?? otherNodeId}
                      <span className="ml-1 text-caption" style={{ color: 'var(--clay-muted-soft)' }}>({edge.relation_type})</span>
                    </span>
                    <div className="shrink-0 ml-2 flex items-center gap-1.5">
                      {edge.weight != null && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(93, 184, 166, 0.12)', color: '#3d8b7a' }}>
                          {edge.weight.toFixed(2)}
                        </span>
                      )}
                      <span className="text-caption px-1.5 py-0.5 rounded" style={{ background: 'var(--clay-surface-card)', color: 'var(--clay-muted)' }}>
                        {EDGE_ORIGIN_LABEL[edge.origin] ?? edge.origin}
                      </span>
                    </div>
                  </div>
                  {edge.description && (
                    <p className="mt-1.5 text-caption leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--clay-body)' }}>
                      {edge.description}
                      {edge.weight != null && (
                        <span className="ml-1" style={{ color: 'var(--clay-muted)' }}>
                          (系数 {edge.weight.toFixed(2)})
                        </span>
                      )}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
      </div>

      {/* ═══ 附件 卡片 ═══ */}
      <div className="p-4 space-y-2" style={cardStyle}>
          <SectionTitle>📎 附件</SectionTitle>
          {attachments.length === 0 && (
            <p className="text-caption" style={{ color: 'var(--clay-muted-soft)' }}>暂无附件</p>
          )}
          <div className="space-y-1">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-2 px-3 py-2 group"
                style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--clay-hairline-soft)' }}
              >
                <span className="shrink-0">{ATTACHMENT_TYPE_ICON[attachment.type] ?? '📄'}</span>
                <button type="button" onClick={() => handleAttachmentClick(attachment)} className="flex-1 truncate text-body-sm text-left" style={{ color: 'var(--clay-ink)' }}>
                  {attachment.title}
                </button>
                {attachment.type === 'md' && (
                  <button
                    type="button"
                    onClick={() => extractAspectsFromContent(attachment.content_or_url, attachment.id)}
                    disabled={extractingAspects === attachment.id}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: extractingAspects === attachment.id ? 'var(--clay-primary)' : 'var(--clay-muted)' }}
                    title="提取维度信息"
                  >
                    {extractingAspects === attachment.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (attachment.type === 'link') {
                      window.open(attachment.content_or_url, '_blank')
                    } else {
                      const blob = new Blob([attachment.content_or_url], { type: 'text/markdown;charset=utf-8' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `${attachment.title.replace(/[\/\\:*?"<>|]/g, '_')}.md`
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                      URL.revokeObjectURL(url)
                    }
                  }}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--clay-muted)' }}
                  title={attachment.type === 'link' ? '打开链接' : '下载到本地'}
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => handleDeleteAttachment(attachment.id)} className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--clay-muted)' }} title="删除">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowAddAttachment(true)} className="rounded-[var(--radius-md)]">
            <Plus className="h-3.5 w-3.5 mr-1" />
            添加附件
          </Button>
      </div>

      {/* ═══ 元信息 卡片 ═══ */}
      <div className="p-4 space-y-2" style={cardStyle}>
        <SectionTitle>📋 元信息</SectionTitle>
        <div className="text-caption space-y-0.5" style={{ color: 'var(--clay-muted)' }}>
          <p>最近访问：{node.last_accessed_at ? new Date(node.last_accessed_at).toLocaleString() : '—'}</p>
          <p>创建时间：{new Date(node.created_at).toLocaleString()}</p>
          <p className="select-all" style={{ color: 'var(--clay-muted-soft)' }}>ID: {node.id}</p>
        </div>
      </div>

      {/* ═══════════════════ overlays ═══════════════════ */}

      {/* Thought full-screen editor */}
      <Overlay open={showThoughtEditor} onClose={() => setShowThoughtEditor(false)} title="✍️ 我的思考">
        <div className="flex flex-col h-full" style={{ minHeight: '60vh' }}>
          <Textarea
            value={myThoughts}
            onChange={(e) => setMyThoughts(e.target.value)}
            placeholder="在这里记录你对这个概念的思考…&#10;&#10;支持自由记录，可以写任何关于这个节点的理解、感悟、问题…"
            className="flex-1 bg-transparent resize-none text-body-sm leading-relaxed"
            style={{ minHeight: '50vh' }}
            autoFocus
          />
          <div className="flex items-center justify-between pt-3 mt-3" style={{ borderTop: '1px solid var(--clay-hairline-soft)' }}>
            <span className="text-caption" style={{ color: 'var(--clay-muted-soft)' }}>
              {myThoughts.length} 字
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleSaveThoughtVersion} className="rounded-[var(--radius-md)]">
                <Save className="h-3.5 w-3.5 mr-1" />
                保存为版本
              </Button>
              <Button size="sm" onClick={() => setShowThoughtEditor(false)} className="rounded-[var(--radius-md)]">
                完成
              </Button>
            </div>
          </div>
        </div>
      </Overlay>

      {/* Thought version history */}
      <Overlay open={showThoughtHistory} onClose={() => { setShowThoughtHistory(false); setViewingThought(null); setThoughtHistoryTab('list') }} title="思考版本历史">
        {/* Tab 切换 */}
        <div className="flex gap-1 mb-4 p-0.5 rounded-lg" style={{ background: 'var(--clay-surface-soft)' }}>
          {(['list', 'diff'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => { setThoughtHistoryTab(tab); setViewingThought(null) }}
              className="flex-1 px-3 py-1.5 text-[13px] font-medium rounded-md transition-all"
              style={{
                background: thoughtHistoryTab === tab ? 'var(--clay-canvas)' : 'transparent',
                color: thoughtHistoryTab === tab ? 'var(--clay-ink)' : 'var(--clay-muted)',
                boxShadow: thoughtHistoryTab === tab ? 'var(--shadow-clay-sm)' : 'none',
              }}
            >
              {tab === 'list' ? '📋 版本列表' : '🔀 Diff 对比 & 演化图'}
            </button>
          ))}
        </div>

        {thoughtHistoryTab === 'list' ? (
          /* 原有的版本列表视图 */
          viewingThought ? (
            <div className="space-y-3">
              <button type="button" onClick={() => setViewingThought(null)} className="flex items-center gap-1 text-body-sm" style={{ color: 'var(--clay-muted)' }}>
                <ChevronLeft className="h-4 w-4" />
                返回列表
              </button>
              {viewingThought.version_label && (
                <p className="text-body-sm font-medium" style={{ color: 'var(--clay-ink)' }}>{viewingThought.version_label}</p>
              )}
              <p className="text-caption" style={{ color: 'var(--clay-muted-soft)' }}>{new Date(viewingThought.saved_at).toLocaleString()}</p>
              <div className="text-body-sm whitespace-pre-wrap p-3 max-h-[400px] overflow-y-auto" style={{ background: 'var(--clay-surface-soft)', borderRadius: 'var(--radius-md)', border: '1px solid var(--clay-hairline-soft)', color: 'var(--clay-body)' }}>
                {viewingThought.content}
              </div>
            </div>
          ) : (
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {thoughtVersions.length === 0 ? (
                <p className="text-caption" style={{ color: 'var(--clay-muted-soft)' }}>暂无版本记录</p>
              ) : (
                thoughtVersions.map((version) => (
                  <button
                    key={version.id}
                    type="button"
                    onClick={() => setViewingThought(version)}
                    className="w-full flex items-center justify-between px-3 py-2 text-body-sm transition-colors text-left"
                    style={{ borderRadius: 'var(--radius-md)', color: 'var(--clay-ink)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--clay-surface-soft)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span className="truncate">{version.version_label || '无标签'}</span>
                    <span className="shrink-0 ml-2" style={{ color: 'var(--clay-muted-soft)' }}>{new Date(version.saved_at).toLocaleString()}</span>
                  </button>
                ))
              )}
            </div>
          )
        ) : (
          /* Diff 对比 & 知识演化图 */
          <ThoughtDiffViewer versions={thoughtVersions} currentContent={myThoughts} />
        )}
      </Overlay>

      {/* Add aspect */}
      <Overlay open={showAddAspect} onClose={() => setShowAddAspect(false)} title="添加维度">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="newAspectTitle">标题</Label>
            <Input id="newAspectTitle" value={newAspectTitle} onChange={(e) => setNewAspectTitle(e.target.value)} placeholder="维度标题" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="newAspectContent">内容</Label>
            <Textarea id="newAspectContent" value={newAspectContent} onChange={(e) => setNewAspectContent(e.target.value)} rows={6} placeholder="维度内容" className="bg-transparent resize-none text-body-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAddAspect(false)}>取消</Button>
            <Button onClick={handleAddAspect} disabled={!newAspectTitle.trim()}>添加</Button>
          </div>
        </div>
      </Overlay>

      {/* Add attachment */}
      <Overlay open={showAddAttachment} onClose={() => setShowAddAttachment(false)} title="添加附件">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="attachType">类型</Label>
            <select
              id="attachType"
              value={newAttachType}
              onChange={(e) => setNewAttachType(e.target.value as 'md' | 'link')}
              className="w-full h-9 px-3 rounded-md text-body-sm"
              style={{ border: '1px solid var(--clay-hairline-soft)', background: 'var(--clay-canvas)', color: 'var(--clay-ink)' }}
            >
              {ATTACHMENT_TYPES.map((type) => (
                <option key={type} value={type}>{type === 'md' ? '📄 Markdown' : '🔗 链接'}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="attachTitle">标题</Label>
            <Input id="attachTitle" value={newAttachTitle} onChange={(e) => setNewAttachTitle(e.target.value)} placeholder="附件标题" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="attachContent">{newAttachType === 'md' ? '内容' : 'URL'}</Label>
            {newAttachType === 'md' ? (
              <>
                <div className="flex items-center gap-2 mb-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-[var(--radius-md)]"
                  >
                    <Upload className="h-3.5 w-3.5 mr-1" />
                    选择本地文件
                  </Button>
                  <span className="text-caption" style={{ color: 'var(--clay-muted-soft)' }}>
                    支持 .md / .txt / .markdown
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.txt,.markdown"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = (event) => {
                      const text = event.target?.result
                      if (typeof text === 'string') {
                        setNewAttachContent(text)
                        if (!newAttachTitle.trim()) {
                          const nameWithoutExt = file.name.replace(/\.(md|txt|markdown)$/i, '')
                          setNewAttachTitle(nameWithoutExt)
                        }
                      }
                    }
                    reader.onerror = () => toast.error('读取文件失败')
                    reader.readAsText(file, 'utf-8')
                    e.target.value = ''
                  }}
                />
                <Textarea id="attachContent" value={newAttachContent} onChange={(e) => setNewAttachContent(e.target.value)} rows={8} placeholder="Markdown 内容…（也可通过上方按钮导入本地文件）" className="bg-transparent resize-none text-body-sm" />
              </>
            ) : (
              <Input id="attachContent" value={newAttachContent} onChange={(e) => setNewAttachContent(e.target.value)} placeholder="https://…" />
            )}
          </div>
          {/* 提取维度信息开关 — 仅 Markdown 类型时显示 */}
          {newAttachType === 'md' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={autoExtractAspects}
                onClick={() => setAutoExtractAspects(!autoExtractAspects)}
                className="relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
                style={{ background: autoExtractAspects ? 'var(--clay-primary)' : 'var(--clay-hairline)' }}
              >
                <span
                  className="pointer-events-none block h-3 w-3 rounded-full bg-white shadow-sm transition-transform"
                  style={{ transform: autoExtractAspects ? 'translateX(12px)' : 'translateX(0)' }}
                />
              </button>
              <span className="text-xs" style={{ color: autoExtractAspects ? 'var(--clay-ink)' : 'var(--clay-muted)' }}>
                提取维度信息
              </span>
              {autoExtractAspects && (
                <span className="text-[10px]" style={{ color: 'var(--clay-muted)' }}>
                  添加后自动用 AI 提取维度
                </span>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAddAttachment(false)}>取消</Button>
            <Button onClick={handleAddAttachment} disabled={!newAttachTitle.trim() || !newAttachContent.trim()}>
              {extractingAspects === '__new__' ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />提取中…</>
              ) : '添加'}
            </Button>
          </div>
        </div>
      </Overlay>

      {/* Attachment markdown preview */}
      <Overlay open={!!previewAttachment} onClose={() => setPreviewAttachment(null)} title={previewAttachment?.title ?? '预览'}>
        <div className="prose prose-sm max-w-none whitespace-pre-wrap text-body-md leading-relaxed max-h-[60vh] overflow-y-auto" style={{ color: 'var(--clay-body)' }}>
          {previewAttachment?.content_or_url ?? ''}
        </div>
      </Overlay>

      {/* DeepDiveDialog — preserved */}
      <DeepDiveDialog
        open={deepDiveOpen}
        onOpenChange={setDeepDiveOpen}
        nodeId={node.id}
        nodeTitle={node.title}
        existingSessionId={historySessionId}
      />
    </div>
  )
}
