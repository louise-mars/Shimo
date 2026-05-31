/**
 * Tests for legacy sync queue migration.
 * Validates: Requirement 27.6
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { migrateLegacySyncQueue } from './legacySyncMigration'
import { OfflineQueue } from './OfflineQueue'

describe('migrateLegacySyncQueue', () => {
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value },
      removeItem: (key: string) => { delete store[key] },
      clear: () => { store = {} },
    })
  })

  it('returns { migrated: 0, skipped: 0 } when no legacy keys exist', () => {
    const result = migrateLegacySyncQueue()
    expect(result).toEqual({ migrated: 0, skipped: 0 })
  })

  it('migrates entries from shimo-offline-deletes key', () => {
    const legacyData = [
      { noteId: 'note-1', deletedAt: 1700000000000 },
      { noteId: 'note-2', deletedAt: 1700000001000 },
    ]
    localStorage.setItem('shimo-offline-deletes', JSON.stringify(legacyData))

    const queue = new OfflineQueue()
    const result = migrateLegacySyncQueue(queue)

    expect(result).toEqual({ migrated: 2, skipped: 0 })
    expect(queue.size()).toBe(2)

    const op1 = queue.dequeue()!
    expect(op1.type).toBe('delete_note')
    expect(op1.entityId).toBe('note-1')

    const op2 = queue.dequeue()!
    expect(op2.type).toBe('delete_note')
    expect(op2.entityId).toBe('note-2')
  })

  it('migrates entries from offline-delete-queue key', () => {
    const legacyData = [{ noteId: 'abc-123', deletedAt: 1700000000000 }]
    localStorage.setItem('offline-delete-queue', JSON.stringify(legacyData))

    const queue = new OfflineQueue()
    const result = migrateLegacySyncQueue(queue)

    expect(result).toEqual({ migrated: 1, skipped: 0 })
    expect(queue.size()).toBe(1)

    const op = queue.dequeue()!
    expect(op.type).toBe('delete_note')
    expect(op.entityId).toBe('abc-123')
  })

  it('migrates entries from pendingDeletes key', () => {
    const legacyData = [{ noteId: 'pending-1', deletedAt: 1700000000000 }]
    localStorage.setItem('pendingDeletes', JSON.stringify(legacyData))

    const queue = new OfflineQueue()
    const result = migrateLegacySyncQueue(queue)

    expect(result).toEqual({ migrated: 1, skipped: 0 })
    expect(queue.size()).toBe(1)
  })

  it('migrates entries from multiple legacy keys', () => {
    localStorage.setItem('shimo-offline-deletes', JSON.stringify([{ noteId: 'a' }]))
    localStorage.setItem('offline-delete-queue', JSON.stringify([{ noteId: 'b' }]))
    localStorage.setItem('pendingDeletes', JSON.stringify([{ noteId: 'c' }]))

    const queue = new OfflineQueue()
    const result = migrateLegacySyncQueue(queue)

    expect(result).toEqual({ migrated: 3, skipped: 0 })
    expect(queue.size()).toBe(3)
  })

  it('removes legacy keys after successful migration', () => {
    localStorage.setItem('shimo-offline-deletes', JSON.stringify([{ noteId: 'x' }]))
    localStorage.setItem('offline-delete-queue', JSON.stringify([{ noteId: 'y' }]))

    migrateLegacySyncQueue()

    expect(localStorage.getItem('shimo-offline-deletes')).toBeNull()
    expect(localStorage.getItem('offline-delete-queue')).toBeNull()
  })

  it('skips entries without a valid entity ID', () => {
    const legacyData = [
      { noteId: 'valid-1' },
      { unknownField: 'no-id' },
      { noteId: '' },
      { noteId: 'valid-2' },
    ]
    localStorage.setItem('shimo-offline-deletes', JSON.stringify(legacyData))

    const queue = new OfflineQueue()
    const result = migrateLegacySyncQueue(queue)

    expect(result).toEqual({ migrated: 2, skipped: 2 })
    expect(queue.size()).toBe(2)
  })

  it('skips keys with invalid JSON and removes them', () => {
    localStorage.setItem('shimo-offline-deletes', 'not valid json{{{')

    const queue = new OfflineQueue()
    const result = migrateLegacySyncQueue(queue)

    expect(result).toEqual({ migrated: 0, skipped: 1 })
    expect(queue.size()).toBe(0)
    expect(localStorage.getItem('shimo-offline-deletes')).toBeNull()
  })

  it('skips keys with non-array JSON and removes them', () => {
    localStorage.setItem('shimo-offline-deletes', JSON.stringify({ noteId: 'x' }))

    const queue = new OfflineQueue()
    const result = migrateLegacySyncQueue(queue)

    expect(result).toEqual({ migrated: 0, skipped: 1 })
    expect(localStorage.getItem('shimo-offline-deletes')).toBeNull()
  })

  it('supports entityId field as alternative to noteId', () => {
    const legacyData = [{ entityId: 'entity-1', deletedAt: 1700000000000 }]
    localStorage.setItem('shimo-offline-deletes', JSON.stringify(legacyData))

    const queue = new OfflineQueue()
    const result = migrateLegacySyncQueue(queue)

    expect(result).toEqual({ migrated: 1, skipped: 0 })
    const op = queue.dequeue()!
    expect(op.entityId).toBe('entity-1')
  })

  it('supports id field as alternative to noteId', () => {
    const legacyData = [{ id: 'id-1', timestamp: 1700000000000 }]
    localStorage.setItem('shimo-offline-deletes', JSON.stringify(legacyData))

    const queue = new OfflineQueue()
    const result = migrateLegacySyncQueue(queue)

    expect(result).toEqual({ migrated: 1, skipped: 0 })
    const op = queue.dequeue()!
    expect(op.entityId).toBe('id-1')
  })

  it('is idempotent — running twice with no legacy data returns zeros', () => {
    localStorage.setItem('shimo-offline-deletes', JSON.stringify([{ noteId: 'x' }]))

    const queue = new OfflineQueue()
    const result1 = migrateLegacySyncQueue(queue)
    expect(result1).toEqual({ migrated: 1, skipped: 0 })

    // Second run — key was removed, so nothing to migrate
    const result2 = migrateLegacySyncQueue(queue)
    expect(result2).toEqual({ migrated: 0, skipped: 0 })
  })

  it('deduplicates entries with same noteId via OfflineQueue dedup', () => {
    // Two entries for the same noteId — OfflineQueue dedup should keep only the latest
    const legacyData = [
      { noteId: 'dup-note', deletedAt: 1700000000000 },
      { noteId: 'dup-note', deletedAt: 1700000001000 },
    ]
    localStorage.setItem('shimo-offline-deletes', JSON.stringify(legacyData))

    const queue = new OfflineQueue()
    const result = migrateLegacySyncQueue(queue)

    // Both are "migrated" from the legacy perspective
    expect(result.migrated).toBe(2)
    // But OfflineQueue dedup means only 1 remains in the queue
    expect(queue.size()).toBe(1)
  })

  it('preserves deletedAt in payload when available', () => {
    const legacyData = [{ noteId: 'note-ts', deletedAt: 1700000005000 }]
    localStorage.setItem('shimo-offline-deletes', JSON.stringify(legacyData))

    const queue = new OfflineQueue()
    migrateLegacySyncQueue(queue)

    const op = queue.dequeue()!
    expect(op.payload).toEqual({ deletedAt: 1700000005000 })
  })

  it('handles entries without deletedAt gracefully', () => {
    const legacyData = [{ noteId: 'no-timestamp' }]
    localStorage.setItem('shimo-offline-deletes', JSON.stringify(legacyData))

    const queue = new OfflineQueue()
    migrateLegacySyncQueue(queue)

    const op = queue.dequeue()!
    expect(op.entityId).toBe('no-timestamp')
    expect(op.type).toBe('delete_note')
  })
})
