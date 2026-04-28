import type { Node, Edge, Suggestion, Aspect } from '@galaxy/shared'
import type { CreateNodeInput, UpdateNodeInput, CreateEdgeInput } from './schemas'

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

  // Aspects
  listAspects: (nodeId: string) =>
    fetch(`/api/nodes/${nodeId}/aspects`).then((r) => handle<Aspect[]>(r)),
  updateAspect: (nodeId: string, data: { templateKey: string; content: string }) =>
    fetch(`/api/nodes/${nodeId}/aspects`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(data) }).then(
      (r) => handle<Aspect>(r),
    ),
}
