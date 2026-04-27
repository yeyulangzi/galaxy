import type { Node, Edge } from '@galaxy/shared'
import type { CreateNodeInput, UpdateNodeInput, CreateEdgeInput } from './schemas'

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
    fetch('/api/nodes', { method: 'POST', body: JSON.stringify(input) }).then((r) => handle<Node>(r)),
  updateNode: (id: string, input: UpdateNodeInput) =>
    fetch(`/api/nodes/${id}`, { method: 'PATCH', body: JSON.stringify(input) }).then((r) => handle<Node>(r)),
  deleteNode: (id: string) =>
    fetch(`/api/nodes/${id}`, { method: 'DELETE' }).then((r) => handle<{ id: string }>(r)),
  listEdges: () => fetch('/api/edges').then((r) => handle<Edge[]>(r)),
  createEdge: (input: CreateEdgeInput) =>
    fetch('/api/edges', { method: 'POST', body: JSON.stringify(input) }).then((r) => handle<Edge>(r)),
  deleteEdge: (id: string) =>
    fetch(`/api/edges/${id}`, { method: 'DELETE' }).then((r) => handle<{ id: string }>(r)),
}
