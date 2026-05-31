/**
 * Trash Auto-Cleanup Module
 *
 * Automatically purges soft-deleted notes older than 30 days.
 * - On startup: immediately cleans expired notes
 * - Periodic: checks every 24 hours for newly expired notes
 *
 * Requirements: 9.5, 9.6
 */

import { appStore } from '../store/createStore'

/** 30 days in milliseconds */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

/** 24 hours in milliseconds */
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

let cleanupInterval: ReturnType<typeof setInterval> | null = null

/**
 * Find and permanently delete all notes whose deletedAt timestamp
 * is older than 30 days from the current time.
 *
 * @returns The number of notes permanently deleted.
 */
export function cleanupExpiredTrash(): number {
  const now = Date.now()
  const state = appStore.getState()
  const expiredNotes = state.notes.filter(
    (n) => n.deletedAt !== null && now - n.deletedAt >= THIRTY_DAYS_MS
  )

  for (const note of expiredNotes) {
    state.permanentDelete(note.id)
  }

  return expiredNotes.length
}

/**
 * Start the trash auto-cleanup scheduler.
 * Performs an immediate cleanup on startup, then sets a 24-hour interval.
 *
 * Safe to call multiple times — will not create duplicate intervals.
 */
export function startTrashCleanup(): void {
  // Prevent duplicate intervals
  if (cleanupInterval !== null) {
    return
  }

  // Immediate cleanup on startup
  cleanupExpiredTrash()

  // Schedule periodic cleanup every 24 hours
  cleanupInterval = setInterval(cleanupExpiredTrash, TWENTY_FOUR_HOURS_MS)
}

/**
 * Stop the trash auto-cleanup scheduler.
 * Clears the periodic interval. Safe to call even if not started.
 */
export function stopTrashCleanup(): void {
  if (cleanupInterval !== null) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
  }
}
