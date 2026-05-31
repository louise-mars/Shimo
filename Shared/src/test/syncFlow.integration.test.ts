/**
 * Integration tests for the sync flow.
 *
 * Tests the full sync cycle end-to-end using a mocked ISyncTransport:
 * 1. Full sync cycle: Idle → Pull → Merge → Push → ProcessQueue → Synced
 * 2. Real-time subscription handling
 * 3. Conflict detection and copy creation (LWW + conflict copy)
 * 4. Offline queue drain
 *
 * Validates: Requirements 10.1, 10.4, 10.5, 10.9
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Note, Folder } from '../types'
import type { ISyncTransport } from '../lib/sync/SyncTransport'
import type { ISyncEngineStore } from '../lib/sync/SyncEngine'
import { SyncEngine } from '../lib/sync/SyncEngine'
import { LWWConflictResolver } from '../lib/sync/ConflictResolver'
import { OfflineQueue } from '../lib/sync/OfflineQueue'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: crypto.randomUUID(),
    title: 'Test Note',
    content: '{"type":"doc","content":[]}',
    tags: [],
    folderId: null,
    pinned: false,
    favorited: false,
    locked: false,
    hidden: false,
    deletedAt: null,
    createdAt: Date.now() - 10000,
    updatedAt: Date.now(),
    ...overrides,
  }
}

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: crypto.randomUUID(),
    name: 'Test Folder',
    emoji: '📁',
    parentId: null,
    order: 0,
    createdAt: Date.now() - 10000,
    updatedAt: Date.now(),
    ...overrides,
  }
}

function createMockTransport(overrides: Partial<ISyncTransport> = {}): ISyncTransport {
  return {
    pullNotes: vi.fn().mockResolvedValue([]),
    pullFolders: vi.fn().mockResolvedValue([]),
    pushNotes: vi.fn().mockResolvedValue(undefined),
    pushFolders: vi.fn().mockResolvedValue(undefined),
    deleteNote: vi.fn().mockResolvedValue(undefined),
    deleteFolder: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue(() => {}),
    updateSyncMeta: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function createMockStore(overrides: Partial<ISyncEngineStore> = {}): ISyncEngineStore {
  return {
    notes: [],
    folders: [],
    lastSyncAt: null,
    mergeRemoteNotes: vi.fn(),
    mergeRemoteFolders: vi.fn(),
    setSyncStatus: vi.fn(),
    setSyncError: vi.fn(),
    ...overrides,
  }
}

// ─── Mock localStorage for OfflineQueue ──────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Sync Flow Integration', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('Full sync cycle: pull → merge → push → queue drain', () => {
    it('should transition through all states during a successful sync', async () => {
      const remoteNote = makeNote({ title: 'Remote Note' })
      const remoteFolder = makeFolder({ name: 'Remote Folder' })

      const transport = createMockTransport({
        pullNotes: vi.fn().mockResolvedValue([remoteNote]),
        pullFolders: vi.fn().mockResolvedValue([remoteFolder]),
      })

      const store = createMockStore()
      const resolver = new LWWConflictResolver()
      const queue = new OfflineQueue()

      const engine = new SyncEngine(transport, resolver, queue, store, {
        backoffBaseMs: 100,
        backoffMultiplier: 2,
        maxBackoffMs: 1000,
        maxRetries: 3,
        debounceMs: 100,
      })

      // Track state transitions
      const states: string[] = []
      engine.onStateChange((state) => states.push(state))

      // Start the engine (triggers initial sync)
      engine.start('user-1')

      // Wait for the sync cycle to complete
      await vi.waitFor(() => {
        expect(engine.getState()).toBe('Idle')
        expect(states).toContain('Synced')
      })

      // Verify state transitions occurred in order
      expect(states).toContain('Syncing')
      expect(states).toContain('PullPhase')
      expect(states).toContain('MergePhase')
      expect(states).toContain('PushPhase')
      expect(states).toContain('ProcessQueue')
      expect(states).toContain('Synced')

      // Verify the order: Syncing → PullPhase → MergePhase → PushPhase → ProcessQueue → Synced
      const syncingIdx = states.indexOf('Syncing')
      const pullIdx = states.indexOf('PullPhase')
      const mergeIdx = states.indexOf('MergePhase')
      const pushIdx = states.indexOf('PushPhase')
      const processIdx = states.indexOf('ProcessQueue')
      const syncedIdx = states.indexOf('Synced')

      expect(syncingIdx).toBeLessThan(pullIdx)
      expect(pullIdx).toBeLessThan(mergeIdx)
      expect(mergeIdx).toBeLessThan(pushIdx)
      expect(pushIdx).toBeLessThan(processIdx)
      expect(processIdx).toBeLessThan(syncedIdx)

      // Verify transport was called correctly
      expect(transport.pullNotes).toHaveBeenCalledWith('user-1', 0)
      expect(transport.pullFolders).toHaveBeenCalledWith('user-1')

      // Verify remote data was merged into store
      expect(store.mergeRemoteNotes).toHaveBeenCalledWith([remoteNote])
      expect(store.mergeRemoteFolders).toHaveBeenCalledWith([remoteFolder])

      engine.stop()
    })

    it('should push local notes updated since last sync', async () => {
      const localNote = makeNote({ title: 'Local Note', updatedAt: Date.now() })

      const transport = createMockTransport()
      const store = createMockStore({
        notes: [localNote],
        lastSyncAt: Date.now() - 60000, // last sync was 60s ago
      })
      const resolver = new LWWConflictResolver()
      const queue = new OfflineQueue()

      const engine = new SyncEngine(transport, resolver, queue, store, {
        backoffBaseMs: 100,
        backoffMultiplier: 2,
        maxBackoffMs: 1000,
        maxRetries: 3,
        debounceMs: 100,
      })

      engine.start('user-1')

      await vi.waitFor(() => {
        expect(engine.getState()).toBe('Idle')
      })

      // Verify local notes were pushed
      expect(transport.pushNotes).toHaveBeenCalledWith([localNote], 'user-1')

      engine.stop()
    })
  })

  describe('Real-time subscription handling', () => {
    it('should subscribe to real-time changes on start', () => {
      const transport = createMockTransport()
      const store = createMockStore()
      const resolver = new LWWConflictResolver()
      const queue = new OfflineQueue()

      const engine = new SyncEngine(transport, resolver, queue, store, {
        backoffBaseMs: 100,
        backoffMultiplier: 2,
        maxBackoffMs: 1000,
        maxRetries: 3,
        debounceMs: 100,
      })

      engine.start('user-1')

      expect(transport.subscribe).toHaveBeenCalledWith(
        'user-1',
        expect.any(Function),
        expect.any(Function)
      )

      engine.stop()
    })

    it('should merge incoming note changes via real-time subscription', async () => {
      const incomingNote = makeNote({ title: 'Incoming Note' })

      let onNoteChangeCallback: ((note: Note) => void) | null = null

      const transport = createMockTransport({
        subscribe: vi.fn((userId, onNoteChange, _onNoteDelete) => {
          onNoteChangeCallback = onNoteChange
          return () => {}
        }),
      })

      const store = createMockStore()
      const resolver = new LWWConflictResolver()
      const queue = new OfflineQueue()

      const engine = new SyncEngine(transport, resolver, queue, store, {
        backoffBaseMs: 100,
        backoffMultiplier: 2,
        maxBackoffMs: 1000,
        maxRetries: 3,
        debounceMs: 100,
      })

      engine.start('user-1')

      // Wait for initial sync to complete
      await vi.waitFor(() => {
        expect(engine.getState()).toBe('Idle')
      })

      // Simulate an incoming real-time note change
      expect(onNoteChangeCallback).not.toBeNull()
      onNoteChangeCallback!(incomingNote)

      // Verify the note was merged into the store
      expect(store.mergeRemoteNotes).toHaveBeenCalledWith([incomingNote])

      engine.stop()
    })

    it('should buffer real-time updates for actively edited notes', async () => {
      const editedNoteId = 'note-being-edited'
      const incomingNote = makeNote({ id: editedNoteId, title: 'Updated remotely' })

      let onNoteChangeCallback: ((note: Note) => void) | null = null

      const transport = createMockTransport({
        subscribe: vi.fn((_userId, onNoteChange, _onNoteDelete) => {
          onNoteChangeCallback = onNoteChange
          return () => {}
        }),
      })

      const store = createMockStore()
      const resolver = new LWWConflictResolver()
      const queue = new OfflineQueue()

      const engine = new SyncEngine(transport, resolver, queue, store, {
        backoffBaseMs: 100,
        backoffMultiplier: 2,
        maxBackoffMs: 1000,
        maxRetries: 3,
        debounceMs: 100,
      })

      engine.start('user-1')

      // Wait for initial sync to complete
      await vi.waitFor(() => {
        expect(engine.getState()).toBe('Idle')
      })

      // Clear any mergeRemoteNotes calls from initial sync
      vi.mocked(store.mergeRemoteNotes).mockClear()

      // Mark note as actively being edited
      engine.setActivelyEditing(editedNoteId)

      // Simulate incoming change for the edited note
      onNoteChangeCallback!(incomingNote)

      // Should NOT be merged immediately (buffered)
      expect(store.mergeRemoteNotes).not.toHaveBeenCalled()
      expect(engine.getPendingUpdateCount()).toBe(1)

      // Stop editing and flush
      engine.setActivelyEditing(null)
      engine.flushPendingUpdates()

      // Now it should be merged
      expect(store.mergeRemoteNotes).toHaveBeenCalledWith([incomingNote])
      expect(engine.getPendingUpdateCount()).toBe(0)

      engine.stop()
    })
  })

  describe('Conflict detection and copy creation', () => {
    it('should detect conflict when both local and remote have different content and timestamps', async () => {
      const noteId = 'conflict-note-id'
      const baseTime = Date.now() - 60000

      const localNote = makeNote({
        id: noteId,
        title: 'My Note',
        content: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"local edit"}]}]}',
        updatedAt: baseTime + 30000, // local edited 30s after base
        pinned: true,
        favorited: true,
      })

      const remoteNote = makeNote({
        id: noteId,
        title: 'My Note',
        content: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"remote edit"}]}]}',
        updatedAt: baseTime + 40000, // remote edited 40s after base (remote wins)
      })

      const transport = createMockTransport({
        pullNotes: vi.fn().mockResolvedValue([remoteNote]),
      })

      const store = createMockStore({
        notes: [localNote],
        lastSyncAt: baseTime,
      })

      const resolver = new LWWConflictResolver()
      const queue = new OfflineQueue()

      const engine = new SyncEngine(transport, resolver, queue, store, {
        backoffBaseMs: 100,
        backoffMultiplier: 2,
        maxBackoffMs: 1000,
        maxRetries: 3,
        debounceMs: 100,
      })

      // Start the engine and wait for sync to complete
      engine.start('user-1')

      let result: Awaited<ReturnType<typeof engine.triggerSync>> = null
      await vi.waitFor(() => {
        expect(engine.getState()).toBe('Idle')
      })

      // The initial sync already ran. Let's check what was merged.
      // The mergeRemoteNotes call should contain both winner and conflict copy
      const mergeCall = vi.mocked(store.mergeRemoteNotes).mock.calls[0]
      expect(mergeCall).toBeDefined()
      const mergedNotes = mergeCall[0] as Note[]

      // Should have merged both the winner and the conflict copy
      expect(mergedNotes.length).toBe(2)

      const winner = mergedNotes.find((n) => n.id === noteId)!
      const conflictCopy = mergedNotes.find((n) => n.id !== noteId)!

      // Remote wins (higher updatedAt), but preserves local pin/favorite
      expect(winner.content).toBe(remoteNote.content)
      expect(winner.pinned).toBe(true)
      expect(winner.favorited).toBe(true)

      // Conflict copy should be created from the loser (local)
      expect(conflictCopy).toBeDefined()
      expect(conflictCopy.content).toBe(localNote.content)
      expect(conflictCopy.conflictSourceId).toBe(noteId)

      // Conflict copy title format: {title}_冲突副本_{YYYYMMDD}
      const today = new Date()
      const year = today.getFullYear()
      const month = String(today.getMonth() + 1).padStart(2, '0')
      const day = String(today.getDate()).padStart(2, '0')
      const expectedTitleSuffix = `_冲突副本_${year}${month}${day}`
      expect(conflictCopy.title).toContain(expectedTitleSuffix)
      expect(conflictCopy.title).toContain('My Note')

      engine.stop()
    })

    it('should not create conflict copy when only timestamps differ (same content)', async () => {
      const noteId = 'no-conflict-note'
      const baseTime = Date.now() - 60000
      const sharedContent = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"same content"}]}]}'

      const localNote = makeNote({
        id: noteId,
        title: 'Same Note',
        content: sharedContent,
        updatedAt: baseTime + 10000, // local has older timestamp
      })

      const remoteNote = makeNote({
        id: noteId,
        title: 'Same Note',
        content: sharedContent, // same content as local
        updatedAt: baseTime + 20000, // remote has newer timestamp (metadata-only change)
      })

      const transport = createMockTransport({
        pullNotes: vi.fn().mockResolvedValue([remoteNote]),
      })

      const store = createMockStore({
        notes: [localNote],
        lastSyncAt: baseTime - 1000,
      })

      const resolver = new LWWConflictResolver()
      const queue = new OfflineQueue()

      const engine = new SyncEngine(transport, resolver, queue, store, {
        backoffBaseMs: 100,
        backoffMultiplier: 2,
        maxBackoffMs: 1000,
        maxRetries: 3,
        debounceMs: 100,
      })

      engine.start('user-1')

      await vi.waitFor(() => {
        expect(engine.getState()).toBe('Idle')
      })

      // mergeRemoteNotes should have been called with just the winner (no conflict copy)
      const mergeCall = vi.mocked(store.mergeRemoteNotes).mock.calls[0]
      expect(mergeCall).toBeDefined()
      const mergedNotes = mergeCall[0] as Note[]

      // Only the winner should be merged (no conflict copy since content is the same)
      expect(mergedNotes.length).toBe(1)
      expect(mergedNotes[0].id).toBe(noteId)

      engine.stop()
    })

    it('should use correct conflict title format with 无标题 for untitled notes', async () => {
      const noteId = 'untitled-conflict'
      const baseTime = Date.now() - 60000

      const localNote = makeNote({
        id: noteId,
        title: '', // untitled
        content: '{"local":"content"}',
        updatedAt: baseTime + 50000, // local wins
      })

      const remoteNote = makeNote({
        id: noteId,
        title: '', // untitled
        content: '{"remote":"content"}',
        updatedAt: baseTime + 30000,
      })

      const transport = createMockTransport({
        pullNotes: vi.fn().mockResolvedValue([remoteNote]),
      })

      const store = createMockStore({
        notes: [localNote],
        lastSyncAt: baseTime,
      })

      const resolver = new LWWConflictResolver()
      const queue = new OfflineQueue()

      const engine = new SyncEngine(transport, resolver, queue, store, {
        backoffBaseMs: 100,
        backoffMultiplier: 2,
        maxBackoffMs: 1000,
        maxRetries: 3,
        debounceMs: 100,
      })

      engine.start('user-1')

      await vi.waitFor(() => {
        expect(engine.getState()).toBe('Idle')
      })

      const mergeCall = vi.mocked(store.mergeRemoteNotes).mock.calls[0]
      expect(mergeCall).toBeDefined()
      const mergedNotes = mergeCall[0] as Note[]

      // Should have both winner and conflict copy
      expect(mergedNotes.length).toBe(2)

      const conflictCopy = mergedNotes.find((n) => n.id !== noteId)!
      expect(conflictCopy).toBeDefined()
      // Untitled notes should use '无标题' in the conflict copy title
      expect(conflictCopy.title).toMatch(/^无标题_冲突副本_\d{8}$/)

      engine.stop()
    })
  })

  describe('Offline queue drain', () => {
    it('should drain all queued operations during sync', async () => {
      const transport = createMockTransport()
      const store = createMockStore()
      const resolver = new LWWConflictResolver()
      const queue = new OfflineQueue()

      // Enqueue operations while "offline"
      const noteToUpsert = makeNote({ title: 'Queued Note' })
      queue.enqueue({
        type: 'upsert_note',
        entityId: noteToUpsert.id,
        payload: { ...noteToUpsert } as unknown as Record<string, unknown>,
      })

      queue.enqueue({
        type: 'delete_note',
        entityId: 'deleted-note-id',
        payload: { id: 'deleted-note-id' },
      })

      queue.enqueue({
        type: 'upsert_folder',
        entityId: 'folder-1',
        payload: { id: 'folder-1', name: 'New Folder' } as unknown as Record<string, unknown>,
      })

      expect(queue.size()).toBe(3)

      const engine = new SyncEngine(transport, resolver, queue, store, {
        backoffBaseMs: 100,
        backoffMultiplier: 2,
        maxBackoffMs: 1000,
        maxRetries: 3,
        debounceMs: 100,
      })

      engine.start('user-1')

      // Wait for sync to complete
      await vi.waitFor(() => {
        expect(engine.getState()).toBe('Idle')
      })

      // Verify all queued operations were processed via transport
      expect(transport.pushNotes).toHaveBeenCalled()
      expect(transport.deleteNote).toHaveBeenCalledWith('deleted-note-id', 'user-1')
      expect(transport.pushFolders).toHaveBeenCalled()

      // Queue should be drained
      expect(queue.size()).toBe(0)

      engine.stop()
    })

    it('should retain failed operations in queue for retry', async () => {
      const transport = createMockTransport({
        deleteNote: vi.fn().mockRejectedValue(new Error('Network error')),
      })
      const store = createMockStore()
      const resolver = new LWWConflictResolver()
      const queue = new OfflineQueue()

      // Enqueue a delete operation that will fail
      queue.enqueue({
        type: 'delete_note',
        entityId: 'fail-note-id',
        payload: { id: 'fail-note-id' },
      })

      expect(queue.size()).toBe(1)

      const engine = new SyncEngine(transport, resolver, queue, store, {
        backoffBaseMs: 100,
        backoffMultiplier: 2,
        maxBackoffMs: 1000,
        maxRetries: 3,
        debounceMs: 100,
      })

      engine.start('user-1')

      // Wait for sync to complete
      await vi.waitFor(() => {
        expect(engine.getState()).toBe('Idle')
      })

      // The failed operation should remain in the queue with incremented retryCount
      expect(queue.size()).toBe(1)

      engine.stop()
    })

    it('should process deduped operations correctly', async () => {
      const transport = createMockTransport()
      const store = createMockStore()
      const resolver = new LWWConflictResolver()
      const queue = new OfflineQueue()

      // Enqueue multiple updates for the same note (should dedup)
      const noteId = 'dedup-note-id'
      queue.enqueue({
        type: 'upsert_note',
        entityId: noteId,
        payload: { id: noteId, title: 'Version 1' } as unknown as Record<string, unknown>,
      })
      queue.enqueue({
        type: 'upsert_note',
        entityId: noteId,
        payload: { id: noteId, title: 'Version 2' } as unknown as Record<string, unknown>,
      })
      queue.enqueue({
        type: 'upsert_note',
        entityId: noteId,
        payload: { id: noteId, title: 'Version 3' } as unknown as Record<string, unknown>,
      })

      // Dedup should keep only the latest version
      expect(queue.size()).toBe(1)

      const engine = new SyncEngine(transport, resolver, queue, store, {
        backoffBaseMs: 100,
        backoffMultiplier: 2,
        maxBackoffMs: 1000,
        maxRetries: 3,
        debounceMs: 100,
      })

      engine.start('user-1')

      await vi.waitFor(() => {
        expect(engine.getState()).toBe('Idle')
      })

      // Only one push should have happened for this note
      expect(queue.size()).toBe(0)

      engine.stop()
    })
  })
})
