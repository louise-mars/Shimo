import { describe, it, expect, beforeEach, vi } from 'vitest'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { subscribeWithSelector } from 'zustand/middleware'
import { setupHistoryWiring } from './historyWiring'
import type { AppStore } from '../store/types'
import type { Note } from '../../types'

// Mock the noteHistory module
vi.mock('../noteHistory/noteHistory', () => ({
  createSnapshot: vi.fn().mockResolvedValue(true),
  clearSnapshots: vi.fn().mockResolvedValue(undefined),
}))

import { createSnapshot, clearSnapshots } from '../noteHistory/noteHistory'

const mockedCreateSnapshot = vi.mocked(createSnapshot)
const mockedClearSnapshots = vi.mocked(clearSnapshots)

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

function createTestStore(initialNotes: Note[] = []) {
  return create<AppStore>()(
    subscribeWithSelector(
      immer((set, get) => ({
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
        deleteNote: () => {},
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
        mergeRemoteNotes: () => {},

        // FolderSlice
        folders: [],
        activeFolderId: null,
        createFolder: () => {},
        updateFolder: () => {},
        deleteFolder: () => {},
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
        toggleTheme: () => {},
        setActiveTag: () => {},
        setSearch: () => {},
        toggleSidebar: () => {},
        toggleNoteList: () => {},
        setNoteListWidth: () => {},
        setImmersiveMode: () => {},
      }))
    )
  )
}

describe('setupHistoryWiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call createSnapshot when a note content changes', () => {
    const note = makeNote({ id: 'note-1', content: 'original content' })
    const store = createTestStore([note])

    setupHistoryWiring(store)

    // Update note content
    store.getState().updateNote('note-1', { content: 'new content' })

    expect(mockedCreateSnapshot).toHaveBeenCalledWith(
      'note-1',
      'new content',
      'Test Note'
    )
  })

  it('should not call createSnapshot when content does not change', () => {
    const note = makeNote({ id: 'note-1', content: 'same content' })
    const store = createTestStore([note])

    setupHistoryWiring(store)

    // Update note without changing content (e.g., only title)
    store.getState().updateNote('note-1', { title: 'New Title' })

    expect(mockedCreateSnapshot).not.toHaveBeenCalled()
  })

  it('should call clearSnapshots when a note is permanently deleted', () => {
    const note = makeNote({ id: 'note-1' })
    const store = createTestStore([note])

    setupHistoryWiring(store)

    // Permanently delete the note
    store.getState().permanentDelete('note-1')

    expect(mockedClearSnapshots).toHaveBeenCalledWith('note-1')
  })

  it('should not call clearSnapshots for notes that still exist', () => {
    const note1 = makeNote({ id: 'note-1' })
    const note2 = makeNote({ id: 'note-2' })
    const store = createTestStore([note1, note2])

    setupHistoryWiring(store)

    // Delete only note-1
    store.getState().permanentDelete('note-1')

    expect(mockedClearSnapshots).toHaveBeenCalledWith('note-1')
    expect(mockedClearSnapshots).not.toHaveBeenCalledWith('note-2')
  })

  it('should handle multiple content changes', () => {
    const note = makeNote({ id: 'note-1', content: 'v1' })
    const store = createTestStore([note])

    setupHistoryWiring(store)

    store.getState().updateNote('note-1', { content: 'v2' })
    store.getState().updateNote('note-1', { content: 'v3' })

    expect(mockedCreateSnapshot).toHaveBeenCalledTimes(2)
    expect(mockedCreateSnapshot).toHaveBeenCalledWith('note-1', 'v2', 'Test Note')
    expect(mockedCreateSnapshot).toHaveBeenCalledWith('note-1', 'v3', 'Test Note')
  })

  it('should not trigger snapshot for deleted notes', () => {
    const note = makeNote({ id: 'note-1', content: 'original', deletedAt: Date.now() })
    const store = createTestStore([note])

    setupHistoryWiring(store)

    // Update content of a deleted note
    store.getState().updateNote('note-1', { content: 'new content' })

    expect(mockedCreateSnapshot).not.toHaveBeenCalled()
  })

  it('should stop subscriptions when unsubscribe is called', () => {
    const note = makeNote({ id: 'note-1', content: 'original' })
    const store = createTestStore([note])

    const unsubscribe = setupHistoryWiring(store)
    unsubscribe()

    // Changes after unsubscribe should not trigger anything
    store.getState().updateNote('note-1', { content: 'new content' })
    store.getState().permanentDelete('note-1')

    expect(mockedCreateSnapshot).not.toHaveBeenCalled()
    expect(mockedClearSnapshots).not.toHaveBeenCalled()
  })

  it('should not trigger snapshot for newly created notes (no previous content)', () => {
    const store = createTestStore([])

    setupHistoryWiring(store)

    // Simulate adding a new note directly to the store
    store.setState((state) => {
      state.notes.push(makeNote({ id: 'new-note', content: 'first content' }))
    })

    // First content set should not trigger snapshot (no previous content to compare)
    expect(mockedCreateSnapshot).not.toHaveBeenCalled()
  })
})
