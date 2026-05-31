import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { subscribeWithSelector } from 'zustand/middleware'
import { setupPersistence, setupSyncWiring } from './persistence'
import type { AppStore } from '../store/types'
import type { Note, Folder } from '../../types'

// Mock the IndexedDB storage module
vi.mock('../storage/indexedDB', () => ({
  debouncedPersist: vi.fn(),
}))

import { debouncedPersist } from '../storage/indexedDB'

const mockedDebouncedPersist = vi.mocked(debouncedPersist)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    title: 'Test Note',
    content: '{"type":"doc","content":[]}',
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

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    name: 'Test Folder',
    emoji: '📁',
    parentId: null,
    order: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

function createTestStore(initialNotes: Note[] = [], initialFolders: Folder[] = []) {
  return create<AppStore>()(
    subscribeWithSelector(
      immer((set) => ({
        // NoteSlice
        notes: initialNotes,
        activeNoteId: null,
        createNote: () => '',
        updateNote: (noteId: string, updates: Partial<Note>) => {
          set((state) => {
            const note = state.notes.find((n) => n.id === noteId)
            if (!note) return
            Object.assign(note, updates)
            note.updatedAt = Date.now()
          })
        },
        deleteNote: (noteId: string) => {
          set((state) => {
            const note = state.notes.find((n) => n.id === noteId)
            if (!note) return
            note.deletedAt = Date.now()
            note.updatedAt = Date.now()
          })
        },
        restoreNote: () => {},
        permanentDelete: (noteId: string) => {
          set((state) => {
            const idx = state.notes.findIndex((n) => n.id === noteId)
            if (idx !== -1) state.notes.splice(idx, 1)
          })
        },
        emptyTrash: () => {},
        setActiveNote: () => {},
        togglePin: () => {},
        toggleFavorite: () => {},
        toggleHidden: () => {},
        toggleLocked: () => {},
        importNotes: () => {},
        renameTag: () => {},
        mergeRemoteNotes: (remote: Note[]) => {
          set((state) => {
            for (const r of remote) {
              const idx = state.notes.findIndex((n) => n.id === r.id)
              if (idx === -1) state.notes.push(r)
              else state.notes[idx] = r
            }
          })
        },

        // FolderSlice
        folders: initialFolders,
        activeFolderId: null,
        createFolder: (folder: Folder) => {
          set((state) => { state.folders.push(folder) })
        },
        updateFolder: (folderId: string, updates: Partial<Folder>) => {
          set((state) => {
            const folder = state.folders.find((f) => f.id === folderId)
            if (!folder) return
            Object.assign(folder, updates)
            folder.updatedAt = Date.now()
          })
        },
        deleteFolder: (folderId: string) => {
          set((state) => {
            const idx = state.folders.findIndex((f) => f.id === folderId)
            if (idx !== -1) state.folders.splice(idx, 1)
          })
        },
        setActiveFolder: () => {},
        reorderFolders: () => {},
        moveNoteToFolder: () => {},
        mergeRemoteFolders: () => {},

        // SyncSlice
        syncStatus: 'idle' as const,
        lastSyncAt: null,
        syncError: null,
        triggerSync: async () => {},
        setSyncStatus: () => {},
        setSyncError: () => {},

        // UISlice
        theme: 'light' as const,
        activeTag: null,
        searchQuery: '',
        sidebarVisible: true,
        noteListVisible: true,
        noteListWidth: 300,
        immersiveMode: false,
        toggleTheme: () => {
          set((state) => { state.theme = state.theme === 'light' ? 'dark' : 'light' })
        },
        setActiveTag: (tag: string | null) => {
          set((state) => { state.activeTag = tag })
        },
        setSearch: () => {},
        toggleSidebar: () => {},
        toggleNoteList: () => {},
        setNoteListWidth: () => {},
        setImmersiveMode: () => {},
      }))
    )
  )
}

function createMockOfflineQueue() {
  return {
    enqueue: vi.fn(),
    peek: vi.fn(),
    dequeue: vi.fn(),
    drain: vi.fn(),
    size: vi.fn().mockReturnValue(0),
    clear: vi.fn(),
    persist: vi.fn(),
    load: vi.fn(),
  }
}

function createMockSyncEngine() {
  return {
    notifyLocalChange: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    triggerSync: vi.fn(),
    setActivelyEditing: vi.fn(),
    flushPendingUpdates: vi.fn(),
    getState: vi.fn().mockReturnValue('Idle'),
    getRetryCount: vi.fn().mockReturnValue(0),
    getPendingUpdateCount: vi.fn().mockReturnValue(0),
    onStateChange: vi.fn().mockReturnValue(() => {}),
    isActivelyEditing: vi.fn().mockReturnValue(false),
  }
}

// ─── Tests: setupPersistence ─────────────────────────────────────────────────

describe('setupPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should persist notes to IndexedDB when notes change', () => {
    const note = makeNote({ id: 'note-1' })
    const store = createTestStore([note])

    setupPersistence(store)

    store.getState().updateNote('note-1', { title: 'Updated Title' })

    expect(mockedDebouncedPersist).toHaveBeenCalledWith(
      'shimo-notes',
      expect.arrayContaining([expect.objectContaining({ id: 'note-1', title: 'Updated Title' })])
    )
  })

  it('should persist folders to IndexedDB when folders change', () => {
    const folder = makeFolder({ id: 'folder-1' })
    const store = createTestStore([], [folder])

    setupPersistence(store)

    store.getState().updateFolder('folder-1', { name: 'Renamed Folder' })

    expect(mockedDebouncedPersist).toHaveBeenCalledWith(
      'shimo-folders',
      expect.arrayContaining([expect.objectContaining({ id: 'folder-1', name: 'Renamed Folder' })])
    )
  })

  it('should persist theme to IndexedDB when theme changes', () => {
    const store = createTestStore()

    setupPersistence(store)

    store.getState().toggleTheme()

    expect(mockedDebouncedPersist).toHaveBeenCalledWith('shimo-theme', 'dark')
  })

  it('should persist activeTag to IndexedDB when activeTag changes', () => {
    const store = createTestStore()

    setupPersistence(store)

    store.getState().setActiveTag('work')

    expect(mockedDebouncedPersist).toHaveBeenCalledWith('shimo-activeTag', 'work')
  })

  it('should stop persisting when cleanup function is called', () => {
    const note = makeNote({ id: 'note-1' })
    const store = createTestStore([note])

    const cleanup = setupPersistence(store)
    cleanup()

    vi.clearAllMocks()

    store.getState().updateNote('note-1', { title: 'After Cleanup' })
    store.getState().toggleTheme()

    expect(mockedDebouncedPersist).not.toHaveBeenCalled()
  })

  it('should persist null activeTag when tag is cleared', () => {
    const store = createTestStore()

    setupPersistence(store)

    store.getState().setActiveTag('work')
    vi.clearAllMocks()

    store.getState().setActiveTag(null)

    expect(mockedDebouncedPersist).toHaveBeenCalledWith('shimo-activeTag', null)
  })
})

// ─── Tests: setupSyncWiring ──────────────────────────────────────────────────

describe('setupSyncWiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should enqueue upsert_note when a note is updated', () => {
    const note = makeNote({ id: 'note-1' })
    const store = createTestStore([note])
    const queue = createMockOfflineQueue()
    const syncEngine = createMockSyncEngine()

    setupSyncWiring(store, syncEngine as any, queue as any)

    store.getState().updateNote('note-1', { title: 'Updated' })

    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'upsert_note',
        entityId: 'note-1',
      })
    )
  })

  it('should enqueue delete_note when a note is soft-deleted', () => {
    const note = makeNote({ id: 'note-1', deletedAt: null })
    const store = createTestStore([note])
    const queue = createMockOfflineQueue()
    const syncEngine = createMockSyncEngine()

    setupSyncWiring(store, syncEngine as any, queue as any)

    store.getState().deleteNote('note-1')

    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'delete_note',
        entityId: 'note-1',
      })
    )
  })

  it('should enqueue delete_note when a note is permanently deleted', () => {
    const note = makeNote({ id: 'note-1' })
    const store = createTestStore([note])
    const queue = createMockOfflineQueue()
    const syncEngine = createMockSyncEngine()

    setupSyncWiring(store, syncEngine as any, queue as any)

    store.getState().permanentDelete('note-1')

    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'delete_note',
        entityId: 'note-1',
      })
    )
  })

  it('should enqueue upsert_folder when a folder is updated', () => {
    const folder = makeFolder({ id: 'folder-1', updatedAt: Date.now() - 1000 })
    const store = createTestStore([], [folder])
    const queue = createMockOfflineQueue()
    const syncEngine = createMockSyncEngine()

    setupSyncWiring(store, syncEngine as any, queue as any)

    store.getState().updateFolder('folder-1', { name: 'Renamed' })

    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'upsert_folder',
        entityId: 'folder-1',
      })
    )
  })

  it('should enqueue delete_folder when a folder is deleted', () => {
    const folder = makeFolder({ id: 'folder-1' })
    const store = createTestStore([], [folder])
    const queue = createMockOfflineQueue()
    const syncEngine = createMockSyncEngine()

    setupSyncWiring(store, syncEngine as any, queue as any)

    store.getState().deleteFolder('folder-1')

    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'delete_folder',
        entityId: 'folder-1',
      })
    )
  })

  it('should notify sync engine of local note changes', () => {
    const note = makeNote({ id: 'note-1' })
    const store = createTestStore([note])
    const queue = createMockOfflineQueue()
    const syncEngine = createMockSyncEngine()

    setupSyncWiring(store, syncEngine as any, queue as any)

    store.getState().updateNote('note-1', { title: 'Changed' })

    expect(syncEngine.notifyLocalChange).toHaveBeenCalled()
  })

  it('should notify sync engine of local folder changes', () => {
    const folder = makeFolder({ id: 'folder-1' })
    const store = createTestStore([], [folder])
    const queue = createMockOfflineQueue()
    const syncEngine = createMockSyncEngine()

    setupSyncWiring(store, syncEngine as any, queue as any)

    store.getState().updateFolder('folder-1', { name: 'Changed' })

    expect(syncEngine.notifyLocalChange).toHaveBeenCalled()
  })

  it('should stop wiring when cleanup function is called', () => {
    const note = makeNote({ id: 'note-1' })
    const store = createTestStore([note])
    const queue = createMockOfflineQueue()
    const syncEngine = createMockSyncEngine()

    const cleanup = setupSyncWiring(store, syncEngine as any, queue as any)
    cleanup()

    vi.clearAllMocks()

    store.getState().updateNote('note-1', { title: 'After Cleanup' })

    expect(queue.enqueue).not.toHaveBeenCalled()
    expect(syncEngine.notifyLocalChange).not.toHaveBeenCalled()
  })

  it('should enqueue upsert_note for new notes added to the store', () => {
    const store = createTestStore([])
    const queue = createMockOfflineQueue()
    const syncEngine = createMockSyncEngine()

    setupSyncWiring(store, syncEngine as any, queue as any)

    // Simulate adding a new note
    store.setState((state) => {
      state.notes.push(makeNote({ id: 'new-note' }))
    })

    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'upsert_note',
        entityId: 'new-note',
      })
    )
  })
})
