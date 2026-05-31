/**
 * 笔记版本历史 — Legacy re-export
 *
 * This file re-exports from the new noteHistory module at ./noteHistory/
 * and provides backward-compatible aliases for the old API.
 */

import type { NoteSnapshot } from '../types'
import { createSnapshot, getSnapshots, clearSnapshots, CONSTANTS } from './noteHistory/noteHistory'

export type { NoteSnapshot }

// New API (canonical)
export { createSnapshot, getSnapshots, clearSnapshots, CONSTANTS }

// Legacy aliases for backward compatibility
export const getHistory = getSnapshots
export const clearHistory = clearSnapshots

/**
 * Legacy alias for createSnapshot.
 * The new API computes wordCount internally from content.
 */
export async function maybeSnapshot(
  noteId: string,
  title: string,
  content: string,
  _wordCount?: number,
): Promise<boolean> {
  return createSnapshot(noteId, content, title)
}

/**
 * Force-create a snapshot bypassing interval and content-change checks.
 * Note: The new module doesn't expose this directly, so we keep it here
 * for backward compatibility by directly manipulating storage.
 */
export async function forceSnapshot(
  noteId: string,
  title: string,
  content: string,
  wordCount: number,
): Promise<void> {
  const { idbGet, idbSet } = await import('./storage/indexedDB')
  const key = CONSTANTS.SNAPSHOTS_KEY_PREFIX + noteId
  const snapshots = (await idbGet<NoteSnapshot[]>(key)) ?? []
  const snapshot: NoteSnapshot = {
    noteId,
    createdAt: Date.now(),
    title,
    content,
    wordCount,
  }
  const updated = [snapshot, ...snapshots].slice(0, CONSTANTS.MAX_SNAPSHOTS_PER_NOTE)
  await idbSet(key, updated)
}
