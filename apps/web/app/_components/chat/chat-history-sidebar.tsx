'use client'

import { Plus, Trash2, MessageSquare } from 'lucide-react'
import type { AgentOption } from './types'

export interface HistorySession {
  id: string
  title: string | null
  agent_type: string
  status: string
  created_at: string
  updated_at?: string
}

interface ChatHistorySidebarProps {
  open: boolean
  sessions: HistorySession[]
  currentSessionId: string | null
  agentOptions: AgentOption[]
  onSelect: (sessionId: string) => void
  onDelete: (sessionId: string) => void
  onNewChat: () => void
}

export function ChatHistorySidebar({
  open,
  sessions,
  currentSessionId,
  agentOptions,
  onSelect,
  onDelete,
  onNewChat,
}: ChatHistorySidebarProps) {
  return (
    <div
      className="flex-shrink-0 overflow-hidden transition-all duration-200 order-0"
      style={{
        maxWidth: open ? 220 : 0,
        borderRight: open ? '1px solid var(--clay-hairline-soft)' : 'none',
      }}
    >
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--clay-hairline-soft)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--clay-ink)' }}>历史会话</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onNewChat} className="p-1 rounded hover:bg-black/5" title="新建对话">
            <Plus className="h-4 w-4" style={{ color: 'var(--clay-muted)' }} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <p className="text-xs px-4 py-6 text-center" style={{ color: 'var(--clay-muted)' }}>暂无历史会话</p>
        ) : (
          sessions.map((session) => {
            const agentLabel = agentOptions.find((o) => o.value === session.agent_type)?.label ?? session.agent_type
            return (
              <div
                key={session.id}
                className="group flex items-start gap-2 px-4 py-2.5 cursor-pointer hover:bg-black/5"
                style={{
                  background: session.id === currentSessionId ? 'var(--clay-primary-alpha-10)' : undefined,
                }}
                onClick={() => onSelect(session.id)}
              >
                <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--clay-muted)' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--clay-ink)' }}>
                    {session.title || '未命名对话'}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: 'var(--clay-primary-alpha-10)', color: 'var(--clay-primary)' }}
                    >
                      {agentLabel}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--clay-muted)' }}>
                      {new Date(session.updated_at || session.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-black/10 flex-shrink-0"
                  onClick={(e) => { e.stopPropagation(); onDelete(session.id) }}
                >
                  <Trash2 className="h-3 w-3" style={{ color: 'var(--clay-muted)' }} />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
