/**
 * Note slice for Zustand store with Immer middleware.
 * Implements all note CRUD operations, soft-delete, tag extraction,
 * and remote merge (LWW by updatedAt).
 */

import { v4 as uuidv4 } from 'uuid'
import type { Note, TipTapNode } from '../../types'
import type { NoteSlice, AppStore } from './types'

/**
 * Extract unique tags from TipTap JSON content string.
 * Finds:
 * 1. Nodes with type 'mention' that have an attrs.id or attrs.label
 * 2. Text containing #tag patterns (Chinese or alphanumeric characters)
 */
export function extractTags(content: string): string[] {
  if (!content) return []

  const tags = new Set<string>()

  // Try parsing as TipTap JSON
  try {
    const doc = JSON.parse(content) as TipTapNode
    walkNodes(doc, tags)
  } catch {
    // If not valid JSON, try regex extraction on raw text
    extractHashTags(content, tags)
  }

  return Array.from(tags)
}

/**
 * Recursively walk TipTap JSON nodes to find tags.
 */
function walkNodes(node: TipTapNode, tags: Set<string>): void {
  // Check for mention nodes (tag mentions)
  if (node.type === 'mention') {
    const label = (node.attrs?.label ?? node.attrs?.id) as string | undefined
    if (label) {
      tags.add(label)
    }
  }

  // Check text content for #tag patterns
  if (node.text) {
    extractHashTags(node.text, tags)
  }

  // Recurse into children
  if (node.content) {
    for (const child of node.content) {
      walkNodes(child, tags)
    }
  }
}

/**
 * Extract #tag patterns from text.
 * Matches # followed by Chinese characters, alphanumeric, or underscores.
 */
function extractHashTags(text: string, tags: Set<string>): void {
  const regex = /#([\u4e00-\u9fff\w]+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    tags.add(match[1])
  }
}

/**
 * Zustand slice creator for note state and actions.
 * Uses a simple function signature compatible with Zustand 5 + Immer.
 */
export const createNoteSlice = (
  set: (fn: (state: AppStore) => void) => void,
  get: () => AppStore
): NoteSlice => ({
  notes: [],
  activeNoteId: null,

  createNote: (folderId?: string | null): string => {
    const id = uuidv4()
    const now = Date.now()
    const newNote: Note = {
      id,
      title: '',
      content: '',
      tags: [],
      folderId: folderId ?? null,
      pinned: false,
      favorited: false,
      locked: false,
      hidden: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }

    set((state) => {
      state.notes.push(newNote)
      state.activeNoteId = id
    })

    return id
  },

  updateNote: (noteId: string, updates: Partial<Note>): void => {
    set((state) => {
      const note = state.notes.find((n: Note) => n.id === noteId)
      if (!note) return

      // Apply updates
      Object.assign(note, updates)

      // Extract tags from content if content was updated
      if (updates.content !== undefined) {
        note.tags = extractTags(note.content)
      }

      // Always update the timestamp
      note.updatedAt = Date.now()
    })
  },

  deleteNote: (noteId: string): void => {
    set((state) => {
      const note = state.notes.find((n: Note) => n.id === noteId)
      if (!note) return

      note.deletedAt = Date.now()

      // Deselect if this was the active note
      if (state.activeNoteId === noteId) {
        state.activeNoteId = null
      }
    })
  },

  restoreNote: (noteId: string): void => {
    set((state) => {
      const note = state.notes.find((n: Note) => n.id === noteId)
      if (!note) return

      note.deletedAt = null
    })
  },

  permanentDelete: (noteId: string): void => {
    set((state) => {
      const idx = state.notes.findIndex((n: Note) => n.id === noteId)
      if (idx === -1) return

      state.notes.splice(idx, 1)

      if (state.activeNoteId === noteId) {
        state.activeNoteId = null
      }
    })
  },

  emptyTrash: (): void => {
    set((state) => {
      state.notes = state.notes.filter((n: Note) => n.deletedAt === null)
    })
  },

  setActiveNote: (noteId: string | null): void => {
    set((state) => {
      state.activeNoteId = noteId
    })
  },

  togglePin: (noteId: string): void => {
    set((state) => {
      const note = state.notes.find((n: Note) => n.id === noteId)
      if (!note) return
      note.pinned = !note.pinned
    })
  },

  toggleFavorite: (noteId: string): void => {
    set((state) => {
      const note = state.notes.find((n: Note) => n.id === noteId)
      if (!note) return
      note.favorited = !note.favorited
    })
  },

  toggleHidden: (noteId: string): void => {
    set((state) => {
      const note = state.notes.find((n: Note) => n.id === noteId)
      if (!note) return
      note.hidden = !note.hidden
    })
  },

  toggleLocked: (noteId: string): void => {
    set((state) => {
      const note = state.notes.find((n: Note) => n.id === noteId)
      if (!note) return
      note.locked = !note.locked
    })
  },

  importNotes: (notes: Note[]): void => {
    set((state) => {
      for (const note of notes) {
        // Avoid duplicates by ID
        const existing = state.notes.findIndex((n: Note) => n.id === note.id)
        if (existing === -1) {
          state.notes.push(note)
        }
      }
    })
  },

  renameTag: (oldTag: string, newTag: string): void => {
    set((state) => {
      for (const note of state.notes) {
        const tagIdx = note.tags.indexOf(oldTag)
        if (tagIdx !== -1) {
          note.tags[tagIdx] = newTag
          note.updatedAt = Date.now()
        }
      }
    })
  },

  mergeRemoteNotes: (remote: Note[]): void => {
    set((state) => {
      for (const remoteNote of remote) {
        const localIdx = state.notes.findIndex((n: Note) => n.id === remoteNote.id)
        if (localIdx === -1) {
          // Note doesn't exist locally — insert it
          state.notes.push(remoteNote)
        } else {
          // Note exists locally — LWW by updatedAt
          const local = state.notes[localIdx]
          if (remoteNote.updatedAt > local.updatedAt) {
            // Remote is newer — update local, but preserve local pin/favorite
            state.notes[localIdx] = {
              ...remoteNote,
              pinned: local.pinned,
              favorited: local.favorited,
            }
          }
          // If local is newer or equal, keep local (no-op)
        }
      }
    })
  },
})
