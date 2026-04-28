import type { Node, Edge, Suggestion, Aspect } from '@galaxy/shared'
import type { CreateNodeInput, UpdateNodeInput, CreateEdgeInput } from './schemas'

export interface DeepDiveMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

export interface DeepDiveSession {
  id: string
  node_id: string
  agent_type: string
  status: 'active' | 'completed'
  messages: DeepDiveMessage[]
  created_at: string
  completed_at?: string
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  const json = (await res.json()) as { data: T }
  return json.data
}

export const api = {
  listNodes: () => fetch('/api/nodes').then((r) => handle<Node[]>(r)),
  createNode: (input: CreateNodeInput) =>
    fetch('/api/nodes', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }).then((r) =>
      handle<Node>(r),
    ),
  updateNode: (id: string, input: UpdateNodeInput) =>
    fetch(`/api/nodes/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(input) }).then((r) =>
      handle<Node>(r),
    ),
  deleteNode: (id: string) =>
    fetch(`/api/nodes/${id}`, { method: 'DELETE' }).then((r) => handle<{ id: string }>(r)),
  listEdges: () => fetch('/api/edges').then((r) => handle<Edge[]>(r)),
  createEdge: (input: CreateEdgeInput) =>
    fetch('/api/edges', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }).then((r) =>
      handle<Edge>(r),
    ),
  deleteEdge: (id: string) =>
    fetch(`/api/edges/${id}`, { method: 'DELETE' }).then((r) => handle<{ id: string }>(r)),

  // Feed
  submitFeed: (input: { type: string; content?: string; url?: string }) =>
    fetch('/api/feed', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }).then((r) =>
      handle<{ feed_item_id: string; suggestions_count: number; cost_usd?: number; duration_ms?: number }>(r),
    ),

  // Inbox
  listInbox: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return fetch(`/api/inbox${qs}`).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = await r.json()
      return json as { data: Suggestion[]; meta: { total: number; page: number; limit: number } }
    })
  },
  confirmSuggestion: (id: string, input: { action: string; modified_payload?: unknown; decision_note?: string }) =>
    fetch(`/api/inbox/${id}/confirm`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }).then((r) =>
      handle<{ id: string; status: string; created?: Array<{ type: string; id: string }> }>(r),
    ),
  batchConfirm: (input: { ids: string[]; action: string; decision_note?: string }) =>
    fetch('/api/inbox/batch', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }).then((r) =>
      handle<{ updated: number; action: string }>(r),
    ),

  // Settings
  getSettings: () => fetch('/api/settings').then((r) => handle<Record<string, unknown>>(r)),
  updateSettings: (input: Record<string, unknown>) =>
    fetch('/api/settings', { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(input) }).then((r) =>
      handle<Record<string, unknown>>(r),
    ),

  testConnection: (input: { providerId: string; model?: string }) =>
    fetch('/api/settings/test-connection', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    }).then((r) => handle<{ ok: boolean; model?: string; latencyMs?: number; error?: string }>(r)),

  // Cost Stats
  getCostStats: () =>
    fetch('/api/settings/cost-stats').then((r) =>
      handle<{
        totalCostUsd: number
        totalCalls: number
        thisMonthCostUsd: number
        thisMonthCalls: number
        byProvider: Array<{ providerId: string; costUsd: number; calls: number }>
      }>(r),
    ),

  // Aspects
  listAspects: (nodeId: string) =>
    fetch(`/api/nodes/${nodeId}/aspects`).then((r) => handle<Aspect[]>(r)),
  updateAspect: (nodeId: string, data: { templateKey: string; content: string }) =>
    fetch(`/api/nodes/${nodeId}/aspects`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(data) }).then(
      (r) => handle<Aspect>(r),
    ),

  // Deep Dive
  createDeepDiveSession: (nodeId: string, agentType: string) =>
    fetch('/api/deepdive', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ nodeId, agentType }),
    }).then((r) => handle<{ sessionId: string }>(r)),

  getDeepDiveSession: (sessionId: string) =>
    fetch(`/api/deepdive/${sessionId}`).then((r) =>
      handle<{
        session: Record<string, unknown>
        messages: Array<{ id: string; session_id: string; role: string; content: string; created_at: string }>
      }>(r),
    ),

  sendDeepDiveMessage: (sessionId: string, content: string) =>
    fetch(`/api/deepdive/${sessionId}/message`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ content }),
    }).then((r) =>
      handle<{
        message: { id: string; session_id: string; role: string; content: string; created_at: string }
      }>(r),
    ),

  completeDeepDive: (sessionId: string) =>
    fetch(`/api/deepdive/${sessionId}/complete`, { method: 'POST' }).then((r) =>
      handle<{ suggestionsCreated: number }>(r),
    ),

  summarizeConversation: (sessionId: string, mode: 'feed' | 'aspect') =>
    fetch(`/api/deepdive/${sessionId}/summarize`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ mode }),
    }).then((r) =>
      handle<{ mode: string; summary: string; suggestionsCount?: number; aspectId?: string }>(r),
    ),

  listNodeSessions: (nodeId: string) =>
    fetch(`/api/nodes/${nodeId}/sessions`).then((r) =>
      handle<Array<Record<string, unknown>>>(r),
    ),

  // Scan
  triggerScan: () =>
    fetch('/api/scan/trigger', { method: 'POST' }).then((r) =>
      handle<{ scanRunId: string }>(r),
    ),
  getScanStatus: () =>
    fetch('/api/scan/status').then((r) =>
      handle<Array<{
        id: string
        trigger: string
        status: string
        started_at: string
        finished_at: string | null
        suggestions_count: number
        cost_tokens: number
        cost_usd: number
        error_message: string | null
      }>>(r),
    ),

  // Bridge
  startBridgeTask: (sessionId: string) =>
    fetch(`/api/deepdive/${sessionId}/bridge`, { method: 'POST' }).then((r) =>
      handle<{ taskPath: string }>(r),
    ),
  pollBridgeResult: (sessionId: string) =>
    fetch(`/api/deepdive/${sessionId}/bridge`).then((r) =>
      handle<{ status: 'pending' | 'done'; result?: unknown }>(r),
    ),
  cancelBridgeTask: (sessionId: string) =>
    fetch(`/api/deepdive/${sessionId}/bridge`, { method: 'DELETE' }).then((r) =>
      handle<{ cancelled: boolean }>(r),
    ),

  // Risk Control
  getRiskData: () =>
    fetch('/api/risk').then((r) =>
      handle<{
        acceptance: { accepted: number; total: number; rate: number }
        inboxBacklog: number
        budget: { enabled: boolean; monthlyBudgetUsd: number; currentCostUsd: number; usageRate: number }
        duplicateNodes: Array<{ nodeA: string; nodeB: string; titleA: string; titleB: string; similarity: number }>
      }>(r),
    ),

  // Data Safety
  triggerBackup: () =>
    fetch('/api/data/backup', { method: 'POST' }).then((r) =>
      handle<{ backupPath: string; backupsCount: number }>(r),
    ),
  exportData: (format: 'json' | 'markdown') =>
    fetch(`/api/data/export?format=${format}`).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const blob = await r.blob()
      const extension = format === 'json' ? 'json' : 'md'
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `galaxy-export.${extension}`
      anchor.click()
      URL.revokeObjectURL(url)
    }),

  // Safety Mode
  killAllAI: () =>
    fetch('/api/safety/kill-all', { method: 'POST' }).then((r) =>
      handle<{ disabled: true }>(r),
    ),
}
