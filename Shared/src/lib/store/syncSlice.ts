/**
 * Sync slice — manages sync engine status exposed to UI.
 * Actual sync logic (SyncEngine orchestration) is wired in task 25.1.
 */

import type { StateCreator } from 'zustand'
import type { SyncSlice, SyncStatus, AppStore } from './types'

export const createSyncSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  SyncSlice
> = (set) => ({
  // --- State ---
  syncStatus: 'idle' as SyncStatus,
  lastSyncAt: null,
  syncError: null,

  // --- Actions ---

  /** Placeholder: sets status to 'syncing'. Real sync logic wired in task 25.1. */
  triggerSync: async () => {
    set((state) => {
      state.syncStatus = 'syncing'
    })
  },

  /** Directly set the sync status field. */
  setSyncStatus: (status: SyncStatus) => {
    set((state) => {
      state.syncStatus = status
    })
  },

  /** Set sync error. Also updates syncStatus to 'error' if non-null, or 'idle' if null. */
  setSyncError: (error: string | null) => {
    set((state) => {
      state.syncError = error
      state.syncStatus = error !== null ? 'error' : 'idle'
    })
  },
})
