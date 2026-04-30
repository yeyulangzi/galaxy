'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Send, Loader2, ArrowDown, Zap } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api/client'
import { useInboxStore } from '@/lib/store/inbox-store'
import { ToolCallCard } from './tool-call-card'

/* ═══════════════════ types ═══════════════════ */

type AgentType = 'direct' | 'thinker' | 'partner'

interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  result?: unknown
  loading: boolean
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCall[]
  thinking?: boolean
}

/* ═══════════════════ constants ═══════════════════ */

const AGENT_OPTIONS: { value: AgentType; label: string; description: string }[] = [
  { value: 'direct', label: '直接对话', description: '快速问答' },
  { value: 'thinker', label: '思辨者', description: '深度思考' },
  { value: 'partner', label: '产品合伙人', description: '共创探索' },
]

const EMPTY_STATE_LINES = [
  '你好，我是 Galaxy 知识助手 ✨',
  '你可以问我任何关于你知识图谱的问题，',
  '或让我帮你整理和关联知识。',
]

/* ═══════════════════ component ═══════════════════ */

export interface GlobalChatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GlobalChatDialog({ open, onOpenChange }: GlobalChatDialogProps) {
  const [agentType, setAgentType] = useState<AgentType>('direct')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const [feeding, setFeeding] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)

  const { loadInbox } = useInboxStore()

  /* ─── reset on close ─── */
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setAgentType('direct')
        setSessionId(null)
        setMessages([])
        setInputValue('')
        setSending(false)
        setFeeding(false)
        setShowScrollButton(false)
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange],
  )

  /* ─── auto-scroll ─── */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (!sending) return
    scrollToBottom()
  }, [messages, sending, scrollToBottom])

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight
    setShowScrollButton(distanceFromBottom > 100)
  }, [])

  /* ─── SSE message handler ─── */
  const processSSEStream = useCallback(
    async (reader: ReadableStreamDefaultReader<Uint8Array>, assistantMessageId: string) => {
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw || raw === '[DONE]') continue

          let event: { type: string; [key: string]: unknown }
          try {
            event = JSON.parse(raw)
          } catch {
            continue
          }

          switch (event.type) {
            case 'thinking':
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: '思考中...', thinking: true }
                    : msg,
                ),
              )
              break

            case 'tool_start':
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id !== assistantMessageId) return msg
                  const toolCall: ToolCall = {
                    id: event.toolCallId as string,
                    name: event.toolName as string,
                    arguments: (event.arguments as Record<string, unknown>) ?? {},
                    loading: true,
                  }
                  return {
                    ...msg,
                    thinking: false,
                    toolCalls: [...(msg.toolCalls ?? []), toolCall],
                  }
                }),
              )
              break

            case 'tool_done':
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id !== assistantMessageId) return msg
                  return {
                    ...msg,
                    toolCalls: msg.toolCalls?.map((tc) =>
                      tc.id === (event.toolCallId as string)
                        ? { ...tc, result: event.result, loading: false }
                        : tc,
                    ),
                  }
                }),
              )
              break

            case 'done':
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: event.content as string, thinking: false }
                    : msg,
                ),
              )
              break

            case 'error':
              toast.error((event.message as string) ?? '对话出错了')
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: '出错了，请重试', thinking: false }
                    : msg,
                ),
              )
              break
          }
        }
      }
    },
    [],
  )

  /* ─── send message ─── */
  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim()
    if (!trimmed || sending) return

    setSending(true)
    setInputValue('')

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    }
    const assistantMessageId = `assistant-${Date.now()}`
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      thinking: true,
    }
    setMessages((prev) => [...prev, userMessage, assistantMessage])

    try {
      let currentSessionId = sessionId
      if (!currentSessionId) {
        const { sessionId: newId } = await api.createChatSession(agentType)
        currentSessionId = newId
        setSessionId(newId)
      }

      const response = await fetch(`/api/chat/${currentSessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      })

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法读取响应流')

      await processSSEStream(reader, assistantMessageId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '发送失败')
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: '发送失败，请重试', thinking: false }
            : msg,
        ),
      )
    } finally {
      setSending(false)
    }
  }, [inputValue, sending, sessionId, agentType, processSSEStream])

  /* ─── feed to graph ─── */
  const handleFeed = useCallback(async () => {
    if (!sessionId || feeding) return
    setFeeding(true)
    try {
      const result = await api.feedChatConversation(sessionId)
      toast.success(
        `已投喂到图谱！生成了 ${result.suggestionsCount} 条建议和 ${result.aspectSuggestionsCount} 条切面建议`,
      )
      await loadInbox()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '投喂失败')
    } finally {
      setFeeding(false)
    }
  }, [sessionId, feeding, loadInbox])

  /* ─── keyboard ─── */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  /* ─── focus textarea on open ─── */
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [open])

  const canFeed = messages.length >= 2 && !!sessionId

  /* ═══════════════════ render ═══════════════════ */
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-2xl p-0 flex flex-col gap-0 overflow-hidden"
        style={{ height: '80vh' }}
      >
        {/* ─── header ─── */}
        <DialogHeader
          className="flex-shrink-0 px-6 pt-5 pb-3"
          style={{ borderBottom: '1px solid var(--clay-border)' }}
        >
          <div className="flex items-center justify-between pr-6">
            <div>
              <DialogTitle
                className="text-lg font-semibold"
                style={{ color: 'var(--clay-ink)' }}
              >
                AI 对话助手
              </DialogTitle>
              <DialogDescription
                className="text-sm mt-0.5"
                style={{ color: 'var(--clay-muted)' }}
              >
                与知识图谱对话，探索和关联你的知识
              </DialogDescription>
            </div>
            {canFeed && (
              <Button
                variant="ghost"
                size="sm"
                disabled={feeding}
                onClick={handleFeed}
                className="gap-1.5"
                style={{
                  color: 'var(--clay-coral)',
                  borderRadius: 'var(--radius-pill)',
                }}
              >
                {feeding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                投喂到图谱
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* ─── agent type selector (only before first message) ─── */}
        {!sessionId && messages.length === 0 && (
          <div
            className="flex-shrink-0 flex items-center gap-2 px-6 py-3"
            style={{ borderBottom: '1px solid var(--clay-border)' }}
          >
            {AGENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setAgentType(option.value)}
                className="px-3 py-1.5 text-sm font-medium transition-colors"
                style={{
                  borderRadius: 'var(--radius-pill)',
                  background:
                    agentType === option.value
                      ? 'var(--clay-primary)'
                      : 'var(--clay-primary-alpha-10)',
                  color:
                    agentType === option.value
                      ? 'var(--clay-on-primary)'
                      : 'var(--clay-ink)',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {/* ─── messages ─── */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-6 py-4 relative"
          onScroll={handleScroll}
          style={{ minHeight: 0 }}
        >
          {messages.length === 0 ? (
            /* empty state */
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-2">
                {EMPTY_STATE_LINES.map((line) => (
                  <p
                    key={line}
                    className="text-sm"
                    style={{ color: 'var(--clay-muted)' }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className="max-w-[80%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"
                    style={
                      msg.role === 'user'
                        ? {
                            background: 'var(--clay-primary)',
                            color: 'var(--clay-on-primary)',
                            borderRadius: `var(--radius-lg) var(--radius-sm) var(--radius-lg) var(--radius-lg)`,
                          }
                        : {
                            background: 'var(--clay-surface-card)',
                            color: 'var(--clay-ink)',
                            borderRadius: `var(--radius-sm) var(--radius-lg) var(--radius-lg) var(--radius-lg)`,
                          }
                    }
                  >
                    {/* thinking cursor */}
                    {msg.thinking && (
                      <span className="inline-block animate-pulse">
                        {msg.content || '思考中'}
                        <span className="ml-0.5">▊</span>
                      </span>
                    )}

                    {/* normal content */}
                    {!msg.thinking && msg.content}

                    {/* tool calls */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {msg.toolCalls.map((toolCall) => (
                          <ToolCallCard
                            key={toolCall.id}
                            name={toolCall.name}
                            arguments={toolCall.arguments}
                            result={toolCall.result}
                            loading={toolCall.loading}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* scroll-to-bottom button */}
          {showScrollButton && (
            <button
              type="button"
              onClick={scrollToBottom}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1.5 text-xs font-medium shadow-lg transition-opacity"
              style={{
                background: 'var(--clay-surface-card)',
                color: 'var(--clay-ink)',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--clay-border)',
              }}
            >
              <ArrowDown className="h-3 w-3" />
              滚动到底部
            </button>
          )}
        </div>

        {/* ─── input area ─── */}
        <div
          className="flex-shrink-0 px-6 py-4"
          style={{ borderTop: '1px solid var(--clay-border)' }}
        >
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题... (Enter 发送, Shift+Enter 换行)"
              disabled={sending}
              rows={1}
              className="flex-1 min-h-[40px] max-h-[120px] resize-none text-sm"
              style={{
                borderRadius: 'var(--radius-md)',
                borderColor: 'var(--clay-border)',
              }}
            />
            <Button
              size="sm"
              disabled={sending || !inputValue.trim()}
              onClick={handleSend}
              className="h-10 w-10 flex-shrink-0 p-0"
              style={{
                borderRadius: 'var(--radius-md)',
                background: 'var(--clay-primary)',
                color: 'var(--clay-on-primary)',
              }}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
