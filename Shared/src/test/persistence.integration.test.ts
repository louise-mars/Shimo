/**
 * Integration tests for persistence round-trip
 *
 * Tests the full persistence lifecycle:
 * 1. Persist and reload: setupPersistence → IndexedDB → loadPersistedState
 * 2. localStorage migration: legacy data → loadPersistedState → IndexedDB + defaults
 * 3. Migration runner: define migrations, run, verify state + rollback + Safe Mode
 *
 * Validates: Requirements 3.1, 3.5, 27.1, 27.4
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { idbGet, idbSet, _resetStorageState, cancelDebouncedPersist } from '../lib/storage/indexedDB'
import { loadPersistedState, injectNoteDefaults, createWelcomeNote } from '../lib/storage/stateLoader'
import {
  runMigrations,
  getMigrationState,
  isSafeModeActive,
  resetSafeMode,
  type Migration,
} from '../lib/migrations/runner'
import { setupPersistence, type StoreInstance } from '../lib/integration/persistence'
import type { AppStore } from '../lib/store/types'
import type { Note } from '../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNote(overrides: Partial<Note> = {}): Note {
  const now = Date.now()
  return {
    id: `note-${Math.random().toString(36).slice(2, 10)}`,
    title: 'Test Note',
    content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] }),
    tags: ['test'],
    folderId: null,
    pinned: false,
    favorited: false,
    locked: false,
    hidden: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

/**
 * Create a minimal mock store that supports subscribeWithSelector-style subscribe.
 * The subscribe method supports both full-state listeners and selector-based listeners.
 */
function createMockStore(initialState: Partial<AppStore>): StoreInstance & { setState: (updater: (state: AppStore) => Partial<AppStore>) => void } {
  let state = {
    notes: [],
    folders: [],
    theme: 'light' as const,
    activeTag: null,
    activeNoteId: null,
    activeFolderId: null,
    syncStatus: 'idle' as const,
    lastSyncAt: null,
    syncError: null,
    searchQuery: '',
    sidebarVisible: true,
    noteListVisible: true,
    noteListWidth: 300,
    immersiveMode: false,
    ...initialState,
  } as AppStore

  type SelectorListener<T> = {
    selector: (s: AppStore) => T
    listener: (value: T, prevValue: T) => void
    options?: { equalityFn?: (a: T, b: T) => boolean; fireImmediately?: boolean }
  }

  const selectorListeners: SelectorListener<unknown>[] = []

  const store: StoreInstance & { setState: (updater: (state: AppStore) => Partial<AppStore>) => void } = {
    getState: () => state,
    subscribe: ((
      selectorOrListener: unknown,
      listenerOrOptions?: unknown,
      options?: unknown
    ) => {
      if (typeof selectorOrListener === 'function' && typeof listenerOrOptions === 'function') {
        // Selector-based subscribe: subscribe(selector, listener, options?)
        const entry: SelectorListener<unknown> = {
          selector: selectorOrListener as (s: AppStore) => unknown,
          listener: listenerOrOptions as (value: unknown, prevValue: unknown) => void,
          options: options as { equalityFn?: (a: unknown, b: unknown) => boolean; fireImmediately?: boolean } | undefined,
        }
        selectorListeners.push(entry)

        if (entry.options?.fireImmediately) {
          const currentValue = entry.selector(state)
          entry.listener(currentValue, currentValue)
        }

        return () => {
          const idx = selectorListeners.indexOf(entry)
          if (idx >= 0) selectorListeners.splice(idx, 1)
        }
      }
      // Full-state subscribe (not used in persistence but included for completeness)
      return () => {}
    }) as StoreInstance['subscribe'],
    setState: (updater: (state: AppStore) => Partial<AppStore>) => {
      const prevState = state
      const updates = updater(state)
      state = { ...state, ...updates } as AppStore

      // Notify selector listeners
      for (const entry of selectorListeners) {
        const prevValue = entry.selector(prevState)
        const newValue = entry.selector(state)
        const eq = entry.options?.equalityFn ?? Object.is
        if (!eq(prevValue, newValue)) {
          entry.listener(newValue, prevValue)
        }
      }
    },
  }

  return store
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset IndexedDB state and module-level caches
  _resetStorageState()
  resetSafeMode()
  // Clear localStorage
  localStorage.clear()
  // Clear all IndexedDB databases
  indexedDB = new IDBFactory()
})

afterEach(() => {
  // Cancel any pending debounced persists
  cancelDebouncedPersist('shimo-notes')
  cancelDebouncedPersist('shimo-folders')
  cancelDebouncedPersist('shimo-theme')
  cancelDebouncedPersist('shimo-activeTag')
  vi.restoreAllMocks()
})

// ─── Test Suite 1: Persist and Reload ────────────────────────────────────────

describe('Persistence round-trip: setupPersistence → IndexedDB → loadPersistedState', () => {
  it('persists notes to IndexedDB and reloads them via loadPersistedState', async () => {
    const note1 = makeNote({ id: 'note-1', title: 'First Note', tags: ['work'] })
    const note2 = makeNote({ id: 'note-2', title: 'Second Note', tags: ['personal'] })

    // Directly persist state to IndexedDB (simulating what debouncedPersist does after flush)
    await idbSet('shimo-state', {
      notes: [note1, note2],
      theme: 'dark',
      activeTag: 'work',
    })

    // Reload via loadPersistedState
    const loaded = await loadPersistedState()

    expect(loaded.notes).toHaveLength(2)
    expect(loaded.notes[0].id).toBe('note-1')
    expect(loaded.notes[0].title).toBe('First Note')
    expect(loaded.notes[1].id).toBe('note-2')
    expect(loaded.theme).toBe('dark')
    expect(loaded.activeTag).toBe('work')
  })

  it('setupPersistence subscribes to store changes and triggers debounced persist', async () => {
    const note = makeNote({ id: 'note-persist', title: 'Persist Me' })
    const store = createMockStore({ notes: [note] })

    // Wire up persistence
    const cleanup = setupPersistence(store)

    // Simulate a note update by changing state
    const updatedNote = { ...note, title: 'Updated Title', updatedAt: Date.now() + 1000 }
    store.setState(() => ({ notes: [updatedNote] }))

    // The debounced persist uses a 500ms timer — advance timers
    vi.useFakeTimers()
    // Re-trigger the state change with fake timers active
    store.setState(() => ({ notes: [{ ...updatedNote, updatedAt: Date.now() + 2000 }] }))
    await vi.advanceTimersByTimeAsync(600)
    vi.useRealTimers()

    // Verify the data was persisted to IndexedDB
    const persisted = await idbGet<Note[]>('shimo-notes')
    expect(persisted).toBeDefined()
    expect(persisted![0].title).toBe('Updated Title')

    cleanup()
  })

  it('persists theme changes to IndexedDB', async () => {
    const store = createMockStore({ theme: 'light' })

    const cleanup = setupPersistence(store)

    vi.useFakeTimers()
    store.setState(() => ({ theme: 'dark' as const }))
    await vi.advanceTimersByTimeAsync(600)
    vi.useRealTimers()

    const persisted = await idbGet<string>('shimo-theme')
    expect(persisted).toBe('dark')

    cleanup()
  })

  it('round-trips notes with all fields intact', async () => {
    const note = makeNote({
      id: 'note-full',
      title: '完整笔记',
      tags: ['标签1', '标签2'],
      folderId: 'folder-1',
      pinned: true,
      favorited: true,
      locked: true,
      hidden: false,
      deletedAt: null,
    })

    await idbSet('shimo-state', {
      notes: [note],
      theme: 'light',
      activeTag: null,
    })

    const loaded = await loadPersistedState()
    const loadedNote = loaded.notes[0]

    expect(loadedNote.id).toBe('note-full')
    expect(loadedNote.title).toBe('完整笔记')
    expect(loadedNote.tags).toEqual(['标签1', '标签2'])
    expect(loadedNote.folderId).toBe('folder-1')
    expect(loadedNote.pinned).toBe(true)
    expect(loadedNote.favorited).toBe(true)
    expect(loadedNote.locked).toBe(true)
    expect(loadedNote.hidden).toBe(false)
    expect(loadedNote.deletedAt).toBeNull()
  })
})

// ─── Test Suite 2: localStorage Migration ────────────────────────────────────

describe('localStorage migration path', () => {
  it('migrates data from localStorage to IndexedDB when no IndexedDB data exists', async () => {
    const legacyNote = {
      id: 'legacy-1',
      title: 'Legacy Note',
      content: '{"type":"doc","content":[]}',
      tags: ['old'],
      createdAt: 1000000,
      updatedAt: 1000000,
    }

    // Set up legacy data in localStorage under the state key
    localStorage.setItem('shimo-state', JSON.stringify({
      notes: [legacyNote],
      theme: 'dark',
      activeTag: 'old',
    }))

    // loadPersistedState should find no IndexedDB data and migrate from localStorage
    const loaded = await loadPersistedState()

    expect(loaded.notes).toHaveLength(1)
    expect(loaded.notes[0].id).toBe('legacy-1')
    expect(loaded.notes[0].title).toBe('Legacy Note')
    expect(loaded.theme).toBe('dark')
    expect(loaded.activeTag).toBe('old')
  })

  it('injects default values for missing schema fields during migration', async () => {
    // Legacy note missing locked, hidden, deletedAt, folderId fields
    const legacyNote = {
      id: 'legacy-2',
      title: 'Old Format Note',
      content: '{"type":"doc","content":[]}',
      tags: ['migrated'],
      createdAt: 1000000,
      updatedAt: 1000000,
      pinned: true,
      favorited: false,
      // Missing: locked, hidden, deletedAt, folderId
    }

    localStorage.setItem('shimo-state', JSON.stringify({
      notes: [legacyNote],
      theme: 'light',
      activeTag: null,
    }))

    const loaded = await loadPersistedState()
    const note = loaded.notes[0]

    // Verify defaults were injected
    expect(note.locked).toBe(false)
    expect(note.hidden).toBe(false)
    expect(note.deletedAt).toBeNull()
    expect(note.folderId).toBeNull()
    // Existing fields preserved
    expect(note.pinned).toBe(true)
    expect(note.favorited).toBe(false)
    expect(note.tags).toEqual(['migrated'])
  })

  it('injects defaults for notes with missing tags array', async () => {
    const legacyNote = {
      id: 'legacy-3',
      title: 'No Tags Note',
      content: '{"type":"doc","content":[]}',
      createdAt: 1000000,
      updatedAt: 1000000,
      // Missing: tags (not an array)
    }

    localStorage.setItem('shimo-state', JSON.stringify({
      notes: [legacyNote],
      theme: 'light',
      activeTag: null,
    }))

    const loaded = await loadPersistedState()
    const note = loaded.notes[0]

    expect(note.tags).toEqual([])
    expect(note.pinned).toBe(false)
    expect(note.favorited).toBe(false)
  })

  it('marks migration as complete in localStorage', async () => {
    localStorage.setItem('shimo-state', JSON.stringify({
      notes: [makeNote({ id: 'migrate-test' })],
      theme: 'light',
      activeTag: null,
    }))

    await loadPersistedState()

    // The migrateFromLocalStorage function sets a '-migrated' flag
    expect(localStorage.getItem('shimo-state-migrated')).toBe('1')
  })

  it('creates a welcome note on first launch with no data', async () => {
    // No localStorage data, no IndexedDB data, no welcome flag
    const loaded = await loadPersistedState()

    expect(loaded.notes).toHaveLength(1)
    expect(loaded.notes[0].title).toBe('欢迎使用拾墨 ✨')
    expect(loaded.notes[0].id).toBeDefined()
    expect(loaded.notes[0].locked).toBe(false)
    expect(loaded.notes[0].hidden).toBe(false)
    expect(loaded.notes[0].deletedAt).toBeNull()
    expect(loaded.notes[0].folderId).toBeNull()
  })
})

// ─── Test Suite 3: Migration Runner ──────────────────────────────────────────

describe('Migration runner with rollback', () => {
  it('runs a successful migration and updates state', async () => {
    // Seed some initial data
    await idbSet('notes', [makeNote({ id: 'pre-migration' })])

    const testMigration: Migration = {
      version: 1,
      name: 'add-color-field',
      up: async (ctx) => {
        const notes = await ctx.get<Note[]>('notes')
        if (notes) {
          const updated = notes.map((n) => ({ ...n, color: 'default' }))
          await ctx.set('notes', updated)
        }
      },
      down: async (ctx) => {
        const notes = await ctx.get<Record<string, unknown>[]>('notes')
        if (notes) {
          const reverted = notes.map((n) => {
            const { color, ...rest } = n as Record<string, unknown> & { color?: string }
            return rest
          })
          await ctx.set('notes', reverted)
        }
      },
    }

    const result = await runMigrations([testMigration])

    expect(result.success).toBe(true)
    expect(result.newVersion).toBe(1)

    // Verify the migration was applied
    const notes = await idbGet<Array<Record<string, unknown>>>('notes')
    expect(notes![0].color).toBe('default')

    // Verify migration state was updated
    const migState = await getMigrationState()
    expect(migState.currentVersion).toBe(1)
    expect(migState.appliedMigrations).toHaveLength(1)
    expect(migState.appliedMigrations[0].name).toBe('add-color-field')
  })

  it('runs multiple migrations sequentially', async () => {
    await idbSet('notes', [makeNote({ id: 'multi-mig' })])

    const migrations: Migration[] = [
      {
        version: 1,
        name: 'add-color',
        up: async (ctx) => {
          const notes = await ctx.get<Record<string, unknown>[]>('notes')
          if (notes) {
            await ctx.set('notes', notes.map((n) => ({ ...n, color: 'blue' })))
          }
        },
        down: async (ctx) => {
          const notes = await ctx.get<Record<string, unknown>[]>('notes')
          if (notes) {
            await ctx.set('notes', notes.map(({ color, ...rest }) => rest))
          }
        },
      },
      {
        version: 2,
        name: 'add-priority',
        up: async (ctx) => {
          const notes = await ctx.get<Record<string, unknown>[]>('notes')
          if (notes) {
            await ctx.set('notes', notes.map((n) => ({ ...n, priority: 0 })))
          }
        },
        down: async (ctx) => {
          const notes = await ctx.get<Record<string, unknown>[]>('notes')
          if (notes) {
            await ctx.set('notes', notes.map(({ priority, ...rest }) => rest))
          }
        },
      },
    ]

    const result = await runMigrations(migrations)

    expect(result.success).toBe(true)
    expect(result.newVersion).toBe(2)

    const notes = await idbGet<Array<Record<string, unknown>>>('notes')
    expect(notes![0].color).toBe('blue')
    expect(notes![0].priority).toBe(0)

    const migState = await getMigrationState()
    expect(migState.currentVersion).toBe(2)
    expect(migState.appliedMigrations).toHaveLength(2)
  })

  it('skips already-applied migrations', async () => {
    // Simulate that version 1 was already applied
    await idbSet('migration_state', {
      currentVersion: 1,
      appliedMigrations: [{ version: 1, name: 'already-done', appliedAt: Date.now() }],
    })

    const migrations: Migration[] = [
      {
        version: 1,
        name: 'already-done',
        up: async () => { throw new Error('Should not run') },
        down: async () => {},
      },
      {
        version: 2,
        name: 'new-migration',
        up: async (ctx) => {
          await ctx.set('test-key', 'migrated-value')
        },
        down: async (ctx) => {
          await ctx.delete('test-key')
        },
      },
    ]

    const result = await runMigrations(migrations)

    expect(result.success).toBe(true)
    expect(result.newVersion).toBe(2)

    const value = await idbGet<string>('test-key')
    expect(value).toBe('migrated-value')
  })

  it('rolls back on migration failure and activates Safe Mode', async () => {
    const originalNotes = [makeNote({ id: 'rollback-test', title: 'Original' })]
    await idbSet('notes', originalNotes)

    const failingMigration: Migration = {
      version: 1,
      name: 'failing-migration',
      up: async (ctx) => {
        // Corrupt the data then throw
        await ctx.set('notes', [{ id: 'corrupted', title: 'Bad Data' }])
        throw new Error('Migration exploded!')
      },
      down: async (ctx) => {
        // This won't be called — rollback uses backup
      },
    }

    const result = await runMigrations([failingMigration])

    // Verify failure result
    expect(result.success).toBe(false)
    expect(result.newVersion).toBe(0)
    expect(result.error).toContain('failing-migration')
    expect(result.error).toContain('Migration exploded!')
    expect(result.failedMigration).toBe('failing-migration')

    // Verify Safe Mode is activated
    expect(isSafeModeActive()).toBe(true)

    // Verify rollback restored original data
    const notes = await idbGet<Note[]>('notes')
    expect(notes).toHaveLength(1)
    expect(notes![0].id).toBe('rollback-test')
    expect(notes![0].title).toBe('Original')

    // Verify migration state was NOT advanced
    const migState = await getMigrationState()
    expect(migState.currentVersion).toBe(0)
  })

  it('rolls back to pre-migration state when second migration fails', async () => {
    await idbSet('notes', [makeNote({ id: 'multi-rollback', title: 'Start' })])

    const migrations: Migration[] = [
      {
        version: 1,
        name: 'success-migration',
        up: async (ctx) => {
          const notes = await ctx.get<Record<string, unknown>[]>('notes')
          if (notes) {
            await ctx.set('notes', notes.map((n) => ({ ...n, migrated: true })))
          }
        },
        down: async () => {},
      },
      {
        version: 2,
        name: 'crash-migration',
        up: async () => {
          throw new Error('Crash on v2!')
        },
        down: async () => {},
      },
    ]

    const result = await runMigrations(migrations)

    // The first migration succeeds, but the second fails
    // Rollback restores to the state before v2 (which is after v1 succeeded)
    expect(result.success).toBe(false)
    expect(result.failedMigration).toBe('crash-migration')
    expect(isSafeModeActive()).toBe(true)

    // The migration state should reflect that v1 was applied (rollback restores backup before v2)
    // The backup for v2 was taken after v1 succeeded, so rollback restores post-v1 state
    const notes = await idbGet<Array<Record<string, unknown>>>('notes')
    expect(notes![0].migrated).toBe(true)
  })

  it('returns success with current version when no migrations are pending', async () => {
    await idbSet('migration_state', {
      currentVersion: 5,
      appliedMigrations: [],
    })

    const result = await runMigrations([
      { version: 3, name: 'old', up: async () => {}, down: async () => {} },
      { version: 5, name: 'current', up: async () => {}, down: async () => {} },
    ])

    expect(result.success).toBe(true)
    expect(result.newVersion).toBe(5)
    expect(isSafeModeActive()).toBe(false)
  })

  it('resetSafeMode clears the Safe Mode state', async () => {
    const failingMigration: Migration = {
      version: 1,
      name: 'trigger-safe-mode',
      up: async () => { throw new Error('fail') },
      down: async () => {},
    }

    await runMigrations([failingMigration])
    expect(isSafeModeActive()).toBe(true)

    resetSafeMode()
    expect(isSafeModeActive()).toBe(false)
  })
})

// ─── Test Suite 4: injectNoteDefaults unit verification ──────────────────────

describe('injectNoteDefaults', () => {
  it('injects all missing fields with defaults', () => {
    const legacy = {
      id: 'test',
      title: 'Test',
      content: '{}',
      createdAt: 1000,
      updatedAt: 1000,
    }

    const result = injectNoteDefaults(legacy)

    expect(result.locked).toBe(false)
    expect(result.hidden).toBe(false)
    expect(result.deletedAt).toBeNull()
    expect(result.folderId).toBeNull()
    expect(result.tags).toEqual([])
    expect(result.pinned).toBe(false)
    expect(result.favorited).toBe(false)
  })

  it('preserves existing field values', () => {
    const note = {
      id: 'test',
      title: 'Test',
      content: '{}',
      tags: ['existing'],
      folderId: 'folder-1',
      pinned: true,
      favorited: true,
      locked: true,
      hidden: true,
      deletedAt: 12345,
      createdAt: 1000,
      updatedAt: 1000,
    }

    const result = injectNoteDefaults(note)

    expect(result.locked).toBe(true)
    expect(result.hidden).toBe(true)
    expect(result.deletedAt).toBe(12345)
    expect(result.folderId).toBe('folder-1')
    expect(result.tags).toEqual(['existing'])
    expect(result.pinned).toBe(true)
    expect(result.favorited).toBe(true)
  })
})
