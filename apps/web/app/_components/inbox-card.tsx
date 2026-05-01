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
  new_node: { label: '新节点', color: 'bg-[#a4d4c5]/20 text-[#1a3a3a]' },
  new_edge: { label: '新关联', color: 'bg-[#b8a4ed]/20 text-[#1a3a3a]' },
  fill_aspect: { label: '填充', color: 'bg-[#e8b94a]/20 text-[#1a3a3a]' },
  update_aspect: { label: '更新', color: 'bg-[#ffb084]/20 text-[#1a3a3a]' },
  merge_nodes: { label: '合并', color: 'bg-[#ff4d8b]/15 text-[#1a3a3a]' },
}

export function InboxCard({ suggestion, selected, onToggleSelect, onAccept, onReject, onEdit }: Props) {
  const payload = typeof suggestion.payload === 'string' ? JSON.parse(suggestion.payload) : suggestion.payload
  const typeInfo = TYPE_CONFIG[suggestion.type] ?? { label: suggestion.type, color: 'bg-muted text-muted-foreground' }
  const rawConfidence = Math.round(suggestion.confidence * 100)
  const calibratedConfidence = suggestion.calibrated_confidence != null
    ? Math.round(suggestion.calibrated_confidence * 100)
    : null
  const displayConfidence = calibratedConfidence ?? rawConfidence

  return (
    <div
      className={cn(
        'group clay-card p-4 transition-all duration-200 hover:translate-y-[-1px]',
        selected && 'ring-2 ring-[var(--clay-primary)]/20',
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
                ? 'border-[var(--clay-primary)] bg-[var(--clay-primary)]'
                : 'border-[var(--clay-hairline)] bg-transparent hover:border-[var(--clay-muted-soft)]',
            )}>
              {selected && <Check className="h-3 w-3 text-[var(--clay-on-primary)]" />}
            </span>
          </label>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('rounded-[var(--radius-pill)] px-2.5 py-0.5 text-[12px] font-medium uppercase tracking-wide', typeInfo.color)}>
              {typeInfo.label}
            </span>
            <span className="text-title-sm truncate" style={{ color: 'var(--clay-ink)' }}>{payload.title ?? payload.source_title ?? '—'}</span>
            {payload.domain && (
              <span className="text-caption font-mono" style={{ color: 'var(--clay-muted-soft)' }}>{payload.domain}</span>
            )}
          </div>
          {payload.summary && (
            <p className="text-body-sm leading-relaxed line-clamp-2" style={{ color: 'var(--clay-body)' }}>{payload.summary}</p>
          )}
          {suggestion.rationale && (
            <p className="text-body-sm italic" style={{ color: 'var(--clay-muted)' }}>{suggestion.rationale}</p>
          )}
          <div className="flex items-center gap-3 text-caption" style={{ color: 'var(--clay-muted-soft)' }}>
            {/* Confidence bar */}
            <div className="flex items-center gap-1.5">
              <div className="h-1 w-12 rounded-full overflow-hidden" style={{ background: 'var(--clay-hairline)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${displayConfidence}%`, background: 'var(--clay-primary)' }}
                />
              </div>
              <span>{displayConfidence}%{calibratedConfidence != null && ' 校准'}</span>
              {calibratedConfidence != null && (
                <span className="text-[10px]" style={{ color: 'var(--clay-muted-soft)', opacity: 0.6 }}>AI 原始 {rawConfidence}%</span>
              )}
            </div>
            {suggestion.provider_id && <span>{suggestion.provider_id}/{suggestion.model}</span>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onAccept}
            title="接受 (A)"
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[#a4d4c5]/20"
            style={{ color: 'var(--clay-muted)' }}
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            onClick={onReject}
            title="拒绝 (R)"
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[#ff6b5a]/15"
            style={{ color: 'var(--clay-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={onEdit}
            title="修改后接受 (E)"
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--clay-surface-card)]"
            style={{ color: 'var(--clay-muted)' }}
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
