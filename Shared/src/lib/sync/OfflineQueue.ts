/**
 * OfflineQueue — FIFO operation queue with dedup and localStorage persistence.
 *
 * Captures all mutation operations (upsert_note, delete_note, upsert_folder, delete_folder)
 * for ordered replay on reconnect. Deduplicates by entityId + type so only the latest
 * version of each operation is retained.
 *
 * Requirements: 10.8, 10.11, 10.13
 */

import { v4 as uuid } from 'uuid'
import type { SyncOp, SyncOpType } from '../store/types'

const STORAGE_KEY = 'shimo-offline-queue'
const MAX_RETRIES = 3

export class OfflineQueue {
  private queue: SyncOp[] = []

  constructor() {
    this.load()
  }

  /**
   * Add an operation to the queue, deduplicating by entityId + type.
   * If the same entityId+type already exists, replace it with the newer one
   * while preserving FIFO position.
   */
  enqueue(op: Omit<SyncOp, 'id' | 'createdAt' | 'retryCount'>): void {
    const newOp: SyncOp = {
      ...op,
      id: uuid(),
      createdAt: Date.now(),
      retryCount: 0,
    }

    const existingIdx = this.queue.findIndex(
      (q) => q.entityId === op.entityId && q.type === op.type
    )

    if (existingIdx >= 0) {
      // Replace existing op in-place (preserves FIFO position)
      this.queue[existingIdx] = newOp
    } else {
      // Append to end (FIFO)
      this.queue.push(newOp)
    }

    this.persist()
  }

  /**
   * Return the next operation without removing it.
   */
  peek(): SyncOp | null {
    return this.queue.length > 0 ? this.queue[0] : null
  }

  /**
   * Remove and return the next operation (FIFO).
   */
  dequeue(): SyncOp | null {
    if (this.queue.length === 0) return null
    const op = this.queue.shift()!
    this.persist()
    return op
  }

  /**
   * Process all ops in FIFO order with per-op retry.
   * Failed ops are retried (retryCount incremented) up to MAX_RETRIES.
   * Ops exceeding max retries are discarded.
   */
  async drain(handler: (op: SyncOp) => Promise<boolean>): Promise<void> {
    const remaining: SyncOp[] = []

    for (const op of this.queue) {
      const success = await handler(op)
      if (!success) {
        if (op.retryCount < MAX_RETRIES) {
          remaining.push({ ...op, retryCount: op.retryCount + 1 })
        }
        // If retryCount >= MAX_RETRIES, discard the op
      }
      // If success, op is consumed (not re-added)
    }

    this.queue = remaining
    this.persist()
  }

  /**
   * Return current queue length.
   */
  size(): number {
    return this.queue.length
  }

  /**
   * Empty the queue.
   */
  clear(): void {
    this.queue = []
    this.persist()
  }

  /**
   * Save queue to localStorage.
   */
  persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue))
    } catch {
      // localStorage may be full or unavailable — silently fail
    }
  }

  /**
   * Restore queue from localStorage on startup.
   */
  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          this.queue = parsed
        }
      }
    } catch {
      this.queue = []
    }
  }
}
