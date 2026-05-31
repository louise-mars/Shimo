import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @sentry/react before importing sentry module
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setContext: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({})),
}))

import * as Sentry from '@sentry/react'
import {
  initSentry,
  addNoteCreateBreadcrumb,
  addNoteDeleteBreadcrumb,
  addSyncTriggerBreadcrumb,
  addThemeToggleBreadcrumb,
  captureException,
  captureError,
  captureMessage,
} from '../lib/sentry'

describe('Sentry integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initSentry', () => {
    it('does not initialize when DSN is not configured', () => {
      // VITE_SENTRY_DSN is not set in test env
      initSentry()
      expect(Sentry.init).not.toHaveBeenCalled()
    })
  })

  describe('breadcrumbs', () => {
    it('adds note create breadcrumb with only noteId', () => {
      addNoteCreateBreadcrumb('note-123')
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'note',
        message: 'Note created',
        data: { noteId: 'note-123' },
        level: 'info',
      })
    })

    it('adds note soft-delete breadcrumb with only noteId', () => {
      addNoteDeleteBreadcrumb('note-456')
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'note',
        message: 'Note soft-deleted',
        data: { noteId: 'note-456', permanent: false },
        level: 'info',
      })
    })

    it('adds note permanent-delete breadcrumb', () => {
      addNoteDeleteBreadcrumb('note-789', true)
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'note',
        message: 'Note permanently deleted',
        data: { noteId: 'note-789', permanent: true },
        level: 'info',
      })
    })

    it('adds sync trigger breadcrumb', () => {
      addSyncTriggerBreadcrumb('debounce')
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'sync',
        message: 'Sync triggered',
        data: { reason: 'debounce' },
        level: 'info',
      })
    })

    it('adds theme toggle breadcrumb', () => {
      addThemeToggleBreadcrumb('dark')
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'ui',
        message: 'Theme toggled',
        data: { theme: 'dark' },
        level: 'info',
      })
    })
  })

  describe('captureException', () => {
    it('captures error without context', () => {
      const error = new Error('test error')
      captureException(error)
      expect(Sentry.captureException).toHaveBeenCalledWith(error)
    })

    it('captures error with context, scrubbing PII fields', () => {
      const error = new Error('test error')
      captureException(error, {
        noteId: 'note-123',
        noteTitle: 'My Secret Title',
        noteContent: 'Private content here',
        content: 'Also private',
        title: 'Also secret',
        action: 'save',
      })
      // Should set context without PII fields
      expect(Sentry.setContext).toHaveBeenCalledWith('error_context', {
        noteId: 'note-123',
        action: 'save',
      })
      expect(Sentry.captureException).toHaveBeenCalledWith(error)
    })
  })

  describe('captureError (alias)', () => {
    it('is an alias for captureException', () => {
      const error = new Error('alias test')
      captureError(error, { boundary: 'panel' })
      expect(Sentry.setContext).toHaveBeenCalledWith('error_context', {
        boundary: 'panel',
      })
      expect(Sentry.captureException).toHaveBeenCalledWith(error)
    })
  })

  describe('captureMessage', () => {
    it('captures a message with level', () => {
      captureMessage('Something happened', 'warning')
      expect(Sentry.captureMessage).toHaveBeenCalledWith('Something happened', 'warning')
    })

    it('defaults to info level', () => {
      captureMessage('Info message')
      expect(Sentry.captureMessage).toHaveBeenCalledWith('Info message', 'info')
    })
  })

  describe('PII scrubbing', () => {
    it('breadcrumbs never include note content or titles', () => {
      // All breadcrumb helpers only pass IDs, never content
      addNoteCreateBreadcrumb('id-only')
      const call = vi.mocked(Sentry.addBreadcrumb).mock.calls[0][0]
      expect(call.data).not.toHaveProperty('noteTitle')
      expect(call.data).not.toHaveProperty('noteContent')
      expect(call.data).not.toHaveProperty('content')
      expect(call.data).not.toHaveProperty('title')
    })
  })
})
