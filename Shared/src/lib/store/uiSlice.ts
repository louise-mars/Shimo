/**
 * UI slice — manages theme, layout visibility, search, and immersive mode.
 */

import type { StateCreator } from 'zustand'
import type { UISlice, AppStore } from './types'
import type { ThemeMode } from '../../types'

export const createUISlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  UISlice
> = (set) => ({
  // --- State ---
  theme: 'system' as ThemeMode,
  activeTag: null,
  searchQuery: '',
  sidebarVisible: true,
  noteListVisible: true,
  noteListWidth: 260,
  immersiveMode: false,

  // --- Actions ---

  /** Cycle theme: light → dark → system → light */
  toggleTheme: () => {
    set((state) => {
      const cycle: Record<ThemeMode, ThemeMode> = {
        light: 'dark',
        dark: 'system',
        system: 'light',
      }
      state.theme = cycle[state.theme]
    })
  },

  /** Set the active tag filter. Pass null to clear. */
  setActiveTag: (tag: string | null) => {
    set((state) => {
      state.activeTag = tag
    })
  },

  /** Set the search query string. */
  setSearch: (query: string) => {
    set((state) => {
      state.searchQuery = query
    })
  },

  /** Toggle sidebar visibility. */
  toggleSidebar: () => {
    set((state) => {
      state.sidebarVisible = !state.sidebarVisible
    })
  },

  /** Toggle note list visibility. */
  toggleNoteList: () => {
    set((state) => {
      state.noteListVisible = !state.noteListVisible
    })
  },

  /** Set note list panel width (clamped to 200-400px). */
  setNoteListWidth: (width: number) => {
    set((state) => {
      state.noteListWidth = Math.max(200, Math.min(400, width))
    })
  },

  /** Set immersive mode to the given boolean. */
  setImmersiveMode: (active: boolean) => {
    set((state) => {
      state.immersiveMode = active
    })
  },
})
