'use client'

import { Check, X, Pencil } from 'lucide-react'
import type { Suggestion } from '@galaxy/shared'
import { cn } from '@/lib/utils'

interface Props {
  suggestion: Suggestion
  selected: boolean
  onToggleSelect: () => void
  onAccept: () => void
  onReject: () => void
  onEdit: () => void
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  new_node: { label: '新节点', color: 'bg-emerald-500/15 text-emerald-400' },
  new_edge: { label: '新关联', color: 'bg-sky-500/15 text-sky-400' },
  fill_aspect: { label: '填充', color: 'bg-violet-500/15 text-violet-400' },
  update_aspect: { label: '更新', color: 'bg-amber-500/15 text-amber-400' },
  merge_nodes: { label: '合并', color: 'bg-rose-500/15 text-rose-400' },
}

export function InboxCard({ suggestion, selected, onToggleSelect, onAccept, onReject, onEdit }: Props) {
  const payload = typeof suggestion.payload === 'string' ? JSON.parse(suggestion.payload) : suggestion.payload
  const typeInfo = TYPE_CONFIG[suggestion.type] ?? { label: suggestion.type, color: 'bg-muted text-muted-foreground' }
  const confidence = Math.round(suggestion.confidence * 100)

  return (
    <div
      className={cn(
        'group clay-card p-4 transition-all duration-200 hover:translate-y-[-2px] hover:shadow-clay-lg',
        selected && 'border-[hsl(var(--primary))]/50 ring-1 ring-[hsl(var(--primary))]/20',
      )}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div className="pt-0.5">
          <label className="relative flex h-4 w-4 cursor-pointer items-center justify-center">
            <input type="checkbox" checked={selected} onChange={onToggleSelect} className="sr-only" />
            <span className={cn(
              'flex h-4 w-4 items-center justify-center rounded border transition-all',
              selected
                ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]'
                : 'border-border/60 bg-transparent hover:border-muted-foreground/50',
            )}>
              {selected && <Check className="h-3 w-3 text-[hsl(var(--primary-foreground))]" />}
            </span>
          </label>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('rounded-lg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', typeInfo.color)}>
              {typeInfo.label}
            </span>
            <span className="text-sm font-semibold truncate">{payload.title ?? payload.source_title ?? '—'}</span>
            {payload.domain && (
              <span className="text-[10px] text-muted-foreground/60 font-mono">{payload.domain}</span>
            )}
          </div>
          {payload.summary && (
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{payload.summary}</p>
          )}
          {suggestion.rationale && (
            <p className="text-xs text-muted-foreground/70 italic">{suggestion.rationale}</p>
          )}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50">
            {/* Confidence bar */}
            <div className="flex items-center gap-1.5">
              <div className="h-1 w-12 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-[hsl(var(--primary))]"
                  style={{ width: `${confidence}%` }}
                />
              </div>
              <span>{confidence}%</span>
            </div>
            {suggestion.provider_id && <span>{suggestion.provider_id}/{suggestion.model}</span>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onAccept}
            title="接受 (A)"
            className="flex h-7 w-7 items-center justify-center rounded-xl text-muted-foreground hover:bg-emerald-500/15 hover:text-emerald-400 transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onReject}
            title="拒绝 (R)"
            className="flex h-7 w-7 items-center justify-center rounded-xl text-muted-foreground hover:bg-red-500/15 hover:text-red-400 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onEdit}
            title="修改后接受 (E)"
            className="flex h-7 w-7 items-center justify-center rounded-xl text-muted-foreground hover:bg-[hsl(var(--primary))]/15 hover:text-[hsl(var(--primary))] transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
