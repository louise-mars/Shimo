/**
 * Legacy sync queue migration.
 *
 * Parses and converts existing offline delete operations stored in localStorage
 * (from older app versions) into the unified OfflineQueue format.
 *
 * Legacy keys checked: 'shimo-offline-deletes', 'offline-delete-queue', 'pendingDeletes'
 * Legacy format: JSON array of objects like { noteId: string, deletedAt: number }
 *
 * Requirements: 27.6
 */

import { OfflineQueue } from './OfflineQueue'
import type { SyncOpType } from '../store/types'

/** Keys used by older versions to store offline delete operations */
const LEGACY_KEYS = [
  'shimo-offline-deletes',
  'offline-delete-queue',
  'pendingDeletes',
] as const

/** Shape of a legacy offline delete entry */
interface LegacyDeleteEntry {
  noteId?: string
  id?: string
  entityId?: string
  deletedAt?: number
  timestamp?: number
}

export interface LegacySyncMigrationResult {
  migrated: number
  skipped: number
}

/**
 * Migrate legacy offline delete queues into the unified OfflineQueue.
 *
 * This function is idempotent — if no legacy keys exist, it returns { migrated: 0, skipped: 0 }.
 * After successful migration, the legacy localStorage keys are removed.
 */
export function migrateLegacySyncQueue(queue?: OfflineQueue): LegacySyncMigrationResult {
  const offlineQueue = queue ?? new OfflineQueue()
  let migrated = 0
  let skipped = 0

  for (const key of LEGACY_KEYS) {
    const raw = readLegacyKey(key)
    if (raw === null) continue

    const entries = parseLegacyEntries(raw)
    if (entries === null) {
      // Unparseable data — skip and remove the key
      skipped++
      removeLegacyKey(key)
      continue
    }

    for (const entry of entries) {
      const entityId = extractEntityId(entry)
      if (!entityId) {
        skipped++
        continue
      }

      const type: SyncOpType = 'delete_note'
      offlineQueue.enqueue({
        type,
        entityId,
        payload: entry.deletedAt != null || entry.timestamp != null
          ? { deletedAt: entry.deletedAt ?? entry.timestamp }
          : undefined,
      })
      migrated++
    }

    // Remove legacy key after successful migration
    removeLegacyKey(key)
  }

  return { migrated, skipped }
}

/**
 * Read a legacy localStorage key, returning null if not found or unavailable.
 */
function readLegacyKey(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Remove a legacy localStorage key.
 */
function removeLegacyKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Silently ignore — localStorage may be unavailable
  }
}

/**
 * Parse raw JSON string into an array of legacy delete entries.
 * Returns null if parsing fails or the result is not an array.
 */
function parseLegacyEntries(raw: string): LegacyDeleteEntry[] | null {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Extract the entity ID from a legacy delete entry.
 * Supports multiple field names used across legacy versions.
 */
function extractEntityId(entry: LegacyDeleteEntry): string | null {
  if (typeof entry !== 'object' || entry === null) return null
  // Try known field names in priority order
  if (typeof entry.noteId === 'string' && entry.noteId) return entry.noteId
  if (typeof entry.entityId === 'string' && entry.entityId) return entry.entityId
  if (typeof entry.id === 'string' && entry.id) return entry.id
  return null
}
