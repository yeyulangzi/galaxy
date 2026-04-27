import { create } from 'zustand'
import { api } from '../api/client'

interface SettingsState {
  settings: Record<string, unknown> | null
  loading: boolean

  loadSettings: () => Promise<void>
  updateSettings: (patch: Record<string, unknown>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  loading: false,

  async loadSettings() {
    set({ loading: true })
    try {
      const data = await api.getSettings()
      set({ settings: data, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  async updateSettings(patch) {
    const data = await api.updateSettings(patch)
    set({ settings: data })
  },
}))
