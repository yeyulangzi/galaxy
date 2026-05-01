'use client'

import { ArrowDown } from 'lucide-react'

interface ScrollToBottomButtonProps {
  visible: boolean
  onClick: () => void
}

export function ScrollToBottomButton({ visible, onClick }: ScrollToBottomButtonProps) {
  if (!visible) return null

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute left-1/2 -translate-x-1/2 bottom-20 z-10 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105"
      style={{
        background: 'var(--clay-surface-card)',
        color: 'var(--clay-text)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        border: '1px solid var(--clay-border)',
      }}
    >
      <ArrowDown className="h-3 w-3" />
      滚动到底部
    </button>
  )
}
