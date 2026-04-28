'use client'

import { useEffect, useRef, useState, useCallback, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { MessageCircle, Send, CheckCircle2, Loader2 } from 'lucide-react'
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
import type { DeepDiveMessage, DeepDiveSession } from '@/lib/api/client'

const AGENT_TYPES = [
  { key: 'direct', label: '直接对话', description: 'Direct' },
  { key: 'thinker', label: '思辨者', description: 'Thinker' },
  { key: 'partner', label: '产品合伙人', description: 'Partner' },
] as const

type AgentType = (typeof AGENT_TYPES)[number]['key']

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
  const [completing, setCompleting] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [suggestionsCreated, setSuggestionsCreated] = useState(0)
  const [readOnly, setReadOnly] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  /* Load an existing session when opened in read-only mode */
  useEffect(() => {
    if (!open) return
    if (!existingSessionId) {
      resetState()
      return
    }

    let cancelled = false
    setReadOnly(true)
    api.getDeepDiveSession(existingSessionId).then((session) => {
      if (cancelled) return
      setSessionId(session.id)
      setMessages(session.messages)
      setAgentType(session.agent_type as AgentType)
      setCompleted(session.status === 'completed')
    }).catch(() => {
      if (!cancelled) toast.error('无法加载历史会话')
    })
    return () => { cancelled = true }
  }, [open, existingSessionId])

  function resetState() {
    setSessionId(null)
    setMessages([])
    setInputValue('')
    setSending(false)
    setCompleting(false)
    setCompleted(false)
    setSuggestionsCreated(0)
    setReadOnly(false)
    setAgentType('direct')
  }

  const startSession = useCallback(async () => {
    try {
      const session = await api.createDeepDiveSession(nodeId, agentType)
      setSessionId(session.id)
      if (session.messages.length > 0) {
        setMessages(session.messages)
      }
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
        const session = await api.createDeepDiveSession(nodeId, agentType)
        currentSessionId = session.id
        setSessionId(session.id)
        if (session.messages.length > 0) {
          setMessages(session.messages)
        }
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

    try {
      const aiMessage = await api.sendDeepDiveMessage(currentSessionId, content)
      setMessages((prev) => [...prev, aiMessage])
    } catch {
      toast.error('发送消息失败')
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }, [inputValue, sending, sessionId, nodeId, agentType])

  const handleComplete = useCallback(async () => {
    if (!sessionId || completing) return
    setCompleting(true)
    try {
      const result = await api.completeDeepDive(sessionId)
      setCompleted(true)
      setSuggestionsCreated(result.suggestionsCreated)
      toast.success(`对话已结束，创建了 ${result.suggestionsCreated} 条建议`)
    } catch {
      toast.error('结束对话失败')
    } finally {
      setCompleting(false)
    }
  }, [sessionId, completing])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const sessionStarted = sessionId !== null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              <DialogTitle>{nodeTitle} — Deep Dive</DialogTitle>
            </div>
            {sessionStarted && !completed && !readOnly && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleComplete}
                disabled={completing}
                className="ml-4"
              >
                {completing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                结束对话
              </Button>
            )}
          </div>
          <DialogDescription className="sr-only">
            与 AI 深入探讨节点「{nodeTitle}」
          </DialogDescription>
        </DialogHeader>

        {/* Agent selector — only before conversation starts */}
        {!sessionStarted && !readOnly && (
          <div className="px-6 pb-3 shrink-0">
            <p className="text-xs text-muted-foreground mb-2">选择 Agent 类型</p>
            <div className="flex gap-2">
              {AGENT_TYPES.map((agent) => (
                <Button
                  key={agent.key}
                  variant={agentType === agent.key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAgentType(agent.key)}
                  className="flex-1"
                >
                  <span className="font-medium">{agent.label}</span>
                  <span className="ml-1 text-xs opacity-60">{agent.description}</span>
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Read-only badge for historical sessions */}
        {readOnly && (
          <div className="px-6 pb-2 shrink-0">
            <span className="inline-block text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              历史对话 · 只读
            </span>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-3 min-h-0">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">
                {readOnly ? '该会话没有消息' : '开始对话，深入探索这个概念 ✨'}
              </p>
            </div>
          )}

          {messages.map((message) => {
            if (message.role === 'system') {
              return (
                <div key={message.id} className="flex justify-center">
                  <p className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                    {message.content}
                  </p>
                </div>
              )
            }

            const isUser = message.role === 'user'
            return (
              <div
                key={message.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    isUser
                      ? 'bg-primary/15 text-foreground rounded-br-md'
                      : 'bg-muted text-foreground rounded-bl-md'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            )
          })}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Completion banner */}
        {completed && (
          <div className="px-6 py-3 border-t border-border bg-muted/30 shrink-0">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
              <span>
                对话已结束，创建了{' '}
                <strong className="text-foreground">{suggestionsCreated}</strong> 条建议
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              前往 Inbox 查看并确认建议
            </p>
          </div>
        )}

        {/* Input area */}
        {!completed && !readOnly && (
          <div className="px-6 py-3 border-t border-border shrink-0">
            <div className="flex items-end gap-2">
              <Textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入你的想法… (Shift+Enter 换行)"
                disabled={sending}
                rows={2}
                className="flex-1 resize-none bg-transparent text-sm min-h-[44px] max-h-[120px]"
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!inputValue.trim() || sending}
                className="shrink-0"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
