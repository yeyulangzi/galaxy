'use client'

import { Loader2 } from 'lucide-react'
import { MarkdownRenderer } from './markdown-renderer'
import type { ChatMessage, ToolCallInfo } from './types'

interface ChatBubbleProps {
  message: ChatMessage
  streaming?: boolean
  toolCallCard?: (toolCall: ToolCallInfo) => React.ReactNode
}

export function ChatBubble({ message, streaming, toolCallCard }: ChatBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[80%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
        style={
          isUser
            ? {
                background: 'var(--clay-primary)',
                color: 'var(--clay-on-primary)',
                borderRadius: 'var(--radius-xl) var(--radius-xl) var(--radius-sm) var(--radius-xl)',
              }
            : {
                background: 'var(--clay-surface-card)',
                color: 'var(--clay-ink)',
                borderRadius: 'var(--radius-xl) var(--radius-xl) var(--radius-xl) var(--radius-sm)',
              }
        }
      >
        {isUser && message.content}

        {message.role === 'assistant' && (
          message.thinking && !message.content ? (
            <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--clay-muted)' }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              思考中…
            </span>
          ) : (
            <MarkdownRenderer content={message.content} streaming={streaming || message.thinking} />
          )
        )}

        {message.role === 'system' && (
          <span className="text-xs" style={{ color: 'var(--clay-muted)' }}>{message.content}</span>
        )}

        {message.toolCalls && message.toolCalls.length > 0 && toolCallCard && (
          <div className="mt-3 space-y-2">
            {message.toolCalls.map((tc) => (
              <div key={tc.id}>{toolCallCard(tc)}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
