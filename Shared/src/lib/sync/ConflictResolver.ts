/**
 * ConflictResolver — Layer 2 of the three-layer sync architecture.
 *
 * Provides a swappable conflict resolution strategy. The current implementation
 * uses Last-Write-Wins (LWW) based on updatedAt timestamps, with explicit
 * conflict copy creation when both local and remote have diverged.
 *
 * The IConflictResolver interface enables future migration to CRDT-based merge
 * (e.g., Yjs) without changing the sync protocol or storage schema.
 *
 * Requirements: 10.3, 10.4, 10.5, 10.12
 */

import { v4 as uuid } from 'uuid'
import type { Note } from '../../types'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Result of resolving a conflict between local and remote versions of a note */
export interface ConflictResult {
  /** The winning note (merged result to keep as the canonical version) */
  winner: Note
  /** A conflict copy of the losing version, or null if no true conflict */
  conflictCopy: Note | null
  /** How the conflict was resolved */
  resolution: 'local_wins' | 'remote_wins' | 'conflict_copy_created'
}

// ─── Interface ───────────────────────────────────────────────────────────────

/**
 * Strategy interface for conflict resolution.
 * Implementations decide how to merge divergent local and remote note versions.
 */
export interface IConflictResolver {
  /**
   * Resolve a conflict between local and remote versions of a note.
   *
   * @param local - The local version of the note
   * @param remote - The remote version of the note
   * @returns ConflictResult with the winner and optional conflict copy
   */
  resolve(local: Note, remote: Note): ConflictResult
}

// ─── LWW Implementation ──────────────────────────────────────────────────────

/**
 * Last-Write-Wins conflict resolver with conflict copy creation.
 *
 * Resolution logic:
 * - If only one side has changed content (content matches or timestamps equal),
 *   take the newer version — no conflict copy needed.
 * - If both sides have diverged (different content AND different updatedAt),
 *   apply LWW (higher updatedAt wins) and create a conflict copy of the loser.
 *
 * In all cases, local pin/favorite metadata is preserved on the winner,
 * since these are device-local preferences that should not be overwritten by sync.
 *
 * Conflict copy title format: `{title}_冲突副本_{YYYYMMDD}`
 */
export class LWWConflictResolver implements IConflictResolver {
  resolve(local: Note, remote: Note): ConflictResult {
    const bothModified =
      local.content !== remote.content &&
      local.updatedAt !== remote.updatedAt

    if (!bothModified) {
      // No true conflict — take the newer version, preserve local metadata
      if (local.updatedAt >= remote.updatedAt) {
        return {
          winner: local,
          conflictCopy: null,
          resolution: 'local_wins',
        }
      }
      // Remote is newer — merge remote content with local pin/favorite
      const winner: Note = {
        ...remote,
        pinned: local.pinned,
        favorited: local.favorited,
      }
      return {
        winner,
        conflictCopy: null,
        resolution: 'remote_wins',
      }
    }

    // True conflict: both sides modified since last sync
    // LWW picks the winner based on updatedAt
    const localWins = local.updatedAt >= remote.updatedAt

    // Winner gets local pin/favorite metadata preserved
    const winner: Note = localWins
      ? { ...local }
      : { ...remote, pinned: local.pinned, favorited: local.favorited }

    // Loser becomes the conflict copy
    const loser = localWins ? remote : local

    const conflictCopy: Note = {
      ...loser,
      id: uuid(),
      title: formatConflictTitle(loser.title),
      conflictSourceId: winner.id,
      pinned: false,
      favorited: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    return {
      winner,
      conflictCopy,
      resolution: 'conflict_copy_created',
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Format a conflict copy title: `{title}_冲突副本_{YYYYMMDD}`
 * Uses '无标题' as fallback for empty titles.
 */
export function formatConflictTitle(originalTitle: string): string {
  const title = originalTitle || '无标题'
  const date = formatDateYYYYMMDD(new Date())
  return `${title}_冲突副本_${date}`
}

/**
 * Format a Date as YYYYMMDD string.
 */
function formatDateYYYYMMDD(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}
