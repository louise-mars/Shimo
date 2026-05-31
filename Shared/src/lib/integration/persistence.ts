/**
 * Integration wiring module — connects Zustand store to:
 * 1. IndexedDB persistence (debounced 500ms)
 * 2. OfflineQueue (enqueue mutations for sync)
 * 3. SyncEngine real-time subscription → store.mergeRemoteNotes
 *
 * Requirements: 3.1, 3.2, 10.2, 10.9
 */

import type { AppStore } from '../store/types'
import type { Note, Folder } from '../../types'
import { debouncedPersist } from '../storage/indexedDB'
import type { OfflineQueue } from '../sync/OfflineQueue'
import type { SyncEngine } from '../sync/SyncEngine'

// ─── IndexedDB Persistence Keys ──────────────────────────────────────────────

const PERSIST_KEY_NOTES = 'shimo-notes'
const PERSIST_KEY_FOLDERS = 'shimo-folders'
const PERSIST_KEY_THEME = 'shimo-theme'
const PERSIST_KEY_ACTIVE_TAG = 'shimo-activeTag'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Store instance type — Zustand store with subscribe and getState */
export interface StoreInstance {
  getState: () => AppStore
  subscribe: {
    (listener: (state: AppStore, prevState: AppStore) => void): () => void
    <T>(
      selector: (state: AppStore) => T,
      listener: (value: T, prevValue: T) => void,
      options?: { equalityFn?: (a: T, b: T) => boolean; fireImmediately?: boolean }
    ): () => void
  }
}

/** Cleanup function returned by setup functions */
export type CleanupFn = () => void

// ─── setupPersistence ────────────────────────────────────────────────────────

/**
 * Subscribe to Zustand store changes and persist relevant slices to IndexedDB
 * using debounced writes (500ms).
 *
 * Persists:
 * - notes array
 * - folders array
 * - theme preference
 * - activeTag
 *
 * Returns a cleanup function that unsubscribes all listeners.
 */
export function setupPersistence(store: StoreInstance): CleanupFn {
  // Subscribe to notes changes
  const unsubNotes = store.subscribe(
    (state) => state.notes,
    (notes) => {
      debouncedPersist(PERSIST_KEY_NOTES, notes)
    }
  )

  // Subscribe to folders changes
  const unsubFolders = store.subscribe(
    (state) => state.folders,
    (folders) => {
      debouncedPersist(PERSIST_KEY_FOLDERS, folders)
    }
  )

  // Subscribe to theme changes
  const unsubTheme = store.subscribe(
    (state) => state.theme,
    (theme) => {
      debouncedPersist(PERSIST_KEY_THEME, theme)
    }
  )

  // Subscribe to activeTag changes
  const unsubActiveTag = store.subscribe(
    (state) => state.activeTag,
    (activeTag) => {
      debouncedPersist(PERSIST_KEY_ACTIVE_TAG, activeTag)
    }
  )

  return () => {
    unsubNotes()
    unsubFolders()
    unsubTheme()
    unsubActiveTag()
  }
}

// ─── setupSyncWiring ─────────────────────────────────────────────────────────

/**
 * Wire store mutations to the OfflineQueue and connect the SyncEngine's
 * real-time subscription to store.mergeRemoteNotes.
 *
 * - Detects note/folder mutations by comparing previous and current state
 * - Enqueues corresponding SyncOps to the OfflineQueue
 * - Notifies the SyncEngine of local changes (triggers debounced sync)
 * - Wires the SyncEngine's real-time subscription callback to the store
 *
 * Returns a cleanup function that unsubscribes all listeners.
 */
export function setupSyncWiring(
  store: StoreInstance,
  syncEngine: SyncEngine,
  offlineQueue: OfflineQueue
): CleanupFn {
  // Track note mutations and enqueue to offline queue
  const unsubNotes = store.subscribe(
    (state) => state.notes,
    (notes, prevNotes) => {
      detectNoteMutations(notes, prevNotes, offlineQueue)
      syncEngine.notifyLocalChange()
    }
  )

  // Track folder mutations and enqueue to offline queue
  const unsubFolders = store.subscribe(
    (state) => state.folders,
    (folders, prevFolders) => {
      detectFolderMutations(folders, prevFolders, offlineQueue)
      syncEngine.notifyLocalChange()
    }
  )

  return () => {
    unsubNotes()
    unsubFolders()
  }
}

// ─── Mutation Detection Helpers ──────────────────────────────────────────────

/**
 * Detect note mutations by comparing current and previous notes arrays.
 * Enqueues upsert_note for new/updated notes and delete_note for removed notes.
 */
function detectNoteMutations(
  notes: Note[],
  prevNotes: Note[],
  queue: OfflineQueue
): void {
  const prevMap = new Map(prevNotes.map((n) => [n.id, n]))
  const currentMap = new Map(notes.map((n) => [n.id, n]))

  // Detect new or updated notes
  for (const note of notes) {
    const prev = prevMap.get(note.id)
    if (!prev) {
      // New note
      queue.enqueue({
        type: 'upsert_note',
        entityId: note.id,
        payload: { ...note } as unknown as Record<string, unknown>,
      })
    } else if (note.updatedAt !== prev.updatedAt) {
      // Updated note (updatedAt changed)
      if (note.deletedAt && !prev.deletedAt) {
        // Soft-deleted — enqueue as delete
        queue.enqueue({
          type: 'delete_note',
          entityId: note.id,
          payload: { id: note.id },
        })
      } else {
        // Content/metadata update
        queue.enqueue({
          type: 'upsert_note',
          entityId: note.id,
          payload: { ...note } as unknown as Record<string, unknown>,
        })
      }
    }
  }

  // Detect permanently deleted notes (present in prev but not in current)
  for (const [id] of prevMap) {
    if (!currentMap.has(id)) {
      queue.enqueue({
        type: 'delete_note',
        entityId: id,
        payload: { id },
      })
    }
  }
}

/**
 * Detect folder mutations by comparing current and previous folders arrays.
 * Enqueues upsert_folder for new/updated folders and delete_folder for removed folders.
 */
function detectFolderMutations(
  folders: Folder[],
  prevFolders: Folder[],
  queue: OfflineQueue
): void {
  const prevMap = new Map(prevFolders.map((f) => [f.id, f]))
  const currentMap = new Map(folders.map((f) => [f.id, f]))

  // Detect new or updated folders
  for (const folder of folders) {
    const prev = prevMap.get(folder.id)
    if (!prev) {
      // New folder
      queue.enqueue({
        type: 'upsert_folder',
        entityId: folder.id,
        payload: { ...folder } as unknown as Record<string, unknown>,
      })
    } else if (folder.updatedAt !== prev.updatedAt) {
      // Updated folder
      queue.enqueue({
        type: 'upsert_folder',
        entityId: folder.id,
        payload: { ...folder } as unknown as Record<string, unknown>,
      })
    }
  }

  // Detect deleted folders (present in prev but not in current)
  for (const [id] of prevMap) {
    if (!currentMap.has(id)) {
      queue.enqueue({
        type: 'delete_folder',
        entityId: id,
        payload: { id },
      })
    }
  }
}
