/**
 * Store slice interfaces and action types for Zustand + Immer architecture.
 * Each slice groups related state and actions into a logical domain.
 */

import type { Note, Folder, ThemeMode } from '../../types'

// === Sync Types ===

/** Sync engine status exposed to UI */
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

/** Internal sync engine state machine states */
export type SyncState =
  | 'Idle'
  | 'Syncing'
  | 'PullPhase'
  | 'MergePhase'
  | 'PushPhase'
  | 'ProcessQueue'
  | 'Synced'
  | 'Error'
  | 'RetryWait'
  | 'Offline'

/** Types of operations that can be queued for offline sync */
export type SyncOpType = 'upsert_note' | 'delete_note' | 'upsert_folder' | 'delete_folder'

/** A single queued sync operation */
export interface SyncOp {
  id: string
  type: SyncOpType
  entityId: string
  payload?: Record<string, unknown>
  createdAt: number
  retryCount: number
}

// === Store Slices ===

export interface NoteSlice {
  notes: Note[]
  activeNoteId: string | null

  createNote: (folderId?: string | null) => string
  updateNote: (noteId: string, updates: Partial<Note>) => void
  deleteNote: (noteId: string) => void
  restoreNote: (noteId: string) => void
  permanentDelete: (noteId: string) => void
  emptyTrash: () => void
  setActiveNote: (noteId: string | null) => void
  togglePin: (noteId: string) => void
  toggleFavorite: (noteId: string) => void
  toggleHidden: (noteId: string) => void
  toggleLocked: (noteId: string) => void
  importNotes: (notes: Note[]) => void
  renameTag: (oldTag: string, newTag: string) => void
  mergeRemoteNotes: (remote: Note[]) => void
}

export interface FolderSlice {
  folders: Folder[]
  activeFolderId: string | null

  createFolder: (folder: Folder) => void
  updateFolder: (folderId: string, updates: Partial<Folder>) => void
  deleteFolder: (folderId: string) => void
  setActiveFolder: (folderId: string | null) => void
  reorderFolders: (ids: string[]) => void
  moveNoteToFolder: (noteId: string, folderId: string | null) => void
  mergeRemoteFolders: (remote: Folder[]) => void
}

export interface SyncSlice {
  syncStatus: SyncStatus
  lastSyncAt: number | null
  syncError: string | null

  triggerSync: () => Promise<void>
  setSyncStatus: (status: SyncStatus) => void
  setSyncError: (error: string | null) => void
}

export interface UISlice {
  theme: ThemeMode
  activeTag: string | null
  searchQuery: string
  sidebarVisible: boolean
  noteListVisible: boolean
  noteListWidth: number
  immersiveMode: boolean

  toggleTheme: () => void
  setActiveTag: (tag: string | null) => void
  setSearch: (query: string) => void
  toggleSidebar: () => void
  toggleNoteList: () => void
  setNoteListWidth: (width: number) => void
  setImmersiveMode: (active: boolean) => void
}

// === Combined Store ===

export type AppStore = NoteSlice & FolderSlice & SyncSlice & UISlice
