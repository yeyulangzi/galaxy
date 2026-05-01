'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Zap, Loader2, History } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api/client'
import { useInboxStore } from '@/lib/store/inbox-store'
import { ToolCallCard } from './tool-call-card'
import type { ChatMessage, ToolCallInfo } from '@/app/_components/chat/types'
import { ChatInput } from '@/app/_components/chat/chat-input'
import { ChatBubble } from '@/app/_components/chat/chat-bubble'
import { AgentSelector } from '@/app/_components/chat/agent-selector'
import { ThinkingToggle } from '@/app/_components/chat/thinking-toggle'
import { ChatHistorySidebar, type HistorySession } from '@/app/_components/chat/chat-history-sidebar'
import { ScrollToBottomButton } from '@/app/_components/chat/scroll-to-bottom-button'
import { useSSEStream, type SSEStreamCallbacks } from '@/hooks/use-sse-stream'
import { useAutoScroll } from '@/hooks/use-auto-scroll'
import { useAgentOptions } from '@/hooks/use-agent-options'
import { useThinkingMode } from '@/hooks/use-thinking-mode'

/* ═══════════════════ constants ═══════════════════ */

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
  const [agentType, setAgentType] = useState<string>('direct')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const [feeding, setFeeding] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [historyList, setHistoryList] = useState<HistorySession[]>([])

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const agentOptions = useAgentOptions()
  const { thinkingSupported, useThinking, setUseThinking } = useThinkingMode()
  const { scrollContainerRef, messagesEndRef, showScrollButton, scrollToBottom, handleScroll } = useAutoScroll()
  const { sendStreamRequest } = useSSEStream()

  const { loadInbox } = useInboxStore()

  /* ─── history ─── */
  const loadHistory = useCallback(async () => {
    try {
      const sessions = await api.listChatSessions()
      setHistoryList(
        (sessions as unknown as Array<{ id: string; title: string | null; agent_type: string; created_at: string; updated_at: string }>)
          .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
      )
    } catch {
      // 静默失败
    }
  }, [])

  useEffect(() => {
    if (showHistory) {
      loadHistory()
    }
  }, [showHistory, loadHistory])

  const handleResumeSession = useCallback(async (historicSessionId: string) => {
    try {
      const data = await api.getChatSession(historicSessionId)
      const session = data.session as unknown as { agent_type: string }
      setSessionId(historicSessionId)
      setAgentType(session.agent_type || 'direct')
      setMessages(
        data.messages.map((m) => ({
          id: m.id,
          role: m.role === 'user' ? 'user' as const : 'assistant' as const,
          content: m.content,
        }))
      )
      setShowHistory(false)
    } catch (error) {
      toast.error('加载会话失败')
    }
  }, [])

  const handleDeleteSession = useCallback(async (targetSessionId: string) => {
    try {
      await api.deleteChatSession(targetSessionId)
      if (targetSessionId === sessionId) {
        setSessionId(null)
        setMessages([])
      }
      await loadHistory()
      toast.success('会话已删除')
    } catch {
      toast.error('删除失败')
    }
  }, [sessionId, loadHistory])

  const handleNewChat = useCallback(() => {
    setSessionId(null)
    setMessages([])
    setAgentType('direct')
    setShowHistory(false)
  }, [])

  /* ─── reset on close ─── */
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setShowHistory(false)
        setAgentType('direct')
        setSessionId(null)
        setMessages([])
        setInputValue('')
        setSending(false)
        setFeeding(false)
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange],
  )

  useEffect(() => {
    if (!sending) return
    scrollToBottom()
  }, [messages, sending, scrollToBottom])

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

      const callbacks: SSEStreamCallbacks = {
        onChunk: (content) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: msg.content + content, thinking: true }
                : msg,
            ),
          )
        },
        onThinking: () => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: '思考中...', thinking: true }
                : msg,
            ),
          )
        },
        onToolStart: (toolCall) => {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== assistantMessageId) return msg
              const newToolCall: ToolCallInfo = {
                id: toolCall.id,
                name: toolCall.name,
                arguments: toolCall.arguments,
                loading: true,
              }
              return {
                ...msg,
                thinking: false,
                toolCalls: [...(msg.toolCalls ?? []), newToolCall],
              }
            }),
          )
        },
        onToolDone: (toolCallId, result) => {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== assistantMessageId) return msg
              return {
                ...msg,
                toolCalls: msg.toolCalls?.map((tc) =>
                  tc.id === toolCallId
                    ? { ...tc, result, loading: false }
                    : tc,
                ),
              }
            }),
          )
        },
        onDone: (_messageId, content) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content, thinking: false }
                : msg,
            ),
          )
        },
        onError: (errorMsg) => {
          toast.error(errorMsg || '对话出错了')
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: '出错了，请重试', thinking: false }
                : msg,
            ),
          )
        },
      }

      await sendStreamRequest(
        `/api/chat/${currentSessionId}/message`,
        { content: trimmed, useThinking },
        callbacks,
      )
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
  }, [inputValue, sending, sessionId, agentType, useThinking, sendStreamRequest])

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
        className="p-0 flex gap-0 overflow-hidden"
        style={{ height: '80vh', maxWidth: showHistory ? '56rem' : '42rem', transition: 'max-width 0.25s ease-in-out' }}
      >
        {/* ─── history sidebar ─── */}
        <ChatHistorySidebar
          open={showHistory}
          sessions={historyList}
          currentSessionId={sessionId}
          agentOptions={agentOptions}
          onSelect={handleResumeSession}
          onDelete={handleDeleteSession}
          onNewChat={handleNewChat}
        />

        {/* ─── main chat area ─── */}
        <div className="flex-1 flex flex-col gap-0 overflow-hidden min-w-0 order-1">
        {/* ─── header ─── */}
        <DialogHeader
          className="flex-shrink-0 px-6 pt-6 pb-3"
          style={{ borderBottom: '1px solid var(--clay-hairline-soft)' }}
        >
          <div className="flex items-center justify-between pr-6">
            <div>
              <DialogTitle className="text-title-md">
                AI 对话助手
              </DialogTitle>
              <DialogDescription
                className="text-sm mt-0.5"
                style={{ color: 'var(--clay-muted)' }}
              >
                与知识图谱对话，探索和关联你的知识
              </DialogDescription>
            </div>
            <div className="flex items-center gap-1.5">
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
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="p-1.5 rounded hover:bg-black/5"
                title="历史会话"
              >
                <History className="h-4 w-4" style={{ color: showHistory ? 'var(--clay-primary)' : 'var(--clay-muted)' }} />
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* ─── agent type selector (only before first message) ─── */}
        {!sessionId && messages.length === 0 && (
          <AgentSelector options={agentOptions} value={agentType} onChange={setAgentType} />
        )}

        {/* ─── thinking mode toggle ─── */}
        <ThinkingToggle supported={thinkingSupported} enabled={useThinking} onChange={setUseThinking} />

        {/* ─── messages ─── */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-6 py-3 relative"
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
            <div className="space-y-3">
              {messages.map((msg) => (
                <ChatBubble
                  key={msg.id}
                  message={msg}
                  streaming={msg.thinking}
                  toolCallCard={(tc) => (
                    <ToolCallCard
                      name={tc.name}
                      arguments={tc.arguments}
                      result={tc.result}
                      loading={tc.loading}
                    />
                  )}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* scroll-to-bottom button */}
        <ScrollToBottomButton visible={showScrollButton} onClick={scrollToBottom} />

        {/* ─── input area ─── */}
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          sending={sending}
          placeholder="输入你的问题... (Enter 发送, Shift+Enter 换行)"
        />
        </div>
      </DialogContent>
    </Dialog>
  )
}
