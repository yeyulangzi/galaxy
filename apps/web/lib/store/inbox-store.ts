import { create } from 'zustand'
import type { Suggestion } from '@galaxy/shared'
import { api } from '../api/client'

interface InboxState {
  suggestions: Suggestion[]
  total: number
  page: number
  loading: boolean
  error: string | null
  selectedIds: Set<string>

  loadInbox: (params?: Record<string, string>) => Promise<void>
  confirmOne: (id: string, action: 'accept' | 'reject' | 'accept_modified', opts?: { modified_payload?: unknown; decision_note?: string }) => Promise<void>
  batchConfirm: (action: 'accept' | 'reject') => Promise<void>
  toggleSelect: (id: string) => void
  selectAll: () => void
  clearSelection: () => void
}

export const useInboxStore = create<InboxState>((set, get) => ({
  suggestions: [],
  total: 0,
  page: 1,
  loading: false,
  error: null,
  selectedIds: new Set(),

  async loadInbox(params) {
    set({ loading: true, error: null })
    try {
      const result = await api.listInbox(params)
      set({ suggestions: result.data, total: result.meta.total, page: result.meta.page, loading: false })
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false })
    }
  },

  async confirmOne(id, action, opts) {
    await api.confirmSuggestion(id, { action, ...opts })
    set({ suggestions: get().suggestions.filter((s) => s.id !== id), total: get().total - 1 })
  },

  async batchConfirm(action) {
    const ids = [...get().selectedIds]
    if (ids.length === 0) return
    // 分批发送，每批最多 50 个，避免超时和 payload 过大
    const BATCH_SIZE = 50
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE)
      await api.batchConfirm({ ids: batch, action })
    }
    set({
      suggestions: get().suggestions.filter((s) => !get().selectedIds.has(s.id)),
      total: get().total - ids.length,
      selectedIds: new Set(),
    })
  },

  toggleSelect(id) {
    const next = new Set(get().selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    set({ selectedIds: next })
  },

  selectAll() {
    set({ selectedIds: new Set(get().suggestions.map((s) => s.id)) })
  },

  clearSelection() {
    set({ selectedIds: new Set() })
  },
}))
