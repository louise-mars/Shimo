/**
 * Migration Runner for Shimo (拾墨)
 *
 * Executes sequential schema migrations on IndexedDB with:
 * - Version tracking (stored in IndexedDB 'state' store under 'migration_state' key)
 * - Backup creation before each migration (stored in 'migration_backup' object store)
 * - Rollback on failure
 * - Safe Mode flag export when migration fails (export-only UI)
 *
 * Requirements: 27.4, 27.5
 */

import { idbGet, idbSet } from '../storage/indexedDB'

// === Types ===

export interface Migration {
  /** Monotonically increasing version number */
  version: number
  /** Human-readable migration name */
  name: string
  /** Apply the migration (forward) */
  up: (context: MigrationContext) => Promise<void>
  /** Revert the migration (backward) — used for rollback */
  down: (context: MigrationContext) => Promise<void>
}

export interface MigrationContext {
  /** Read a value from the state store */
  get: <T>(key: string) => Promise<T | null>
  /** Write a value to the state store */
  set: (key: string, value: unknown) => Promise<void>
  /** Delete a value from the state store */
  delete: (key: string) => Promise<void>
}

export interface MigrationState {
  /** Current schema version (0 = no migrations applied) */
  currentVersion: number
  /** History of applied migrations */
  appliedMigrations: Array<{ version: number; name: string; appliedAt: number }>
}

export interface MigrationResult {
  /** Whether all pending migrations succeeded */
  success: boolean
  /** The schema version after running migrations */
  newVersion: number
  /** Error message if a migration failed */
  error?: string
  /** Name of the failed migration, if any */
  failedMigration?: string
}

// === Safe Mode State ===

let safeModeActive = false
let safeModeError: string | null = null

/**
 * Returns true if the application is in Safe Mode due to a migration failure.
 * When in Safe Mode, the UI should only allow data export (JSON backup).
 */
export function isSafeModeActive(): boolean {
  return safeModeActive
}

/**
 * Returns the error message that triggered Safe Mode, or null if not in Safe Mode.
 */
export function getSafeModeError(): string | null {
  return safeModeError
}

/**
 * Reset Safe Mode state. Used after the user has exported their data
 * or if a retry is attempted.
 */
export function resetSafeMode(): void {
  safeModeActive = false
  safeModeError = null
}

/**
 * Activate Safe Mode with an error message.
 * Called internally when a migration fails.
 */
function activateSafeMode(error: string): void {
  safeModeActive = true
  safeModeError = error
}

// === Migration State Management ===

const MIGRATION_STATE_KEY = 'migration_state'
const MIGRATION_BACKUP_KEY_PREFIX = 'migration_backup_v'

/**
 * Get the current migration state from IndexedDB.
 * Returns a default state (version 0) if no state exists.
 */
export async function getMigrationState(): Promise<MigrationState> {
  const state = await idbGet<MigrationState>(MIGRATION_STATE_KEY)
  return state ?? { currentVersion: 0, appliedMigrations: [] }
}

/**
 * Save the migration state to IndexedDB.
 */
async function saveMigrationState(state: MigrationState): Promise<void> {
  await idbSet(MIGRATION_STATE_KEY, state)
}

// === Backup & Restore ===

/**
 * Create a backup of the current state store contents before a migration.
 * Stores a snapshot of all state keys under a versioned backup key.
 */
async function createMigrationBackup(version: number): Promise<void> {
  const backupKey = `${MIGRATION_BACKUP_KEY_PREFIX}${version}`

  // Backup the critical state keys
  const notes = await idbGet<unknown>('notes')
  const folders = await idbGet<unknown>('folders')
  const theme = await idbGet<unknown>('theme')
  const activeTag = await idbGet<unknown>('activeTag')
  const migrationState = await idbGet<unknown>(MIGRATION_STATE_KEY)

  const backup = {
    notes,
    folders,
    theme,
    activeTag,
    migrationState,
    createdAt: Date.now(),
  }

  await idbSet(backupKey, backup)
}

/**
 * Restore state from a backup created before a specific migration version.
 * This is called when a migration fails to roll back to the pre-migration state.
 */
async function restoreFromBackup(version: number): Promise<void> {
  const backupKey = `${MIGRATION_BACKUP_KEY_PREFIX}${version}`
  const backup = await idbGet<Record<string, unknown>>(backupKey)

  if (!backup) {
    throw new Error(`No backup found for migration version ${version}`)
  }

  // Restore each key from the backup
  if (backup.notes !== undefined) await idbSet('notes', backup.notes)
  if (backup.folders !== undefined) await idbSet('folders', backup.folders)
  if (backup.theme !== undefined) await idbSet('theme', backup.theme)
  if (backup.activeTag !== undefined) await idbSet('activeTag', backup.activeTag)
  if (backup.migrationState !== undefined) {
    await idbSet(MIGRATION_STATE_KEY, backup.migrationState)
  }
}

/**
 * Clean up a backup after a successful migration.
 */
async function cleanupBackup(version: number): Promise<void> {
  const backupKey = `${MIGRATION_BACKUP_KEY_PREFIX}${version}`
  // We use idbSet with null to effectively remove the backup
  // (idbDelete would also work but idbSet(key, null) is simpler)
  const { idbDelete } = await import('../storage/indexedDB')
  await idbDelete(backupKey)
}

// === Migration Runner ===

/**
 * Run all pending migrations sequentially.
 *
 * For each pending migration:
 * 1. Creates a backup of the current state
 * 2. Executes the migration's `up` function
 * 3. Updates the migration state with the new version
 * 4. Cleans up the backup on success
 *
 * If any migration fails:
 * 1. Rolls back to the pre-migration backup
 * 2. Activates Safe Mode (export-only UI)
 * 3. Returns a failure result with error details
 *
 * @param migrations - Array of all available migrations (will be filtered and sorted)
 * @returns MigrationResult indicating success/failure and the resulting version
 */
export async function runMigrations(migrations: Migration[]): Promise<MigrationResult> {
  const state = await getMigrationState()
  const currentVersion = state.currentVersion

  // Filter to only pending migrations and sort by version ascending
  const pending = migrations
    .filter((m) => m.version > currentVersion)
    .sort((a, b) => a.version - b.version)

  // Nothing to do
  if (pending.length === 0) {
    return { success: true, newVersion: currentVersion }
  }

  // Create the migration context that migrations use to read/write state
  const context: MigrationContext = {
    get: <T>(key: string) => idbGet<T>(key),
    set: (key: string, value: unknown) => idbSet(key, value),
    delete: async (key: string) => {
      const { idbDelete } = await import('../storage/indexedDB')
      await idbDelete(key)
    },
  }

  // Execute each migration sequentially
  for (const migration of pending) {
    // Step 1: Create backup before this migration
    await createMigrationBackup(migration.version)

    try {
      // Step 2: Execute the migration
      await migration.up(context)

      // Step 3: Update migration state
      const updatedState: MigrationState = {
        currentVersion: migration.version,
        appliedMigrations: [
          ...state.appliedMigrations,
          {
            version: migration.version,
            name: migration.name,
            appliedAt: Date.now(),
          },
        ],
      }
      await saveMigrationState(updatedState)

      // Step 4: Clean up backup on success
      await cleanupBackup(migration.version)

      // Update local state reference for next iteration
      state.currentVersion = migration.version
      state.appliedMigrations = updatedState.appliedMigrations
    } catch (err) {
      // Migration failed — rollback and activate Safe Mode
      const errorMessage =
        err instanceof Error ? err.message : String(err)
      const fullError = `Migration "${migration.name}" (v${migration.version}) failed: ${errorMessage}. Rolled back to v${currentVersion}. Safe Mode activated.`

      try {
        await restoreFromBackup(migration.version)
      } catch (rollbackErr) {
        // If rollback also fails, we're in a bad state but still activate Safe Mode
        const rollbackError =
          rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)
        const combinedError = `${fullError} Additionally, rollback failed: ${rollbackError}`
        activateSafeMode(combinedError)
        return {
          success: false,
          newVersion: currentVersion,
          error: combinedError,
          failedMigration: migration.name,
        }
      }

      activateSafeMode(fullError)
      return {
        success: false,
        newVersion: currentVersion,
        error: fullError,
        failedMigration: migration.name,
      }
    }
  }

  const newVersion = pending[pending.length - 1].version
  return { success: true, newVersion }
}
