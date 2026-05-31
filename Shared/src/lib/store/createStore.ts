/**
 * Combined Zustand store with Immer + subscribeWithSelector middleware.
 *
 * - `immer` enables ergonomic immutable updates via draft mutation
 * - `subscribeWithSelector` enables atomic subscriptions so components
 *   only re-render when their specific slice of state changes
 *
 * Atomic selectors are exported as standalone hooks for optimal re-render
 * performance. The raw store instance is also exported for non-React usage
 * (e.g., sync engine, persistence layer).
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { subscribeWithSelector } from 'zustand/middleware'
import { createNoteSlice } from './noteSlice'
import { createFolderSlice } from './folderSlice'
import { createSyncSlice } from './syncSlice'
import { createUISlice } from './uiSlice'
import type { AppStore } from './types'

/**
 * The main application store combining all slices.
 * Can be used as a React hook (with optional selector) or accessed
 * directly via `.getState()` / `.subscribe()` for non-React code.
 */
export const useAppStore = create<AppStore>()(
  subscribeWithSelector(
    immer((set, get, store) => ({
      ...createNoteSlice(set, get),
      ...createFolderSlice(set, get, store),
      ...createSyncSlice(set, get, store),
      ...createUISlice(set, get, store),
    }))
  )
)

/**
 * Raw store instance for non-React usage (sync engine, persistence, tests).
 * Provides getState(), setState(), subscribe(), and getInitialState().
 */
export const appStore = useAppStore

// === Atomic Selectors ===
// Each selector subscribes to the minimal state needed, preventing
// unnecessary re-renders when unrelated state changes.

/**
 * Returns the full Note object for the current activeNoteId, or null.
 * Re-renders only when the active note or activeNoteId changes.
 */
export const useActiveNote = () =>
  useAppStore((s) => s.notes.find((n) => n.id === s.activeNoteId) ?? null)

/**
 * Returns the count of non-deleted, non-hidden notes.
 * Re-renders only when notes are added/removed/deleted/hidden.
 */
export const useNoteCount = () =>
  useAppStore((s) => s.notes.filter((n) => !n.deletedAt && !n.hidden).length)

/**
 * Returns notes filtered by activeTag, searchQuery, and activeFolderId,
 * excluding deleted and hidden notes.
 * Re-renders when filter criteria or the notes array changes.
 */
export const useFilteredNotes = () =>
  useAppStore((s) => {
    let notes = s.notes.filter((n) => !n.deletedAt && !n.hidden)
    if (s.activeTag) {
      notes = notes.filter((n) => n.tags.includes(s.activeTag!))
    }
    if (s.searchQuery) {
      const query = s.searchQuery.toLowerCase()
      notes = notes.filter(
        (n) =>
          n.title.toLowerCase().includes(query) ||
          n.content.toLowerCase().includes(query) ||
          n.tags.some((t) => t.toLowerCase().includes(query))
      )
    }
    if (s.activeFolderId) {
      notes = notes.filter((n) => n.folderId === s.activeFolderId)
    }
    return notes
  })

/**
 * Returns the current sync status.
 * Re-renders only when syncStatus changes.
 */
export const useSyncStatus = () => useAppStore((s) => s.syncStatus)

/**
 * Returns the current theme mode ('light' | 'dark' | 'system').
 * Re-renders only when theme changes.
 */
export const useTheme = () => useAppStore((s) => s.theme)
