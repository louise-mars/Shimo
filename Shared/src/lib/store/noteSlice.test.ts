import { describe, it, expect, beforeEach } from 'vitest'
import { createNoteSlice, extractTags } from './noteSlice'
import type { AppStore, NoteSlice } from './types'
import type { Note } from '../../types'

// Helper to create a minimal mock store environment for testing the slice
function createTestSlice(): NoteSlice {
  let state: NoteSlice = null as unknown as NoteSlice

  const set = (fn: (s: AppStore) => void) => {
    // Simulate immer-like mutable draft — mutate state directly
    fn(state as unknown as AppStore)
  }

  const get = () => state as unknown as AppStore

  state = createNoteSlice(set, get)
  return state
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'test-id',
    title: 'Test Note',
    content: '',
    tags: [],
    folderId: null,
    pinned: false,
    favorited: false,
    locked: false,
    hidden: false,
    deletedAt: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  }
}

describe('extractTags', () => {
  it('returns empty array for empty content', () => {
    expect(extractTags('')).toEqual([])
  })

  it('extracts hashtags from plain text', () => {
    const tags = extractTags('Hello #world and #日记')
    expect(tags).toContain('world')
    expect(tags).toContain('日记')
  })

  it('extracts unique tags (no duplicates)', () => {
    const tags = extractTags('#hello #world #hello')
    expect(tags).toEqual(['hello', 'world'])
  })

  it('extracts tags from TipTap JSON with text nodes', () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Some text with #tag1 and #tag2' },
          ],
        },
      ],
    })
    const tags = extractTags(doc)
    expect(tags).toContain('tag1')
    expect(tags).toContain('tag2')
  })

  it('extracts tags from mention nodes', () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'mention',
          attrs: { id: 'myTag', label: 'myTag' },
        },
      ],
    })
    const tags = extractTags(doc)
    expect(tags).toContain('myTag')
  })

  it('handles invalid JSON gracefully by falling back to regex', () => {
    const tags = extractTags('not json but has #fallback')
    expect(tags).toContain('fallback')
  })
})

describe('noteSlice', () => {
  let slice: NoteSlice

  beforeEach(() => {
    slice = createTestSlice()
  })

  describe('createNote', () => {
    it('creates a note with UUID and sets it as active', () => {
      const id = slice.createNote()
      expect(id).toBeTruthy()
      expect(slice.notes).toHaveLength(1)
      expect(slice.notes[0].id).toBe(id)
      expect(slice.activeNoteId).toBe(id)
    })

    it('creates a note with the given folderId', () => {
      const id = slice.createNote('folder-1')
      expect(slice.notes[0].folderId).toBe('folder-1')
    })

    it('creates a note with default values', () => {
      slice.createNote()
      const note = slice.notes[0]
      expect(note.title).toBe('')
      expect(note.content).toBe('')
      expect(note.tags).toEqual([])
      expect(note.pinned).toBe(false)
      expect(note.favorited).toBe(false)
      expect(note.locked).toBe(false)
      expect(note.hidden).toBe(false)
      expect(note.deletedAt).toBeNull()
    })
  })

  describe('updateNote', () => {
    it('updates note fields and timestamp', () => {
      const id = slice.createNote()
      const before = slice.notes[0].updatedAt
      slice.updateNote(id, { title: 'New Title' })
      expect(slice.notes[0].title).toBe('New Title')
      expect(slice.notes[0].updatedAt).toBeGreaterThanOrEqual(before)
    })

    it('extracts tags when content is updated', () => {
      const id = slice.createNote()
      slice.updateNote(id, { content: 'Hello #world #日记' })
      expect(slice.notes[0].tags).toContain('world')
      expect(slice.notes[0].tags).toContain('日记')
    })

    it('does nothing for non-existent note', () => {
      slice.createNote()
      slice.updateNote('non-existent', { title: 'X' })
      expect(slice.notes[0].title).toBe('')
    })
  })

  describe('deleteNote (soft-delete)', () => {
    it('sets deletedAt timestamp', () => {
      const id = slice.createNote()
      slice.deleteNote(id)
      expect(slice.notes[0].deletedAt).toBeGreaterThan(0)
    })

    it('deselects the note if it was active', () => {
      const id = slice.createNote()
      expect(slice.activeNoteId).toBe(id)
      slice.deleteNote(id)
      expect(slice.activeNoteId).toBeNull()
    })
  })

  describe('restoreNote', () => {
    it('sets deletedAt to null', () => {
      const id = slice.createNote()
      slice.deleteNote(id)
      expect(slice.notes[0].deletedAt).not.toBeNull()
      slice.restoreNote(id)
      expect(slice.notes[0].deletedAt).toBeNull()
    })
  })

  describe('permanentDelete', () => {
    it('removes the note from the array', () => {
      const id = slice.createNote()
      slice.permanentDelete(id)
      expect(slice.notes).toHaveLength(0)
    })

    it('deselects the note if active', () => {
      const id = slice.createNote()
      slice.permanentDelete(id)
      expect(slice.activeNoteId).toBeNull()
    })
  })

  describe('emptyTrash', () => {
    it('removes all soft-deleted notes', () => {
      const id1 = slice.createNote()
      const id2 = slice.createNote()
      slice.deleteNote(id1) // soft-delete first
      slice.emptyTrash()
      expect(slice.notes).toHaveLength(1)
      expect(slice.notes[0].id).toBe(id2)
    })
  })

  describe('setActiveNote', () => {
    it('sets the active note ID', () => {
      const id = slice.createNote()
      slice.setActiveNote(null)
      expect(slice.activeNoteId).toBeNull()
      slice.setActiveNote(id)
      expect(slice.activeNoteId).toBe(id)
    })
  })

  describe('togglePin', () => {
    it('toggles the pinned state', () => {
      const id = slice.createNote()
      expect(slice.notes[0].pinned).toBe(false)
      slice.togglePin(id)
      expect(slice.notes[0].pinned).toBe(true)
      slice.togglePin(id)
      expect(slice.notes[0].pinned).toBe(false)
    })
  })

  describe('toggleFavorite', () => {
    it('toggles the favorited state', () => {
      const id = slice.createNote()
      slice.toggleFavorite(id)
      expect(slice.notes[0].favorited).toBe(true)
    })
  })

  describe('toggleHidden', () => {
    it('toggles the hidden state', () => {
      const id = slice.createNote()
      slice.toggleHidden(id)
      expect(slice.notes[0].hidden).toBe(true)
    })
  })

  describe('toggleLocked', () => {
    it('toggles the locked state', () => {
      const id = slice.createNote()
      slice.toggleLocked(id)
      expect(slice.notes[0].locked).toBe(true)
    })
  })

  describe('importNotes', () => {
    it('adds notes that do not already exist', () => {
      const note = makeNote({ id: 'import-1', title: 'Imported' })
      slice.importNotes([note])
      expect(slice.notes).toHaveLength(1)
      expect(slice.notes[0].title).toBe('Imported')
    })

    it('skips notes with duplicate IDs', () => {
      const id = slice.createNote()
      const duplicate = makeNote({ id, title: 'Duplicate' })
      slice.importNotes([duplicate])
      expect(slice.notes).toHaveLength(1)
      expect(slice.notes[0].title).toBe('') // original unchanged
    })
  })

  describe('renameTag', () => {
    it('renames a tag across all notes', () => {
      const id1 = slice.createNote()
      const id2 = slice.createNote()
      // Manually set tags (simulating extracted tags)
      slice.notes[0].tags = ['oldTag', 'other']
      slice.notes[1].tags = ['oldTag']
      slice.renameTag('oldTag', 'newTag')
      expect(slice.notes[0].tags).toContain('newTag')
      expect(slice.notes[0].tags).not.toContain('oldTag')
      expect(slice.notes[1].tags).toContain('newTag')
    })

    it('does not affect notes without the tag', () => {
      slice.createNote()
      slice.notes[0].tags = ['unrelated']
      const before = slice.notes[0].updatedAt
      slice.renameTag('oldTag', 'newTag')
      expect(slice.notes[0].tags).toEqual(['unrelated'])
      expect(slice.notes[0].updatedAt).toBe(before)
    })
  })

  describe('mergeRemoteNotes', () => {
    it('inserts new remote notes', () => {
      const remote = makeNote({ id: 'remote-1', title: 'Remote' })
      slice.mergeRemoteNotes([remote])
      expect(slice.notes).toHaveLength(1)
      expect(slice.notes[0].title).toBe('Remote')
    })

    it('updates local note when remote is newer (LWW)', () => {
      const id = slice.createNote()
      slice.notes[0].updatedAt = 1000
      const remote = makeNote({ id, title: 'Updated', updatedAt: 2000 })
      slice.mergeRemoteNotes([remote])
      expect(slice.notes[0].title).toBe('Updated')
    })

    it('keeps local note when local is newer', () => {
      const id = slice.createNote()
      slice.notes[0].updatedAt = 3000
      slice.notes[0].title = 'Local'
      const remote = makeNote({ id, title: 'Old Remote', updatedAt: 1000 })
      slice.mergeRemoteNotes([remote])
      expect(slice.notes[0].title).toBe('Local')
    })

    it('preserves local pin/favorite when remote wins', () => {
      const id = slice.createNote()
      slice.notes[0].updatedAt = 1000
      slice.notes[0].pinned = true
      slice.notes[0].favorited = true
      const remote = makeNote({ id, updatedAt: 2000, pinned: false, favorited: false })
      slice.mergeRemoteNotes([remote])
      expect(slice.notes[0].pinned).toBe(true)
      expect(slice.notes[0].favorited).toBe(true)
    })
  })
})
