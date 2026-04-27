'use client'

import { Check, X, Edit } from 'lucide-react'
import type { Suggestion } from '@galaxy/shared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  suggestion: Suggestion
  selected: boolean
  onToggleSelect: () => void
  onAccept: () => void
  onReject: () => void
  onEdit: () => void
}

export function InboxCard({ suggestion, selected, onToggleSelect, onAccept, onReject, onEdit }: Props) {
  const payload = typeof suggestion.payload === 'string' ? JSON.parse(suggestion.payload) : suggestion.payload
  const typeLabel: Record<string, string> = {
    new_node: '🆕 新增节点',
    new_edge: '🔗 新增关联',
    fill_aspect: '📝 填充视角',
    update_aspect: '✏️ 更新视角',
    merge_nodes: '🔀 合并节点',
  }

  return (
    <div className={cn('rounded-lg border p-4 transition-colors', selected && 'border-blue-500 bg-blue-50/50')}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={selected} onChange={onToggleSelect} className="mt-1" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{typeLabel[suggestion.type] ?? suggestion.type}</span>
            <span className="text-lg font-semibold">{payload.title ?? payload.source_title ?? '—'}</span>
          </div>
          {payload.summary && <p className="text-sm text-muted-foreground">{payload.summary}</p>}
          {suggestion.rationale && (
            <p className="text-xs text-muted-foreground">💡 {suggestion.rationale}</p>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>置信度: {(suggestion.confidence * 100).toFixed(0)}%</span>
            {suggestion.provider_id && <span>📍{suggestion.provider_id}/{suggestion.model}</span>}
            {payload.domain && <span>领域: {payload.domain}</span>}
          </div>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={onAccept} title="接受 (A)">
            <Check className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={onReject} title="拒绝 (R)">
            <X className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit} title="修改后接受 (E)">
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
