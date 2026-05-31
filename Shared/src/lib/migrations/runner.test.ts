import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  runMigrations,
  getMigrationState,
  isSafeModeActive,
  getSafeModeError,
  resetSafeMode,
} from './runner'
import type { Migration } from './runner'
import { idbGet, idbSet, _resetStorageState } from '../storage/indexedDB'

// Mock IndexedDB using a simple in-memory store
const mockStore = new Map<string, unknown>()

vi.mock('../storage/indexedDB', () => ({
  idbGet: vi.fn(async <T>(key: string): Promise<T | null> => {
    return (mockStore.get(key) as T) ?? null
  }),
  idbSet: vi.fn(async (key: string, value: unknown): Promise<void> => {
    mockStore.set(key, value)
  }),
  idbDelete: vi.fn(async (key: string): Promise<void> => {
    mockStore.delete(key)
  }),
  isStorageAvailable: vi.fn(() => true),
  _resetStorageState: vi.fn(),
}))

describe('Migration Runner', () => {
  beforeEach(() => {
    mockStore.clear()
    resetSafeMode()
    vi.clearAllMocks()
  })

  describe('runMigrations', () => {
    it('should return success with current version when no migrations are pending', async () => {
      const result = await runMigrations([])
      expect(result.success).toBe(true)
      expect(result.newVersion).toBe(0)
    })

    it('should run a single migration successfully', async () => {
      const migration: Migration = {
        version: 1,
        name: 'add_locked_field',
        up: async (ctx) => {
          const notes = (await ctx.get<Array<Record<string, unknown>>>('notes')) ?? []
          const updated = notes.map((n) => ({ ...n, locked: false }))
          await ctx.set('notes', updated)
        },
        down: async (ctx) => {
          const notes = (await ctx.get<Array<Record<string, unknown>>>('notes')) ?? []
          const updated = notes.map((n) => {
            const { locked: _, ...rest } = n
            return rest
          })
          await ctx.set('notes', updated)
        },
      }

      // Set up initial state
      mockStore.set('notes', [{ id: '1', title: 'Test' }])

      const result = await runMigrations([migration])

      expect(result.success).toBe(true)
      expect(result.newVersion).toBe(1)

      // Verify the migration was applied
      const notes = mockStore.get('notes') as Array<Record<string, unknown>>
      expect(notes[0].locked).toBe(false)

      // Verify migration state was updated
      const state = await getMigrationState()
      expect(state.currentVersion).toBe(1)
      expect(state.appliedMigrations).toHaveLength(1)
      expect(state.appliedMigrations[0].name).toBe('add_locked_field')
    })

    it('should run multiple migrations sequentially in version order', async () => {
      const executionOrder: number[] = []

      const migrations: Migration[] = [
        {
          version: 2,
          name: 'second',
          up: async () => { executionOrder.push(2) },
          down: async () => {},
        },
        {
          version: 1,
          name: 'first',
          up: async () => { executionOrder.push(1) },
          down: async () => {},
        },
        {
          version: 3,
          name: 'third',
          up: async () => { executionOrder.push(3) },
          down: async () => {},
        },
      ]

      const result = await runMigrations(migrations)

      expect(result.success).toBe(true)
      expect(result.newVersion).toBe(3)
      expect(executionOrder).toEqual([1, 2, 3])
    })

    it('should skip already-applied migrations', async () => {
      // Set current version to 2
      mockStore.set('migration_state', {
        currentVersion: 2,
        appliedMigrations: [
          { version: 1, name: 'first', appliedAt: 1000 },
          { version: 2, name: 'second', appliedAt: 2000 },
        ],
      })

      const executionOrder: number[] = []

      const migrations: Migration[] = [
        {
          version: 1,
          name: 'first',
          up: async () => { executionOrder.push(1) },
          down: async () => {},
        },
        {
          version: 2,
          name: 'second',
          up: async () => { executionOrder.push(2) },
          down: async () => {},
        },
        {
          version: 3,
          name: 'third',
          up: async () => { executionOrder.push(3) },
          down: async () => {},
        },
      ]

      const result = await runMigrations(migrations)

      expect(result.success).toBe(true)
      expect(result.newVersion).toBe(3)
      // Only migration 3 should have run
      expect(executionOrder).toEqual([3])
    })

    it('should rollback and activate Safe Mode on migration failure', async () => {
      // Set up initial state
      mockStore.set('notes', [{ id: '1', title: 'Original' }])

      const migrations: Migration[] = [
        {
          version: 1,
          name: 'failing_migration',
          up: async (ctx) => {
            // Modify state then throw
            await ctx.set('notes', [{ id: '1', title: 'Modified' }])
            throw new Error('Something went wrong')
          },
          down: async () => {},
        },
      ]

      const result = await runMigrations(migrations)

      expect(result.success).toBe(false)
      expect(result.newVersion).toBe(0)
      expect(result.error).toContain('failing_migration')
      expect(result.error).toContain('Something went wrong')
      expect(result.error).toContain('Safe Mode activated')
      expect(result.failedMigration).toBe('failing_migration')

      // Verify Safe Mode is active
      expect(isSafeModeActive()).toBe(true)
      expect(getSafeModeError()).toContain('failing_migration')

      // Verify state was rolled back (backup was created before the migration ran,
      // so the original state should be restored)
      const notes = mockStore.get('notes') as Array<Record<string, unknown>>
      expect(notes[0].title).toBe('Original')
    })

    it('should rollback to pre-migration state when second migration fails', async () => {
      mockStore.set('notes', [{ id: '1', title: 'Original' }])

      const migrations: Migration[] = [
        {
          version: 1,
          name: 'success_migration',
          up: async (ctx) => {
            await ctx.set('notes', [{ id: '1', title: 'After V1' }])
          },
          down: async () => {},
        },
        {
          version: 2,
          name: 'failing_migration',
          up: async (ctx) => {
            await ctx.set('notes', [{ id: '1', title: 'After V2 - should rollback' }])
            throw new Error('V2 failed')
          },
          down: async () => {},
        },
      ]

      const result = await runMigrations(migrations)

      expect(result.success).toBe(false)
      expect(result.failedMigration).toBe('failing_migration')

      // The rollback should restore to the state before v2 ran
      // (which is after v1 succeeded, since v1's backup was cleaned up)
      // Actually, the backup for v2 captures state AFTER v1 succeeded
      const notes = mockStore.get('notes') as Array<Record<string, unknown>>
      expect(notes[0].title).toBe('After V1')

      // Safe Mode should be active
      expect(isSafeModeActive()).toBe(true)
    })

    it('should create backup before each migration', async () => {
      mockStore.set('notes', [{ id: '1', title: 'Before' }])

      const migrations: Migration[] = [
        {
          version: 1,
          name: 'test_backup',
          up: async (ctx) => {
            await ctx.set('notes', [{ id: '1', title: 'After' }])
          },
          down: async () => {},
        },
      ]

      await runMigrations(migrations)

      // After success, backup should be cleaned up
      const backup = mockStore.get('migration_backup_v1')
      expect(backup).toBeUndefined()
    })
  })

  describe('Safe Mode', () => {
    it('should not be active initially', () => {
      expect(isSafeModeActive()).toBe(false)
      expect(getSafeModeError()).toBeNull()
    })

    it('should be resettable', async () => {
      // Trigger Safe Mode via a failing migration
      const migrations: Migration[] = [
        {
          version: 1,
          name: 'fail',
          up: async () => { throw new Error('fail') },
          down: async () => {},
        },
      ]

      await runMigrations(migrations)
      expect(isSafeModeActive()).toBe(true)

      resetSafeMode()
      expect(isSafeModeActive()).toBe(false)
      expect(getSafeModeError()).toBeNull()
    })
  })

  describe('getMigrationState', () => {
    it('should return default state when no migrations have been applied', async () => {
      const state = await getMigrationState()
      expect(state.currentVersion).toBe(0)
      expect(state.appliedMigrations).toEqual([])
    })

    it('should return stored state when migrations have been applied', async () => {
      const storedState = {
        currentVersion: 3,
        appliedMigrations: [
          { version: 1, name: 'first', appliedAt: 1000 },
          { version: 2, name: 'second', appliedAt: 2000 },
          { version: 3, name: 'third', appliedAt: 3000 },
        ],
      }
      mockStore.set('migration_state', storedState)

      const state = await getMigrationState()
      expect(state.currentVersion).toBe(3)
      expect(state.appliedMigrations).toHaveLength(3)
    })
  })
})
