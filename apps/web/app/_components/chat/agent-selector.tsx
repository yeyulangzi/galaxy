'use client'

import type { AgentOption } from './types'

type SizePreset = 'sm' | 'md'

const SIZE_CLASSES: Record<SizePreset, string> = {
  sm: 'px-3 py-1 text-xs rounded-full',
  md: 'px-3 py-1.5 text-sm font-medium',
}

interface AgentSelectorProps {
  options: AgentOption[]
  value: string
  onChange: (value: string) => void
  size?: SizePreset
  className?: string
}

export function AgentSelector({ options, value, onChange, size = 'sm', className }: AgentSelectorProps) {
  return (
    <div className={`flex-shrink-0 flex items-center gap-1.5 px-6 py-2 flex-wrap ${className ?? ''}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`${SIZE_CLASSES[size]} transition-all`}
          style={{
            borderRadius: size === 'md' ? 'var(--radius-pill)' : undefined,
            background: option.value === value ? 'var(--clay-primary)' : 'var(--clay-primary-alpha-10)',
            color: option.value === value ? 'var(--clay-on-primary)' : 'var(--clay-ink)',
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
