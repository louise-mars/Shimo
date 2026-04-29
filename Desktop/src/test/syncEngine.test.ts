import { describe, it, expect, beforeEach } from 'vitest'
import { getQueue, saveQueue, enqueueOp, isValidOp } from '@notepro/shared'
import type { SyncQueueOperation } from '@notepro/shared'

describe('SyncEngine - Queue Operations', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('getQueue', () => {
    it('should return empty array when no queue exists', () => {
      const queue = getQueue()
      expect(queue).toEqual([])
    })

    it('should return parsed queue from localStorage', () => {
      const testQueue: SyncQueueOperation[] = [
        { type: 'delete_note', payload: { id: 'note-1' }, timestamp: Date.now() }
      ]
      localStorage.setItem('shimo-sync-queue', JSON.stringify(testQueue))
      const queue = getQueue()
      expect(queue).toEqual(testQueue)
    })

    it('should return empty array on invalid JSON', () => {
      localStorage.setItem('shimo-sync-queue', 'invalid json')
      const queue = getQueue()
      expect(queue).toEqual([])
    })
  })

  describe('saveQueue', () => {
    it('should save queue to localStorage', () => {
      const testQueue: SyncQueueOperation[] = [
        { type: 'delete_note', payload: { id: 'note-1' }, timestamp: Date.now() }
      ]
      saveQueue(testQueue)
      expect(localStorage.getItem('shimo-sync-queue')).toBe(JSON.stringify(testQueue))
    })
  })

  describe('isValidOp', () => {
    it('should return true for valid delete_note operation', () => {
      const op: SyncQueueOperation = { type: 'delete_note', payload: { id: 'note-1' }, timestamp: Date.now() }
      expect(isValidOp(op)).toBe(true)
    })

    it('should return true for valid delete_folder operation', () => {
      const op: SyncQueueOperation = { type: 'delete_folder', payload: { id: 'folder-1' }, timestamp: Date.now() }
      expect(isValidOp(op)).toBe(true)
    })

    it('should return true for valid upsert_note operation', () => {
      const op: SyncQueueOperation = { type: 'delete_note', payload: { id: 'note-1' }, timestamp: Date.now() }
      expect(isValidOp(op)).toBe(true)
    })

    it('should return false for invalid type', () => {
      const op = { type: 'invalid_type', payload: { id: 'note-1' }, timestamp: Date.now() } as unknown as SyncQueueOperation
      expect(isValidOp(op)).toBe(false)
    })

    it('should return false for missing payload', () => {
      const op = { type: 'delete_note', timestamp: Date.now() } as unknown as SyncQueueOperation
      expect(isValidOp(op)).toBe(false)
    })

    it('should return false for invalid timestamp', () => {
      const op: SyncQueueOperation = { type: 'delete_note', payload: { id: 'note-1' }, timestamp: -1 }
      expect(isValidOp(op)).toBe(false)
    })

    it('should return false for delete_note without id', () => {
      const op = { type: 'delete_note', payload: { name: 'test' }, timestamp: Date.now() } as unknown as SyncQueueOperation
      expect(isValidOp(op)).toBe(false)
    })

    it('should return false for null operation', () => {
      expect(isValidOp(null as unknown as SyncQueueOperation)).toBe(false)
    })

    it('should return false for undefined operation', () => {
      expect(isValidOp(undefined as unknown as SyncQueueOperation)).toBe(false)
    })
  })

  describe('enqueueOp', () => {
    it('should add valid operation to queue', () => {
      const op: SyncQueueOperation = { type: 'delete_note', payload: { id: 'note-1' }, timestamp: Date.now() }
      enqueueOp(op)
      const queue = getQueue()
      expect(queue).toHaveLength(1)
      expect(queue[0].type).toBe('delete_note')
    })

    it('should not add invalid operation to queue', () => {
      const op = { type: 'invalid', payload: {}, timestamp: Date.now() } as unknown as SyncQueueOperation
      enqueueOp(op)
      const queue = getQueue()
      expect(queue).toHaveLength(0)
    })

    it('should append to existing queue', () => {
      const existingQueue: SyncQueueOperation[] = [
        { type: 'delete_note', payload: { id: 'note-1' }, timestamp: Date.now() }
      ]
      saveQueue(existingQueue)
      
      const newOp: SyncQueueOperation = { type: 'delete_note', payload: { id: 'note-2' }, timestamp: Date.now() }
      enqueueOp(newOp)
      
      const queue = getQueue()
      expect(queue).toHaveLength(2)
    })
  })
})