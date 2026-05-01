'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { MessageCircle, Loader2, FileText, XCircle, History, Plus, Trash2, MessageSquare } from 'lucide-react'
import { MarkdownRenderer } from '@/app/_components/chat/markdown-renderer'
import { ChatInput } from '@/app/_components/chat/chat-input'
import { AgentSelector } from '@/app/_components/chat/agent-selector'
import { ThinkingToggle } from '@/app/_components/chat/thinking-toggle'
import { ScrollToBottomButton } from '@/app/_components/chat/scroll-to-bottom-button'
import { useAutoScroll } from '@/hooks/use-auto-scroll'
import { useAgentOptions } from '@/hooks/use-agent-options'
import { useThinkingMode } from '@/hooks/use-thinking-mode'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api/client'
import type { DeepDiveMessage, DeepDiveSession } from '@/lib/api/client'

type AgentType = string

interface DeepDiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodeId: string
  nodeTitle: string
  /** When set, opens an existing session in read-only mode */
  existingSessionId?: string
}

export function DeepDiveDialog({
  open,
  onOpenChange,
  nodeId,
  nodeTitle,
  existingSessionId,
}: DeepDiveDialogProps) {
  const [agentType, setAgentType] = useState<AgentType>('direct')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<DeepDiveMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const [activeSummarizeModes, setActiveSummarizeModes] = useState<Set<string>>(new Set())
  // agentOptions 由共享 hook 提供

  // 历史侧边栏
  const [showHistory, setShowHistory] = useState(false)
  const [historyList, setHistoryList] = useState<Array<{ id: string; title: string | null; agent_type: string; status: string; created_at: string; updated_at: string }>>([])

  // 思考模式
  const { thinkingSupported, useThinking, setUseThinking } = useThinkingMode({ enabled: open })

  // Bridge mode state
  type BridgeStatus = 'idle' | 'pending' | 'done' | 'error'
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>('idle')
  const [bridgeResult, setBridgeResult] = useState<string | null>(null)
  const [bridgeError, setBridgeError] = useState<string | null>(null)
  const bridgePollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { scrollContainerRef, messagesEndRef, showScrollButton, scrollToBottom, handleScroll, scrollToBottomIfNeeded } = useAutoScroll()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollToBottomIfNeeded()
  }, [messages, scrollToBottomIfNeeded])

  // Agent options（使用共享 hook，支持 deep-dive 的 data.data.agents 格式）
  const agentOptions = useAgentOptions({ enabled: open })

  /* Load an existing session when opened in read-only mode */
  useEffect(() => {
    if (!open) return
    if (!existingSessionId) {
      resetState()
      return
    }

    let cancelled = false
    api.getDeepDiveSession(existingSessionId).then((result) => {
      if (cancelled) return
      const s = result.session as Record<string, string>
      const msgs = result.messages as Array<{ id: string; session_id: string; role: string; content: string; created_at: string }>
      setSessionId(s.id ?? null)
      setMessages(msgs.map((m) => ({ id: m.id, role: m.role as 'user' | 'assistant' | 'system', content: m.content, created_at: m.created_at })))
      setAgentType((s.agent_type ?? 'direct') as AgentType)
      setReadOnly(false)
    }).catch(() => {
      if (!cancelled) toast.error('无法加载历史会话')
    })
    return () => { cancelled = true }
  }, [open, existingSessionId])

  // Cleanup bridge polling on unmount or dialog close
  useEffect(() => {
    return () => {
      if (bridgePollRef.current) {
        clearInterval(bridgePollRef.current)
        bridgePollRef.current = null
      }
    }
  }, [])

  /* ─── history ─── */
  const loadHistory = useCallback(async () => {
    try {
      const sessions = await api.listNodeSessions(nodeId)
      setHistoryList(
        (sessions as unknown as Array<{ id: string; title: string | null; agent_type: string; status: string; created_at: string; updated_at: string }>)
          .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()),
      )
    } catch { /* ignore */ }
  }, [nodeId])

  useEffect(() => {
    if (showHistory) loadHistory()
  }, [showHistory, loadHistory])

  const handleResumeSession = useCallback(async (targetSessionId: string) => {
    try {
      const result = await api.getDeepDiveSession(targetSessionId)
      const s = result.session as Record<string, string>
      const msgs = result.messages as Array<{ id: string; session_id: string; role: string; content: string; created_at: string }>
      setSessionId(s.id ?? null)
      setMessages(msgs.map((m) => ({ id: m.id, role: m.role as 'user' | 'assistant' | 'system', content: m.content, created_at: m.created_at })))
      setAgentType((s.agent_type ?? 'direct') as AgentType)
      setReadOnly(false)
      setShowHistory(false)
    } catch {
      toast.error('无法加载会话')
    }
  }, [])

  const handleDeleteHistorySession = useCallback(async (targetSessionId: string) => {
    if (!confirm('确认删除此对话？')) return
    try {
      await api.deleteDeepDiveSession(targetSessionId)
      setHistoryList((prev) => prev.filter((s) => s.id !== targetSessionId))
      if (sessionId === targetSessionId) {
        resetStateInner()
      }
      toast.success('已删除')
    } catch {
      toast.error('删除失败')
    }
  }, [sessionId])

  const handleNewChat = useCallback(() => {
    resetStateInner()
    setShowHistory(false)
  }, [])

  function resetStateInner() {
    setSessionId(null)
    setMessages([])
    setInputValue('')
    setSending(false)
    setReadOnly(false)
    setActiveSummarizeModes(new Set())
    setAgentType('direct')
    setBridgeStatus('idle')
    setBridgeResult(null)
    setBridgeError(null)
    if (bridgePollRef.current) {
      clearInterval(bridgePollRef.current)
      bridgePollRef.current = null
    }
  }

  function resetState() {
    resetStateInner()
  }

  const startSession = useCallback(async () => {
    try {
      const result = await api.createDeepDiveSession(nodeId, agentType)
      setSessionId(result.sessionId)
    } catch {
      toast.error('创建对话失败')
    }
  }, [nodeId, agentType])

  const handleSend = useCallback(async () => {
    const content = inputValue.trim()
    if (!content || sending) return

    /* If no session yet, create one first */
    let currentSessionId = sessionId
    if (!currentSessionId) {
      try {
        const result = await api.createDeepDiveSession(nodeId, agentType)
        currentSessionId = result.sessionId
        setSessionId(result.sessionId)
      } catch {
        toast.error('创建对话失败')
        return
      }
    }

    const userMessage: DeepDiveMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setSending(true)
    scrollToBottom()

    // Add a temporary streaming AI message
    const tempAiId = `streaming-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: tempAiId, role: 'assistant' as const, content: '', created_at: new Date().toISOString() },
    ])

    try {
      const response = await fetch(`/api/deepdive/${currentSessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, useThinking }),
      })

      if (!response.ok || !response.body) {
        throw new Error('Failed to send message')
      }

      const reader = response.body.getReader()
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
          const jsonStr = line.slice(6)
          try {
            const event = JSON.parse(jsonStr) as
              | { type: 'chunk'; content: string }
              | { type: 'done'; messageId: string; content: string }
              | { type: 'error'; error: string }

            if (event.type === 'chunk') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAiId ? { ...m, content: m.content + event.content } : m,
                ),
              )
            } else if (event.type === 'done') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAiId
                    ? { ...m, id: event.messageId, content: event.content }
                    : m,
                ),
              )
            } else if (event.type === 'error') {
              toast.error(event.error)
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch {
      toast.error('发送消息失败')
      // Remove the empty streaming message on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempAiId))
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }, [inputValue, sending, sessionId, nodeId, agentType])

  const handleSummarize = useCallback(async (mode: 'feed' | 'aspect' | 'extract-aspects') => {
    const targetSessionId = sessionId ?? existingSessionId
    if (!targetSessionId) return

    if (activeSummarizeModes.has(mode)) {
      const modeLabel = mode === 'feed' ? '投喂数据' : mode === 'extract-aspects' ? '提取切面' : '总结附件'
      toast.info(`${modeLabel}任务进行中，请稍候…`)
      return
    }

    setActiveSummarizeModes((prev) => new Set(prev).add(mode))
    try {
      const result = await api.summarizeConversation(targetSessionId, mode)
      if (result.mode === 'feed') {
        toast.success(`总结已投喂，创建了 ${result.suggestionsCount ?? 0} 条建议`)
      } else if (result.mode === 'extract-aspects') {
        toast.success('正在后台提取切面，稍后刷新即可查看')
      } else {
        toast.success('总结已生成并写入附件')
      }
    } catch {
      toast.error('操作失败')
    } finally {
      setActiveSummarizeModes((prev) => {
        const next = new Set(prev)
        next.delete(mode)
        return next
      })
    }
  }, [sessionId, existingSessionId, activeSummarizeModes])

  const startBridgePoll = useCallback((targetSessionId: string) => {
    if (bridgePollRef.current) clearInterval(bridgePollRef.current)
    bridgePollRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/deepdive/${targetSessionId}/bridge`)
        if (!response.ok) throw new Error('Poll failed')
        const data = await response.json()
        if (data.status === 'done') {
          setBridgeStatus('done')
          setBridgeResult(data.result ?? 'Bridge 任务已完成')
          if (bridgePollRef.current) {
            clearInterval(bridgePollRef.current)
            bridgePollRef.current = null
          }
        } else if (data.status === 'error') {
          setBridgeStatus('error')
          setBridgeError(data.error ?? 'Bridge 任务失败')
          if (bridgePollRef.current) {
            clearInterval(bridgePollRef.current)
            bridgePollRef.current = null
          }
        }
      } catch {
        // Silently retry on next interval
      }
    }, 5000)
  }, [])

  const handleBridgeStart = useCallback(async () => {
    if (!sessionId || bridgeStatus === 'pending') return
    setBridgeStatus('pending')
    setBridgeResult(null)
    setBridgeError(null)
    try {
      const response = await fetch(`/api/deepdive/${sessionId}/bridge`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to create bridge task')
      toast.success('已委托外部 Agent')
      startBridgePoll(sessionId)
    } catch {
      setBridgeStatus('error')
      setBridgeError('委托外部 Agent 失败')
      toast.error('委托外部 Agent 失败')
    }
  }, [sessionId, bridgeStatus, startBridgePoll])

  const handleBridgeCancel = useCallback(async () => {
    if (!sessionId) return
    try {
      await fetch(`/api/deepdive/${sessionId}/bridge`, { method: 'DELETE' })
      setBridgeStatus('idle')
      setBridgeResult(null)
      setBridgeError(null)
      if (bridgePollRef.current) {
        clearInterval(bridgePollRef.current)
        bridgePollRef.current = null
      }
      toast.success('已取消委托')
    } catch {
      toast.error('取消委托失败')
    }
  }, [sessionId])



  const sessionStarted = sessionId !== null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 flex gap-0 overflow-hidden"
        style={{ height: '80vh', maxWidth: showHistory ? '56rem' : '42rem', transition: 'max-width 0.25s ease-in-out' }}
      >
        {/* ─── history sidebar (左侧) ─── */}
        {showHistory && (
          <div
            className="flex-shrink-0 flex flex-col w-64 order-0"
            style={{ borderRight: '1px solid var(--clay-hairline-soft)', background: 'var(--clay-surface)' }}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--clay-hairline-soft)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--clay-ink)' }}>历史会话</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={handleNewChat} className="p-1 rounded hover:bg-black/5" title="新建对话">
                  <Plus className="h-4 w-4" style={{ color: 'var(--clay-muted)' }} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {historyList.length === 0 ? (
                <p className="text-xs px-4 py-6 text-center" style={{ color: 'var(--clay-muted)' }}>暂无历史会话</p>
              ) : (
                historyList.map((h) => {
                  const agentLabel = agentOptions.find((o) => o.value === h.agent_type)?.label ?? h.agent_type
                  return (
                    <div
                      key={h.id}
                      className="group flex items-start gap-2 px-4 py-2.5 cursor-pointer hover:bg-black/5"
                      style={{
                        background: h.id === sessionId ? 'var(--clay-primary-alpha-10)' : undefined,
                      }}
                      onClick={() => handleResumeSession(h.id)}
                    >
                      <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--clay-muted)' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--clay-ink)' }}>
                          {h.title || '未命名对话'}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{ background: 'var(--clay-primary-alpha-10)', color: 'var(--clay-primary)' }}
                          >
                            {agentLabel}
                          </span>
                          <span className="text-[10px]" style={{ color: 'var(--clay-muted)' }}>
                            {new Date(h.updated_at || h.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-black/10 flex-shrink-0"
                        onClick={(e) => { e.stopPropagation(); handleDeleteHistorySession(h.id) }}
                      >
                        <Trash2 className="h-3 w-3" style={{ color: 'var(--clay-muted)' }} />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* ─── main chat area ─── */}
        <div className="flex-1 flex flex-col gap-0 overflow-hidden min-w-0 order-1">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0" style={{ borderBottom: '1px solid var(--clay-hairline-soft)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" style={{ color: 'var(--clay-primary)' }} />
              <DialogTitle className="text-title-md">{nodeTitle} — Deep Dive</DialogTitle>
            </div>
            <div className="flex items-center gap-1.5 ml-4">
            {sessionStarted && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSummarize('extract-aspects')}
                  title="用当前对话内容提取切面"
                >
                  {activeSummarizeModes.has('extract-aspects') ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileText className="h-3.5 w-3.5" />
                  )}
                  提取切面
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSummarize('feed')}
                  title="用当前对话内容作为投喂数据"
                >
                  {activeSummarizeModes.has('feed') ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileText className="h-3.5 w-3.5" />
                  )}
                  投喂数据
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSummarize('aspect')}
                  title="生成总结附件，标注时间"
                >
                  {activeSummarizeModes.has('aspect') ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileText className="h-3.5 w-3.5" />
                  )}
                  总结附件
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBridgeStart}
                  disabled={bridgeStatus === 'pending'}
                >
                  {bridgeStatus === 'pending' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileText className="h-3.5 w-3.5" />
                  )}
                  委托 Agent
                </Button>
              </>
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
          <DialogDescription className="sr-only">
            与 AI 深入探讨节点「{nodeTitle}」
          </DialogDescription>
        </DialogHeader>

        {/* Agent selector — only before conversation starts */}
        {!sessionStarted && !readOnly && (
          <div className="px-6 pb-3 shrink-0">
            <AgentSelector options={agentOptions} value={agentType} onChange={setAgentType} size="md" className="px-0 py-0" />
          </div>
        )}

        {/* Thinking mode toggle */}
        {!readOnly && (
          <div className="px-6 pb-2 shrink-0">
            <ThinkingToggle supported={thinkingSupported} enabled={useThinking} onChange={setUseThinking} />
          </div>
        )}

        {/* Read-only badge for historical sessions */}
        {readOnly && (
          <div className="px-6 pb-2 shrink-0">
            <span className="clay-badge text-xs">
              历史对话 · 只读
            </span>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollContainerRef} onScroll={handleScroll} className="relative flex-1 overflow-y-auto px-6 py-3 space-y-3 min-h-0">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm" style={{ color: 'var(--clay-muted)' }}>
                {readOnly ? '该会话没有消息' : '开始对话，深入探索这个概念 ✨'}
              </p>
            </div>
          )}

          {messages.map((message) => {
            if (message.role === 'system') {
              return (
                <div key={message.id} className="flex justify-center">
                  <p className="text-xs px-3 py-1 rounded-full" style={{ color: 'var(--clay-muted)', background: 'var(--clay-surface-soft)' }}>
                    {message.content}
                  </p>
                </div>
              )
            }

            const isUser = message.role === 'user'
            const isStreaming = message.id.startsWith('streaming-')
            return (
              <div
                key={message.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[80%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                  style={{
                    borderRadius: isUser ? 'var(--radius-xl) var(--radius-xl) var(--radius-sm) var(--radius-xl)' : 'var(--radius-xl) var(--radius-xl) var(--radius-xl) var(--radius-sm)',
                    background: isUser ? 'var(--clay-primary)' : 'var(--clay-surface-card)',
                    color: isUser ? 'var(--clay-on-primary)' : 'var(--clay-ink)',
                  }}
                >
                  {/* 用户消息：纯文本；AI 消息：始终 Markdown 渲染（含流式） */}
                  {isUser ? (
                    message.content
                  ) : (
                    <MarkdownRenderer content={message.content} streaming={isStreaming} />
                  )}

                </div>
              </div>
            )
          })}

          {sending && (
            <div className="flex justify-start">
              <div className="px-4 py-2.5" style={{ background: 'var(--clay-surface-card)', borderRadius: 'var(--radius-xl) var(--radius-xl) var(--radius-xl) var(--radius-sm)' }}>
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--clay-muted)' }} />
              </div>
            </div>
          )}

          {/* Bridge mode status */}
          {bridgeStatus === 'pending' && (
            <div className="flex justify-center">
              <div className="flex items-center gap-2 px-4 py-2.5 text-sm rounded-lg" style={{ background: 'var(--clay-surface-soft)', color: 'var(--clay-muted)' }}>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>已委托外部 Agent，等待结果...</span>
                <Button variant="ghost" size="sm" onClick={handleBridgeCancel} className="ml-2 h-6 px-2">
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  取消委托
                </Button>
              </div>
            </div>
          )}

          {bridgeStatus === 'done' && bridgeResult && (
            <div className="flex justify-start">
              <div
                className="max-w-[80%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                style={{
                  borderRadius: 'var(--radius-xl) var(--radius-xl) var(--radius-xl) var(--radius-sm)',
                  background: 'var(--clay-surface-card)',
                  color: 'var(--clay-ink)',
                  border: '1px solid var(--clay-primary)',
                }}
              >
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--clay-primary)' }}>外部 Agent 结果</p>
                {bridgeResult}
              </div>
            </div>
          )}

          {bridgeStatus === 'error' && bridgeError && (
            <div className="flex justify-center">
              <div className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg" style={{ background: 'var(--clay-surface-soft)', color: 'var(--clay-error, #ef4444)' }}>
                <XCircle className="h-4 w-4" />
                <span>{bridgeError}</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* scroll-to-bottom button — 放在滚动容器外部 */}
        <ScrollToBottomButton visible={showScrollButton} onClick={scrollToBottom} />

        {/* Input area */}
        {!readOnly && (
          <ChatInput
            textareaRef={textareaRef}
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSend}
            sending={sending}
            placeholder="输入你的想法… (Shift+Enter 换行)"
            rows={2}
          />
        )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
