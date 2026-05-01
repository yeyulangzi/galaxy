'use client'

import { useCallback, type KeyboardEvent, type RefObject } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  sending: boolean
  placeholder?: string
  disabled?: boolean
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  rows?: number
  className?: string
}

export function ChatInput({
  value,
  onChange,
  onSend,
  sending,
  placeholder = '输入消息...',
  disabled,
  textareaRef,
  rows = 1,
  className,
}: ChatInputProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        if (!sending && value.trim()) onSend()
      }
    },
    [sending, value, onSend],
  )

  return (
    <div className={`flex items-end gap-2 p-3 ${className ?? ''}`} style={{ borderTop: '1px solid var(--clay-border)' }}>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || sending}
        className="min-h-[40px] max-h-[120px] resize-none flex-1 text-sm"
        rows={rows}
        style={{ background: 'var(--clay-surface-soft)' }}
      />
      <Button
        size="icon"
        onClick={onSend}
        disabled={sending || !value.trim() || disabled}
        className="shrink-0 h-9 w-9 rounded-lg"
        style={{ background: 'var(--clay-primary)', color: 'var(--clay-on-primary)' }}
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </div>
  )
}
