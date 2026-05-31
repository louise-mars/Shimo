import { describe, it, expect, beforeEach } from 'vitest'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { createFolderSlice } from './folderSlice'
import type { Folder, Note } from '../../types'
import type { AppStore, FolderSlice, NoteSlice } from './types'

/**
 * Minimal note slice stub for testing folder interactions with notes.
 */
function createMinimalNoteSlice(initialNotes: Note[] = []) {
  return (..._args: unknown[]) => ({
    notes: initialNotes,
    activeNoteId: null,
    createNote: () => '',
    updateNote: () => {},
    deleteNote: () => {},
    restoreNote: () => {},
    permanentDelete: () => {},
    emptyTrash: () => {},
    setActiveNote: () => {},
    togglePin: () => {},
    toggleFavorite: () => {},
    toggleHidden: () => {},
    toggleLocked: () => {},
    importNotes: () => {},
    renameTag: () => {},
    mergeRemoteNotes: () => {},
  })
}

function createTestStore(initialNotes: Note[] = []) {
  return create<AppStore>()(
    immer((...args) => ({
      ...createMinimalNoteSlice(initialNotes)(...args),
      ...createFolderSlice(...args),
      // Minimal sync/ui stubs
      syncStatus: 'idle' as const,
      lastSyncAt: null,
      syncError: null,
      triggerSync: async () => {},
      setSyncStatus: () => {},
      setSyncError: () => {},
      theme: 'light' as const,
      activeTag: null,
      searchQuery: '',
      sidebarVisible: true,
      noteListVisible: true,
      noteListWidth: 260,
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
}

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: `folder-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Folder',
    emoji: '📁',
    parentId: null,
    order: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: `note-${Math.random().toString(36).slice(2, 8)}`,
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

describe('folderSlice', () => {
  describe('createFolder', () => {
    it('should add a folder to the store', () => {
      const store = createTestStore()
      const folder = makeFolder({ id: 'f1', name: 'Work' })

      store.getState().createFolder(folder)

      expect(store.getState().folders).toHaveLength(1)
      expect(store.getState().folders[0].name).toBe('Work')
    })

    it('should allow creating nested folders up to 3 levels', () => {
      const store = createTestStore()
      const root = makeFolder({ id: 'root', parentId: null })
      const child = makeFolder({ id: 'child', parentId: 'root' })
      const grandchild = makeFolder({ id: 'grandchild', parentId: 'child' })

      store.getState().createFolder(root)
      store.getState().createFolder(child)
      store.getState().createFolder(grandchild)

      expect(store.getState().folders).toHaveLength(3)
    })

    it('should reject folders that would exceed 3 levels of nesting', () => {
      const store = createTestStore()
      const root = makeFolder({ id: 'root', parentId: null })
      const child = makeFolder({ id: 'child', parentId: 'root' })
      const grandchild = makeFolder({ id: 'grandchild', parentId: 'child' })
      const tooDeep = makeFolder({ id: 'tooDeep', parentId: 'grandchild' })

      store.getState().createFolder(root)
      store.getState().createFolder(child)
      store.getState().createFolder(grandchild)
      store.getState().createFolder(tooDeep)

      // tooDeep should not be added
      expect(store.getState().folders).toHaveLength(3)
      expect(store.getState().folders.find((f) => f.id === 'tooDeep')).toBeUndefined()
    })
  })

  describe('updateFolder', () => {
    it('should update folder properties', () => {
      const store = createTestStore()
      const folder = makeFolder({ id: 'f1', name: 'Old Name' })
      store.getState().createFolder(folder)

      store.getState().updateFolder('f1', { name: 'New Name', emoji: '🎯' })

      const updated = store.getState().folders[0]
      expect(updated.name).toBe('New Name')
      expect(updated.emoji).toBe('🎯')
    })

    it('should update the updatedAt timestamp', () => {
      const store = createTestStore()
      const folder = makeFolder({ id: 'f1', updatedAt: 1000 })
      store.getState().createFolder(folder)

      store.getState().updateFolder('f1', { name: 'Updated' })

      expect(store.getState().folders[0].updatedAt).toBeGreaterThan(1000)
    })

    it('should not update a non-existent folder', () => {
      const store = createTestStore()
      store.getState().updateFolder('nonexistent', { name: 'Nope' })
      expect(store.getState().folders).toHaveLength(0)
    })

    it('should reject parentId change that would exceed max nesting', () => {
      const store = createTestStore()
      const root = makeFolder({ id: 'root', parentId: null })
      const child = makeFolder({ id: 'child', parentId: 'root' })
      const grandchild = makeFolder({ id: 'grandchild', parentId: 'child' })
      const separate = makeFolder({ id: 'separate', parentId: null })

      store.getState().createFolder(root)
      store.getState().createFolder(child)
      store.getState().createFolder(grandchild)
      store.getState().createFolder(separate)

      // Try to move 'separate' under 'grandchild' — would be level 4
      store.getState().updateFolder('separate', { parentId: 'grandchild' })

      // Should remain at root
      expect(store.getState().folders.find((f) => f.id === 'separate')!.parentId).toBeNull()
    })
  })

  describe('deleteFolder', () => {
    it('should remove the folder from the store', () => {
      const store = createTestStore()
      const folder = makeFolder({ id: 'f1' })
      store.getState().createFolder(folder)

      store.getState().deleteFolder('f1')

      expect(store.getState().folders).toHaveLength(0)
    })

    it('should recursively delete child folders', () => {
      const store = createTestStore()
      store.getState().createFolder(makeFolder({ id: 'root', parentId: null }))
      store.getState().createFolder(makeFolder({ id: 'child', parentId: 'root' }))
      store.getState().createFolder(makeFolder({ id: 'grandchild', parentId: 'child' }))

      store.getState().deleteFolder('root')

      expect(store.getState().folders).toHaveLength(0)
    })

    it('should unassign notes from deleted folder', () => {
      const note = makeNote({ id: 'n1', folderId: 'f1' })
      const store = createTestStore([note])
      store.getState().createFolder(makeFolder({ id: 'f1' }))

      store.getState().deleteFolder('f1')

      expect(store.getState().notes[0].folderId).toBeNull()
    })

    it('should unassign notes from recursively deleted child folders', () => {
      const note1 = makeNote({ id: 'n1', folderId: 'child' })
      const note2 = makeNote({ id: 'n2', folderId: 'grandchild' })
      const store = createTestStore([note1, note2])
      store.getState().createFolder(makeFolder({ id: 'root', parentId: null }))
      store.getState().createFolder(makeFolder({ id: 'child', parentId: 'root' }))
      store.getState().createFolder(makeFolder({ id: 'grandchild', parentId: 'child' }))

      store.getState().deleteFolder('root')

      expect(store.getState().notes[0].folderId).toBeNull()
      expect(store.getState().notes[1].folderId).toBeNull()
    })

    it('should clear activeFolderId if the deleted folder was active', () => {
      const store = createTestStore()
      store.getState().createFolder(makeFolder({ id: 'f1' }))
      store.getState().setActiveFolder('f1')

      store.getState().deleteFolder('f1')

      expect(store.getState().activeFolderId).toBeNull()
    })
  })

  describe('setActiveFolder', () => {
    it('should set the active folder ID', () => {
      const store = createTestStore()
      store.getState().setActiveFolder('f1')
      expect(store.getState().activeFolderId).toBe('f1')
    })

    it('should allow setting to null', () => {
      const store = createTestStore()
      store.getState().setActiveFolder('f1')
      store.getState().setActiveFolder(null)
      expect(store.getState().activeFolderId).toBeNull()
    })
  })

  describe('reorderFolders', () => {
    it('should update order field based on array position', () => {
      const store = createTestStore()
      store.getState().createFolder(makeFolder({ id: 'a', order: 0 }))
      store.getState().createFolder(makeFolder({ id: 'b', order: 1 }))
      store.getState().createFolder(makeFolder({ id: 'c', order: 2 }))

      store.getState().reorderFolders(['c', 'a', 'b'])

      const folders = store.getState().folders
      expect(folders.find((f) => f.id === 'c')!.order).toBe(0)
      expect(folders.find((f) => f.id === 'a')!.order).toBe(1)
      expect(folders.find((f) => f.id === 'b')!.order).toBe(2)
    })
  })

  describe('moveNoteToFolder', () => {
    it('should set the note folderId to the target folder', () => {
      const note = makeNote({ id: 'n1', folderId: null })
      const store = createTestStore([note])

      store.getState().moveNoteToFolder('n1', 'f1')

      expect(store.getState().notes[0].folderId).toBe('f1')
    })

    it('should set folderId to null when moving to no folder', () => {
      const note = makeNote({ id: 'n1', folderId: 'f1' })
      const store = createTestStore([note])

      store.getState().moveNoteToFolder('n1', null)

      expect(store.getState().notes[0].folderId).toBeNull()
    })

    it('should enforce single-folder assignment (overwrite previous)', () => {
      const note = makeNote({ id: 'n1', folderId: 'f1' })
      const store = createTestStore([note])

      store.getState().moveNoteToFolder('n1', 'f2')

      expect(store.getState().notes[0].folderId).toBe('f2')
    })

    it('should update the note updatedAt timestamp', () => {
      const note = makeNote({ id: 'n1', folderId: null, updatedAt: 1000 })
      const store = createTestStore([note])

      store.getState().moveNoteToFolder('n1', 'f1')

      expect(store.getState().notes[0].updatedAt).toBeGreaterThan(1000)
    })
  })

  describe('mergeRemoteFolders', () => {
    it('should insert new remote folders', () => {
      const store = createTestStore()
      const remoteFolder = makeFolder({ id: 'remote1', name: 'Remote' })

      store.getState().mergeRemoteFolders([remoteFolder])

      expect(store.getState().folders).toHaveLength(1)
      expect(store.getState().folders[0].name).toBe('Remote')
    })

    it('should update existing folder if remote is newer (LWW)', () => {
      const store = createTestStore()
      const localFolder = makeFolder({ id: 'f1', name: 'Local', updatedAt: 1000 })
      store.getState().createFolder(localFolder)

      const remoteFolder = makeFolder({ id: 'f1', name: 'Remote Updated', updatedAt: 2000 })
      store.getState().mergeRemoteFolders([remoteFolder])

      expect(store.getState().folders[0].name).toBe('Remote Updated')
    })

    it('should NOT update existing folder if local is newer (LWW)', () => {
      const store = createTestStore()
      const localFolder = makeFolder({ id: 'f1', name: 'Local', updatedAt: 2000 })
      store.getState().createFolder(localFolder)

      const remoteFolder = makeFolder({ id: 'f1', name: 'Remote Old', updatedAt: 1000 })
      store.getState().mergeRemoteFolders([remoteFolder])

      expect(store.getState().folders[0].name).toBe('Local')
    })

    it('should handle mix of new and existing folders', () => {
      const store = createTestStore()
      store.getState().createFolder(makeFolder({ id: 'existing', name: 'Old', updatedAt: 1000 }))

      store.getState().mergeRemoteFolders([
        makeFolder({ id: 'existing', name: 'Updated', updatedAt: 2000 }),
        makeFolder({ id: 'new1', name: 'Brand New' }),
      ])

      expect(store.getState().folders).toHaveLength(2)
      expect(store.getState().folders.find((f) => f.id === 'existing')!.name).toBe('Updated')
      expect(store.getState().folders.find((f) => f.id === 'new1')!.name).toBe('Brand New')
    })
  })
})
