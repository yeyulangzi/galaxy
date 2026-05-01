'use client'

interface ThinkingToggleProps {
  supported: boolean
  enabled: boolean
  onChange: (enabled: boolean) => void
}

export function ThinkingToggle({ supported, enabled, onChange }: ThinkingToggleProps) {
  if (!supported) return null

  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-6 py-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className="relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
        style={{ background: enabled ? 'var(--clay-primary)' : 'var(--clay-hairline)' }}
      >
        <span
          className="pointer-events-none block h-3 w-3 rounded-full bg-white shadow-sm transition-transform"
          style={{ transform: enabled ? 'translateX(12px)' : 'translateX(0)' }}
        />
      </button>
      <span className="text-xs" style={{ color: enabled ? 'var(--clay-ink)' : 'var(--clay-muted)' }}>
        深度思考
      </span>
    </div>
  )
}
