/**
 * History Wiring — Connects editor saves to NoteHistory snapshots.
 *
 * This module subscribes to the Zustand store and:
 * 1. When a note's content changes (via updateNote), calls createSnapshot()
 *    which internally enforces the 5-minute interval and content-change check.
 * 2. When a note is permanently deleted, calls clearSnapshots() to remove
 *    all associated history snapshots.
 *
 * Requirements: 4.1, 4.5
 */

import type { AppStore } from '../store/types'
import type { Note } from '../../types'
import { createSnapshot, clearSnapshots } from '../noteHistory/noteHistory'

type StoreApi = {
  getState: () => AppStore
  subscribe: {
    (listener: (state: AppStore, prevState: AppStore) => void): () => void
    <T>(
      selector: (state: AppStore) => T,
      listener: (curr: T, prev: T) => void,
      options?: { equalityFn?: (a: T, b: T) => boolean; fireImmediately?: boolean }
    ): () => void
  }
}

/** Tracks previous notes array for detecting permanent deletes */
let previousNoteIds: Set<string> = new Set()

/** Tracks previous content per note for detecting content changes */
let previousContentMap: Map<string, string> = new Map()

/**
 * Set up history wiring by subscribing to the store.
 *
 * - Listens for note content changes and triggers snapshot creation
 * - Listens for permanent deletes and triggers snapshot cleanup
 *
 * @param store - The Zustand store instance (with subscribeWithSelector)
 * @returns An unsubscribe function to tear down all subscriptions
 */
export function setupHistoryWiring(store: StoreApi): () => void {
  // Initialize tracking state from current store
  const initialState = store.getState()
  previousNoteIds = new Set(initialState.notes.map((n) => n.id))
  previousContentMap = new Map(
    initialState.notes.map((n) => [n.id, n.content])
  )

  // Subscribe to the notes array for both content changes and deletions
  const unsubscribe = store.subscribe(
    (state: AppStore) => state.notes,
    (currentNotes: Note[], prevNotes: Note[]) => {
      handleContentChanges(currentNotes, prevNotes)
      handlePermanentDeletes(currentNotes)
    }
  )

  return () => {
    unsubscribe()
    previousNoteIds.clear()
    previousContentMap.clear()
  }
}

/**
 * Detect notes whose content has changed and trigger snapshot creation.
 * createSnapshot internally enforces the 5-min interval and content-change check.
 */
function handleContentChanges(currentNotes: Note[], prevNotes: Note[]): void {
  for (const note of currentNotes) {
    // Skip deleted notes
    if (note.deletedAt !== null) continue

    const prevContent = previousContentMap.get(note.id)

    // Content changed (and note existed before with different content)
    if (prevContent !== undefined && prevContent !== note.content) {
      // Fire and forget — createSnapshot handles interval/change checks internally
      createSnapshot(note.id, note.content, note.title)
    }

    // Update tracking map
    previousContentMap.set(note.id, note.content)
  }

  // Add new notes to tracking
  for (const note of currentNotes) {
    if (!previousContentMap.has(note.id)) {
      previousContentMap.set(note.id, note.content)
    }
  }
}

/**
 * Detect permanently deleted notes (removed from the array) and clear their snapshots.
 */
function handlePermanentDeletes(currentNotes: Note[]): void {
  const currentIds = new Set(currentNotes.map((n) => n.id))

  // Find notes that were in the previous set but are no longer present
  for (const prevId of previousNoteIds) {
    if (!currentIds.has(prevId)) {
      // Note was permanently deleted — clear its snapshots
      clearSnapshots(prevId)
      previousContentMap.delete(prevId)
    }
  }

  // Update tracking set
  previousNoteIds = currentIds
}
