import { create } from 'zustand'
import type { Node, Edge } from '@galaxy/shared'
import { api } from '../api/client'

interface GraphState {
  nodes: Node[]
  edges: Edge[]
  selectedNodeId: string | null
  loading: boolean
  error: string | null

  loadAll: () => Promise<void>
  selectNode: (id: string | null) => void
  addNode: (input: Parameters<typeof api.createNode>[0]) => Promise<Node>
  patchNode: (id: string, input: Parameters<typeof api.updateNode>[1]) => Promise<void>
  removeNode: (id: string) => Promise<void>
  addEdge: (input: Parameters<typeof api.createEdge>[0]) => Promise<Edge>
  removeEdge: (id: string) => Promise<void>
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  loading: false,
  error: null,

  async loadAll() {
    set({ loading: true, error: null })
    try {
      const [nodes, edges] = await Promise.all([api.listNodes(), api.listEdges()])
      set({ nodes, edges, loading: false })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      set({ error: message, loading: false })
    }
  },

  selectNode(id) {
    set({ selectedNodeId: id })
  },

  async addNode(input) {
    const node = await api.createNode(input)
    set({ nodes: [...get().nodes, node] })
    return node
  },

  async patchNode(id, input) {
    const updated = await api.updateNode(id, input)
    set({ nodes: get().nodes.map((n) => (n.id === id ? updated : n)) })
  },

  async removeNode(id) {
    await api.deleteNode(id)
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source_node_id !== id && e.target_node_id !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    })
  },

  async addEdge(input) {
    const edge = await api.createEdge(input)
    set({ edges: [...get().edges, edge] })
    return edge
  },

  async removeEdge(id) {
    await api.deleteEdge(id)
    set({ edges: get().edges.filter((e) => e.id !== id) })
  },
}))
