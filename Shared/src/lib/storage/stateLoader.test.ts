/**
 * Tests for stateLoader module.
 * Validates: Requirements 3.5, 3.6, 27.1, 27.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { injectNoteDefaults, createWelcomeNote, loadPersistedState } from './stateLoader'
import type { Note } from '../../types'

// Mock the indexedDB module
vi.mock('./indexedDB', () => ({
  idbGet: vi.fn(),
  migrateFromLocalStorage: vi.fn(),
}))

import { idbGet, migrateFromLocalStorage } from './indexedDB'

const mockedIdbGet = vi.mocked(idbGet)
const mockedMigrate = vi.mocked(migrateFromLocalStorage)

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'test-id',
    title: 'Test Note',
    content: '{}',
    tags: ['tag1'],
    folderId: null,
    pinned: false,
    favorited: false,
    locked: false,
    hidden: false,
    deletedAt: null,
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  }
}

describe('injectNoteDefaults', () => {
  it('injects locked, hidden, deletedAt, folderId when missing', () => {
    const legacy: Record<string, unknown> = {
      id: 'note-1',
      title: 'Old Note',
      content: '{}',
      tags: ['work'],
      pinned: true,
      favorited: false,
      createdAt: 1000,
      updatedAt: 2000,
    }

    const result = injectNoteDefaults(legacy)

    expect(result.locked).toBe(false)
    expect(result.hidden).toBe(false)
    expect(result.deletedAt).toBeNull()
    expect(result.folderId).toBeNull()
    // Existing fields preserved
    expect(result.id).toBe('note-1')
    expect(result.title).toBe('Old Note')
    expect(result.pinned).toBe(true)
    expect(result.tags).toEqual(['work'])
  })

  it('does not overwrite existing values', () => {
    const note: Record<string, unknown> = {
      id: 'note-2',
      title: 'Locked Note',
      content: '{}',
      tags: [],
      folderId: 'folder-1',
      pinned: false,
      favorited: true,
      locked: true,
      hidden: true,
      deletedAt: 12345,
      createdAt: 1000,
      updatedAt: 2000,
    }

    const result = injectNoteDefaults(note)

    expect(result.locked).toBe(true)
    expect(result.hidden).toBe(true)
    expect(result.deletedAt).toBe(12345)
    expect(result.folderId).toBe('folder-1')
    expect(result.favorited).toBe(true)
  })

  it('ensures tags is always an array', () => {
    const legacy: Record<string, unknown> = {
      id: 'note-3',
      title: 'No Tags',
      content: '{}',
      pinned: false,
      favorited: false,
      createdAt: 1000,
      updatedAt: 2000,
    }

    const result = injectNoteDefaults(legacy)
    expect(result.tags).toEqual([])
  })

  it('ensures pinned and favorited are booleans', () => {
    const legacy: Record<string, unknown> = {
      id: 'note-4',
      title: 'Bad Types',
      content: '{}',
      tags: [],
      createdAt: 1000,
      updatedAt: 2000,
    }

    const result = injectNoteDefaults(legacy)
    expect(result.pinned).toBe(false)
    expect(result.favorited).toBe(false)
  })
})

describe('createWelcomeNote', () => {
  it('creates a note with expected structure', () => {
    const note = createWelcomeNote()

    expect(note.id).toBeDefined()
    expect(note.id.length).toBeGreaterThan(0)
    expect(note.title).toBe('欢迎使用拾墨 ✨')
    expect(note.tags).toEqual([])
    expect(note.folderId).toBeNull()
    expect(note.pinned).toBe(false)
    expect(note.favorited).toBe(false)
    expect(note.locked).toBe(false)
    expect(note.hidden).toBe(false)
    expect(note.deletedAt).toBeNull()
    expect(note.createdAt).toBeGreaterThan(0)
    expect(note.updatedAt).toBe(note.createdAt)
  })

  it('creates valid TipTap JSON content', () => {
    const note = createWelcomeNote()
    const content = JSON.parse(note.content)

    expect(content.type).toBe('doc')
    expect(Array.isArray(content.content)).toBe(true)
    expect(content.content.length).toBeGreaterThan(0)
    // First node should be a heading
    expect(content.content[0].type).toBe('heading')
  })

  it('generates unique IDs on each call', () => {
    const note1 = createWelcomeNote()
    const note2 = createWelcomeNote()
    expect(note1.id).not.toBe(note2.id)
  })
})

describe('loadPersistedState', () => {
  let localStorageStore: Record<string, string>

  beforeEach(() => {
    localStorageStore = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => localStorageStore[key] ?? null,
      setItem: (key: string, value: string) => { localStorageStore[key] = value },
      removeItem: (key: string) => { delete localStorageStore[key] },
    })
    mockedIdbGet.mockReset()
    mockedMigrate.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads state from IndexedDB when available', async () => {
    const notes = [makeNote({ id: 'n1' }), makeNote({ id: 'n2' })]
    mockedIdbGet.mockResolvedValue({ notes, theme: 'dark', activeTag: 'work' })

    const state = await loadPersistedState()

    expect(state.notes).toHaveLength(2)
    expect(state.theme).toBe('dark')
    expect(state.activeTag).toBe('work')
    expect(mockedMigrate).not.toHaveBeenCalled()
  })

  it('falls back to localStorage migration when IndexedDB is empty', async () => {
    const notes = [makeNote({ id: 'migrated-1' })]
    mockedIdbGet.mockResolvedValue(null)
    mockedMigrate.mockResolvedValue({ notes, theme: 'light', activeTag: null })

    const state = await loadPersistedState()

    expect(state.notes).toHaveLength(1)
    expect(state.notes[0].id).toBe('migrated-1')
    expect(mockedMigrate).toHaveBeenCalledWith('shimo-state')
  })

  it('injects defaults on notes loaded from IndexedDB', async () => {
    const legacyNote = { id: 'legacy-1', title: 'Old', content: '{}', tags: [], pinned: false, favorited: false, createdAt: 1000, updatedAt: 2000 }
    mockedIdbGet.mockResolvedValue({ notes: [legacyNote], theme: 'light', activeTag: null })

    const state = await loadPersistedState()

    expect(state.notes[0].locked).toBe(false)
    expect(state.notes[0].hidden).toBe(false)
    expect(state.notes[0].deletedAt).toBeNull()
    expect(state.notes[0].folderId).toBeNull()
  })

  it('injects defaults on notes migrated from localStorage', async () => {
    const legacyNote = { id: 'legacy-2', title: 'Migrated', content: '{}', tags: [], pinned: true, favorited: false, createdAt: 1000, updatedAt: 2000 }
    mockedIdbGet.mockResolvedValue(null)
    mockedMigrate.mockResolvedValue({ notes: [legacyNote], theme: 'dark', activeTag: null })

    const state = await loadPersistedState()

    expect(state.notes[0].locked).toBe(false)
    expect(state.notes[0].hidden).toBe(false)
    expect(state.notes[0].deletedAt).toBeNull()
    expect(state.notes[0].folderId).toBeNull()
    expect(state.notes[0].pinned).toBe(true)
  })

  it('creates a welcome note on first launch', async () => {
    mockedIdbGet.mockResolvedValue(null)
    mockedMigrate.mockResolvedValue(null)

    const state = await loadPersistedState()

    expect(state.notes).toHaveLength(1)
    expect(state.notes[0].title).toBe('欢迎使用拾墨 ✨')
    expect(state.theme).toBe('light')
    // Welcome flag should be set
    expect(localStorageStore['shimo-welcome-shown']).toBe('1')
  })

  it('does not create welcome note if welcome flag already set', async () => {
    localStorageStore['shimo-welcome-shown'] = '1'
    mockedIdbGet.mockResolvedValue(null)
    mockedMigrate.mockResolvedValue(null)

    const state = await loadPersistedState()

    expect(state.notes).toHaveLength(0)
  })

  it('defaults theme to light when not present in persisted data', async () => {
    const notes = [makeNote()]
    mockedIdbGet.mockResolvedValue({ notes })

    const state = await loadPersistedState()

    expect(state.theme).toBe('light')
  })

  it('defaults activeTag to null when not present in persisted data', async () => {
    const notes = [makeNote()]
    mockedIdbGet.mockResolvedValue({ notes })

    const state = await loadPersistedState()

    expect(state.activeTag).toBeNull()
  })
})
