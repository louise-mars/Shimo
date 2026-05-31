/**
 * SyncEngine — Layer 1: Orchestration of the three-layer sync architecture.
 *
 * Manages the full sync lifecycle via a state machine:
 * Idle → Syncing → Pull → Merge → Push → ProcessQueue → Synced
 *
 * Features:
 * - Exponential backoff retry on failure (5s, 10s, 20s, 40s, 80s, max 5 retries)
 * - Active-editing buffering (buffers real-time updates for notes being edited)
 * - 10s debounced sync trigger on local changes
 * - Real-time subscription management
 *
 * Requirements: 10.1, 10.2, 10.4, 10.6, 10.7, 10.9
 */

import type { Note, Folder } from '../../types'
import type { SyncState, SyncStatus } from '../store/types'
import type { ISyncTransport } from './SyncTransport'
import type { IConflictResolver, ConflictResult } from './ConflictResolver'
import type { OfflineQueue } from './OfflineQueue'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SyncEngineConfig {
  /** Base backoff delay in ms (default: 5000) */
  backoffBaseMs: number
  /** Backoff multiplier (default: 2) */
  backoffMultiplier: number
  /** Maximum backoff delay in ms (default: 80000) */
  maxBackoffMs: number
  /** Maximum retry attempts (default: 5) */
  maxRetries: number
  /** Debounce delay for local changes in ms (default: 10000) */
  debounceMs: number
}

export interface SyncResult {
  notes: Note[]
  folders: Folder[]
  conflicts: ConflictResult[]
  errors: SyncError[]
}

export interface SyncError {
  entityId: string
  error: string
  retryable: boolean
}

/** Store interface that SyncEngine needs — minimal subset to avoid circular deps */
export interface ISyncEngineStore {
  notes: Note[]
  folders: Folder[]
  lastSyncAt: number | null
  mergeRemoteNotes: (remote: Note[]) => void
  mergeRemoteFolders: (remote: Folder[]) => void
  setSyncStatus: (status: SyncStatus) => void
  setSyncError: (error: string | null) => void
}

/** Listener for state changes */
export type SyncStateListener = (state: SyncState) => void

// ─── Default Config ──────────────────────────────────────────────────────────

const DEFAULT_CONFIG: SyncEngineConfig = {
  backoffBaseMs: 5000,
  backoffMultiplier: 2,
  maxBackoffMs: 80000,
  maxRetries: 5,
  debounceMs: 10000,
}

// ─── SyncEngine ──────────────────────────────────────────────────────────────

export class SyncEngine {
  private state: SyncState = 'Idle'
  private retryCount = 0
  private config: SyncEngineConfig

  // Timers
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  // Active editing buffering
  private activelyEditedNoteIds: Set<string> = new Set()
  private pendingRemoteUpdates: Map<string, Note> = new Map()

  // Real-time subscription
  private unsubscribe: (() => void) | null = null

  // User/auth state
  private userId: string | null = null
  private running = false

  // State change listeners
  private listeners: Set<SyncStateListener> = new Set()

  constructor(
    private transport: ISyncTransport,
    private resolver: IConflictResolver,
    private queue: OfflineQueue,
    private store: ISyncEngineStore,
    config?: Partial<SyncEngineConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Start the sync engine for a given user.
   * Sets up real-time subscription and performs initial sync.
   */
  start(userId: string): void {
    if (this.running && this.userId === userId) return

    this.userId = userId
    this.running = true
    this.retryCount = 0

    // Subscribe to real-time changes
    this.setupSubscription(userId)

    // Perform initial full sync
    this.triggerSync()
  }

  /**
   * Stop the sync engine. Cleans up timers and subscriptions.
   */
  stop(): void {
    this.running = false
    this.userId = null

    // Clear timers
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    // Unsubscribe from real-time
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }

    // Clear buffered updates
    this.pendingRemoteUpdates.clear()
    this.activelyEditedNoteIds.clear()

    this.transition('Idle')
  }

  /**
   * Trigger a sync cycle. If already syncing, the request is ignored.
   * Returns the sync result or null if sync was skipped.
   */
  async triggerSync(): Promise<SyncResult | null> {
    if (!this.running || !this.userId) return null
    if (this.state === 'Syncing' || this.state === 'PullPhase' ||
        this.state === 'MergePhase' || this.state === 'PushPhase' ||
        this.state === 'ProcessQueue') {
      return null // Already syncing
    }

    return this.executeSyncCycle()
  }

  /**
   * Notify the engine that a local change occurred.
   * Triggers a debounced sync after the configured delay (10s default).
   */
  notifyLocalChange(): void {
    if (!this.running || !this.userId) return

    // Reset debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.triggerSync()
    }, this.config.debounceMs)
  }

  /**
   * Mark a note as actively being edited.
   * Real-time updates for this note will be buffered instead of applied immediately.
   */
  setActivelyEditing(noteId: string | null): void {
    this.activelyEditedNoteIds.clear()
    if (noteId) {
      this.activelyEditedNoteIds.add(noteId)
    }
  }

  /**
   * Check if a note is currently being actively edited.
   */
  isActivelyEditing(noteId: string): boolean {
    return this.activelyEditedNoteIds.has(noteId)
  }

  /**
   * Flush buffered remote updates for notes that are no longer being edited.
   * Call this when the user stops editing (e.g., switches notes or closes editor).
   */
  flushPendingUpdates(): void {
    if (this.pendingRemoteUpdates.size === 0) return

    const notesToMerge: Note[] = []
    for (const [noteId, note] of this.pendingRemoteUpdates) {
      if (!this.activelyEditedNoteIds.has(noteId)) {
        notesToMerge.push(note)
      }
    }

    if (notesToMerge.length > 0) {
      this.store.mergeRemoteNotes(notesToMerge)
    }

    // Remove flushed notes from pending
    for (const note of notesToMerge) {
      this.pendingRemoteUpdates.delete(note.id)
    }
  }

  /**
   * Get the current sync engine state.
   */
  getState(): SyncState {
    return this.state
  }

  /**
   * Get the current retry count.
   */
  getRetryCount(): number {
    return this.retryCount
  }

  /**
   * Get the number of pending buffered remote updates.
   */
  getPendingUpdateCount(): number {
    return this.pendingRemoteUpdates.size
  }

  /**
   * Subscribe to state changes.
   * Returns an unsubscribe function.
   */
  onStateChange(listener: SyncStateListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  // ─── Private: Sync Cycle ─────────────────────────────────────────────────

  private async executeSyncCycle(): Promise<SyncResult> {
    const userId = this.userId!
    this.transition('Syncing')

    try {
      // Pull Phase
      this.transition('PullPhase')
      const lastSync = this.store.lastSyncAt ?? 0
      const remoteNotes = await this.transport.pullNotes(userId, lastSync)
      const remoteFolders = await this.transport.pullFolders(userId)

      // Merge Phase
      this.transition('MergePhase')
      const conflicts: ConflictResult[] = []
      const mergedNotes: Note[] = []

      for (const remote of remoteNotes) {
        const local = this.store.notes.find((n) => n.id === remote.id)

        if (!local) {
          // New remote note — just add it
          mergedNotes.push(remote)
          continue
        }

        // Check if there's a real conflict (both modified)
        if (local.content !== remote.content || local.updatedAt !== remote.updatedAt) {
          const result = this.resolver.resolve(local, remote)
          conflicts.push(result)
          mergedNotes.push(result.winner)
          if (result.conflictCopy) {
            mergedNotes.push(result.conflictCopy)
          }
        }
      }

      // Apply merged notes to store (respecting active editing buffer)
      const toApplyNow: Note[] = []
      for (const note of mergedNotes) {
        if (this.activelyEditedNoteIds.has(note.id)) {
          // Buffer this update — user is editing this note
          this.pendingRemoteUpdates.set(note.id, note)
        } else {
          toApplyNow.push(note)
        }
      }

      if (toApplyNow.length > 0) {
        this.store.mergeRemoteNotes(toApplyNow)
      }

      // Merge remote folders
      if (remoteFolders.length > 0) {
        this.store.mergeRemoteFolders(remoteFolders)
      }

      // Push Phase
      this.transition('PushPhase')
      const localNotes = this.store.notes.filter((n) => {
        // Push notes that have been updated since last sync
        return n.updatedAt > lastSync
      })
      if (localNotes.length > 0) {
        await this.transport.pushNotes(localNotes, userId)
      }

      const localFolders = this.store.folders.filter((f) => {
        return f.updatedAt > lastSync
      })
      if (localFolders.length > 0) {
        await this.transport.pushFolders(localFolders, userId)
      }

      // Process Queue Phase — drain offline ops
      this.transition('ProcessQueue')
      const errors: SyncError[] = []
      await this.queue.drain(async (op) => {
        try {
          switch (op.type) {
            case 'delete_note':
              await this.transport.deleteNote(op.entityId, userId)
              break
            case 'delete_folder':
              await this.transport.deleteFolder(op.entityId, userId)
              break
            case 'upsert_note':
              if (op.payload) {
                await this.transport.pushNotes([op.payload as unknown as Note], userId)
              }
              break
            case 'upsert_folder':
              if (op.payload) {
                await this.transport.pushFolders([op.payload as unknown as Folder], userId)
              }
              break
          }
          return true
        } catch (err) {
          errors.push({
            entityId: op.entityId,
            error: String(err),
            retryable: op.retryCount < 3,
          })
          return false
        }
      })

      // Success — transition to Synced
      this.transition('Synced')
      this.retryCount = 0
      this.store.setSyncError(null)

      // After synced, transition back to Idle
      this.transition('Idle')

      return { notes: remoteNotes, folders: remoteFolders, conflicts, errors }
    } catch (err) {
      return this.handleSyncError(err)
    }
  }

  // ─── Private: Error Handling & Retry ─────────────────────────────────────

  private handleSyncError(err: unknown): SyncResult {
    this.transition('Error')
    const errorMessage = err instanceof Error ? err.message : String(err)
    this.store.setSyncError(errorMessage)

    if (this.retryCount < this.config.maxRetries) {
      this.retryCount++
      const delay = this.computeBackoffDelay(this.retryCount)
      this.transition('RetryWait')

      this.retryTimer = setTimeout(() => {
        this.retryTimer = null
        if (this.running) {
          this.executeSyncCycle()
        }
      }, delay)
    } else {
      // Max retries exceeded — give up and go back to Idle
      this.transition('Idle')
    }

    return { notes: [], folders: [], conflicts: [], errors: [] }
  }

  /**
   * Compute exponential backoff delay.
   * Formula: base * multiplier^(attempt-1), capped at maxBackoff
   * Results: 5s, 10s, 20s, 40s, 80s for default config
   */
  computeBackoffDelay(attempt: number): number {
    const delay = this.config.backoffBaseMs *
      Math.pow(this.config.backoffMultiplier, attempt - 1)
    return Math.min(delay, this.config.maxBackoffMs)
  }

  // ─── Private: Real-time Subscription ─────────────────────────────────────

  private setupSubscription(userId: string): void {
    if (this.unsubscribe) {
      this.unsubscribe()
    }

    this.unsubscribe = this.transport.subscribe(
      userId,
      (note: Note) => this.handleRemoteNoteChange(note),
      (noteId: string) => this.handleRemoteNoteDelete(noteId)
    )
  }

  /**
   * Handle an incoming real-time note change.
   * If the note is actively being edited, buffer the update.
   * Otherwise, apply it immediately.
   */
  private handleRemoteNoteChange(note: Note): void {
    if (this.activelyEditedNoteIds.has(note.id)) {
      // Buffer — don't interrupt the user's editing session
      this.pendingRemoteUpdates.set(note.id, note)
    } else {
      // Apply immediately
      this.store.mergeRemoteNotes([note])
    }
  }

  /**
   * Handle an incoming real-time note deletion.
   * Deletions are always applied immediately (no buffering needed).
   */
  private handleRemoteNoteDelete(noteId: string): void {
    // Remove from pending if buffered
    this.pendingRemoteUpdates.delete(noteId)
    // The store's mergeRemoteNotes with deletedAt set handles this,
    // but for hard deletes we need to handle via the store directly.
    // For now, merge a note with deletedAt set to trigger soft-delete behavior.
    const existingNote = this.store.notes.find((n) => n.id === noteId)
    if (existingNote) {
      this.store.mergeRemoteNotes([{ ...existingNote, deletedAt: Date.now() }])
    }
  }

  // ─── Private: State Machine ──────────────────────────────────────────────

  private transition(next: SyncState): void {
    this.state = next

    // Map internal state to UI-facing SyncStatus
    const status = this.mapStateToStatus(next)
    this.store.setSyncStatus(status)

    // Notify listeners
    for (const listener of this.listeners) {
      listener(next)
    }
  }

  private mapStateToStatus(state: SyncState): SyncStatus {
    switch (state) {
      case 'Idle':
        return 'idle'
      case 'Synced':
        return 'synced'
      case 'Error':
      case 'RetryWait':
        return 'error'
      case 'Offline':
        return 'offline'
      default:
        // Syncing, PullPhase, MergePhase, PushPhase, ProcessQueue
        return 'syncing'
    }
  }
}
