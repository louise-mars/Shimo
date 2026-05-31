/**
 * Folder slice for Zustand store with Immer middleware.
 * Manages folder CRUD, nesting (max 3 levels), reordering,
 * note-to-folder assignment, and remote merge (LWW by updatedAt).
 */

import type { StateCreator } from 'zustand'
import type { Folder } from '../../types'
import type { FolderSlice, AppStore } from './types'

// Side-effect import to load zustand/immer StoreMutators augmentation
import 'zustand/middleware/immer'

/** Maximum allowed nesting depth for folders (root = 1, child = 2, grandchild = 3) */
const MAX_NESTING_DEPTH = 3

/**
 * Compute the depth of a folder within the tree.
 * Root folders (parentId === null) have depth 1.
 */
function getFolderDepth(folderId: string | null, folders: Folder[]): number {
  if (folderId === null) return 0
  let depth = 0
  let currentId: string | null = folderId
  while (currentId !== null) {
    depth++
    const folder = folders.find((f) => f.id === currentId)
    if (!folder) break
    currentId = folder.parentId
  }
  return depth
}

/**
 * Collect all descendant folder IDs recursively.
 */
function getDescendantIds(folderId: string, folders: Folder[]): string[] {
  const descendants: string[] = []
  const children = folders.filter((f) => f.parentId === folderId)
  for (const child of children) {
    descendants.push(child.id)
    descendants.push(...getDescendantIds(child.id, folders))
  }
  return descendants
}

export const createFolderSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  FolderSlice
> = (set, get) => ({
  folders: [],
  activeFolderId: null,

  createFolder: (folder: Folder) => {
    set((state) => {
      // Enforce max 3 levels of nesting
      const parentDepth = getFolderDepth(folder.parentId, state.folders)
      if (parentDepth >= MAX_NESTING_DEPTH) {
        return // Cannot nest deeper than 3 levels
      }
      state.folders.push(folder)
    })
  },

  updateFolder: (folderId: string, updates: Partial<Folder>) => {
    set((state) => {
      const folder = state.folders.find((f) => f.id === folderId)
      if (!folder) return

      // If parentId is being changed, enforce max nesting depth
      if (updates.parentId !== undefined && updates.parentId !== folder.parentId) {
        const newParentDepth = getFolderDepth(updates.parentId, state.folders)
        // Check that moving this folder (and its subtree) won't exceed max depth
        const subtreeDepth = getMaxSubtreeDepth(folderId, state.folders)
        if (newParentDepth + subtreeDepth > MAX_NESTING_DEPTH) {
          return // Would exceed max nesting
        }
      }

      Object.assign(folder, updates)
      folder.updatedAt = Date.now()
    })
  },

  deleteFolder: (folderId: string) => {
    set((state) => {
      // Collect all descendant folder IDs
      const descendantIds = getDescendantIds(folderId, state.folders)
      const allFolderIds = [folderId, ...descendantIds]

      // Unassign all notes from deleted folders
      if ('notes' in state && Array.isArray(state.notes)) {
        for (const note of state.notes) {
          if (note.folderId && allFolderIds.includes(note.folderId)) {
            note.folderId = null
          }
        }
      }

      // Remove the folder and all descendants
      state.folders = state.folders.filter((f) => !allFolderIds.includes(f.id))

      // Clear active folder if it was deleted
      if (state.activeFolderId && allFolderIds.includes(state.activeFolderId)) {
        state.activeFolderId = null
      }
    })
  },

  setActiveFolder: (folderId: string | null) => {
    set((state) => {
      state.activeFolderId = folderId
    })
  },

  reorderFolders: (ids: string[]) => {
    set((state) => {
      for (let i = 0; i < ids.length; i++) {
        const folder = state.folders.find((f) => f.id === ids[i])
        if (folder) {
          folder.order = i
        }
      }
    })
  },

  moveNoteToFolder: (noteId: string, folderId: string | null) => {
    set((state) => {
      // Single-folder assignment: just set the note's folderId
      if ('notes' in state && Array.isArray(state.notes)) {
        const note = state.notes.find((n) => n.id === noteId)
        if (note) {
          note.folderId = folderId
          note.updatedAt = Date.now()
        }
      }
    })
  },

  mergeRemoteFolders: (remote: Folder[]) => {
    set((state) => {
      for (const remoteFolder of remote) {
        const localIdx = state.folders.findIndex((f) => f.id === remoteFolder.id)
        if (localIdx >= 0) {
          // LWW: update only if remote is newer
          if (remoteFolder.updatedAt > state.folders[localIdx].updatedAt) {
            state.folders[localIdx] = remoteFolder
          }
        } else {
          // Insert new remote folder
          state.folders.push(remoteFolder)
        }
      }
    })
  },
})

/**
 * Get the maximum depth of a folder's subtree (including itself).
 * A leaf folder returns 1.
 */
function getMaxSubtreeDepth(folderId: string, folders: Folder[]): number {
  const children = folders.filter((f) => f.parentId === folderId)
  if (children.length === 0) return 1
  const childDepths = children.map((c) => getMaxSubtreeDepth(c.id, folders))
  return 1 + Math.max(...childDepths)
}
