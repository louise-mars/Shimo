/**
 * Unit tests for trash auto-cleanup module.
 * Validates Requirements 9.5 and 9.6:
 * - 9.5: On startup, permanently delete notes with deletedAt > 30 days
 * - 9.6: Periodic 24-hour check for expired trash
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { appStore } from '../store/createStore'
import { cleanupExpiredTrash, startTrashCleanup, stopTrashCleanup } from './trashCleanup'
import type { Note } from '../../types'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: crypto.randomUUID(),
    title: 'Test Note',
    content: '',
    tags: [],
    folderId: null,
    pinned: false,
    favorited: false,
    locked: false,
    hidden: false,
    deletedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe('trashCleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Reset store to empty state
    appStore.setState({ notes: [], activeNoteId: null })
  })

  afterEach(() => {
    stopTrashCleanup()
    vi.useRealTimers()
  })

  describe('cleanupExpiredTrash', () => {
    it('should permanently delete notes with deletedAt older than 30 days', () => {
      const now = Date.now()
      const expiredNote = makeNote({
        deletedAt: now - THIRTY_DAYS_MS - 1000, // 30 days + 1 second ago
      })
      const recentlyDeletedNote = makeNote({
        deletedAt: now - 1000, // 1 second ago
      })
      const activeNote = makeNote({ deletedAt: null })

      appStore.setState({ notes: [expiredNote, recentlyDeletedNote, activeNote] })

      const count = cleanupExpiredTrash()

      expect(count).toBe(1)
      const remaining = appStore.getState().notes
      expect(remaining).toHaveLength(2)
      expect(remaining.find((n) => n.id === expiredNote.id)).toBeUndefined()
      expect(remaining.find((n) => n.id === recentlyDeletedNote.id)).toBeDefined()
      expect(remaining.find((n) => n.id === activeNote.id)).toBeDefined()
    })

    it('should delete notes exactly at the 30-day boundary', () => {
      const now = Date.now()
      const exactlyExpiredNote = makeNote({
        deletedAt: now - THIRTY_DAYS_MS, // exactly 30 days ago
      })

      appStore.setState({ notes: [exactlyExpiredNote] })

      const count = cleanupExpiredTrash()

      expect(count).toBe(1)
      expect(appStore.getState().notes).toHaveLength(0)
    })

    it('should not delete notes just under 30 days old', () => {
      const now = Date.now()
      const almostExpiredNote = makeNote({
        deletedAt: now - THIRTY_DAYS_MS + 1000, // 30 days minus 1 second
      })

      appStore.setState({ notes: [almostExpiredNote] })

      const count = cleanupExpiredTrash()

      expect(count).toBe(0)
      expect(appStore.getState().notes).toHaveLength(1)
    })

    it('should return 0 when no notes are expired', () => {
      const activeNote = makeNote({ deletedAt: null })
      appStore.setState({ notes: [activeNote] })

      const count = cleanupExpiredTrash()

      expect(count).toBe(0)
      expect(appStore.getState().notes).toHaveLength(1)
    })

    it('should handle empty notes array', () => {
      appStore.setState({ notes: [] })

      const count = cleanupExpiredTrash()

      expect(count).toBe(0)
    })

    it('should delete multiple expired notes', () => {
      const now = Date.now()
      const expired1 = makeNote({ deletedAt: now - THIRTY_DAYS_MS - 86400000 })
      const expired2 = makeNote({ deletedAt: now - THIRTY_DAYS_MS - 172800000 })
      const active = makeNote({ deletedAt: null })

      appStore.setState({ notes: [expired1, expired2, active] })

      const count = cleanupExpiredTrash()

      expect(count).toBe(2)
      expect(appStore.getState().notes).toHaveLength(1)
      expect(appStore.getState().notes[0].id).toBe(active.id)
    })
  })

  describe('startTrashCleanup', () => {
    it('should perform immediate cleanup on start', () => {
      const now = Date.now()
      const expiredNote = makeNote({ deletedAt: now - THIRTY_DAYS_MS - 1000 })
      appStore.setState({ notes: [expiredNote] })

      startTrashCleanup()

      expect(appStore.getState().notes).toHaveLength(0)
    })

    it('should set up a 24-hour periodic interval', () => {
      const now = Date.now()
      appStore.setState({ notes: [] })

      startTrashCleanup()

      // Add an expired note after startup
      const expiredNote = makeNote({ deletedAt: now - THIRTY_DAYS_MS - 1000 })
      appStore.setState({ notes: [expiredNote] })

      // Advance time by 24 hours
      vi.advanceTimersByTime(24 * 60 * 60 * 1000)

      expect(appStore.getState().notes).toHaveLength(0)
    })

    it('should not create duplicate intervals when called multiple times', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval')

      startTrashCleanup()
      startTrashCleanup()
      startTrashCleanup()

      // Only one interval should be created
      expect(setIntervalSpy).toHaveBeenCalledTimes(1)

      setIntervalSpy.mockRestore()
    })
  })

  describe('stopTrashCleanup', () => {
    it('should stop the periodic interval', () => {
      const now = Date.now()
      appStore.setState({ notes: [] })

      startTrashCleanup()
      stopTrashCleanup()

      // Add an expired note after stopping
      const expiredNote = makeNote({ deletedAt: now - THIRTY_DAYS_MS - 1000 })
      appStore.setState({ notes: [expiredNote] })

      // Advance time by 24 hours — should NOT clean up
      vi.advanceTimersByTime(24 * 60 * 60 * 1000)

      expect(appStore.getState().notes).toHaveLength(1)
    })

    it('should be safe to call when not started', () => {
      expect(() => stopTrashCleanup()).not.toThrow()
    })

    it('should allow restarting after stop', () => {
      const now = Date.now()
      const expiredNote = makeNote({ deletedAt: now - THIRTY_DAYS_MS - 1000 })

      startTrashCleanup()
      stopTrashCleanup()

      // Add expired note and restart
      appStore.setState({ notes: [expiredNote] })
      startTrashCleanup()

      // Immediate cleanup on restart should remove it
      expect(appStore.getState().notes).toHaveLength(0)
    })
  })
})
