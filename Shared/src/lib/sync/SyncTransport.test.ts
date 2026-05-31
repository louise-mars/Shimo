/**
 * Unit tests for SyncTransport — ISyncTransport interface and SupabaseSyncTransport.
 *
 * These tests verify the transport layer correctly maps between
 * local Note/Folder objects and Supabase row format, and handles
 * errors from the Supabase SDK appropriately.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SupabaseSyncTransport } from './SyncTransport'
import type { Note, Folder } from '../../types'

// ─── Mock Supabase Client ────────────────────────────────────────────────────

/**
 * Creates a mock Supabase client where all query builder methods
 * are chainable by default. To make a chain resolve, call
 * `mockTerminal(method, value)` on the LAST method in the chain.
 */
function createMockSupabase() {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }

  const builder: Record<string, ReturnType<typeof vi.fn>> = {}
  const methods = ['select', 'eq', 'gte', 'order', 'upsert', 'delete']
  for (const method of methods) {
    builder[method] = vi.fn().mockImplementation(() => builder)
  }

  const from = vi.fn().mockReturnValue(builder)

  return {
    client: {
      from,
      channel: vi.fn().mockReturnValue(mockChannel),
      removeChannel: vi.fn(),
    } as any,
    builder,
    mockChannel,
    /** Reset all builder mocks to default chaining behavior */
    resetBuilder() {
      for (const method of methods) {
        builder[method].mockReset()
        builder[method].mockImplementation(() => builder)
      }
    },
  }
}

// ─── Test Data ───────────────────────────────────────────────────────────────

const testNote: Note = {
  id: 'note-1',
  title: '测试笔记',
  content: '{"type":"doc","content":[]}',
  tags: ['tag1', 'tag2'],
  folderId: 'folder-1',
  pinned: true,
  favorited: false,
  locked: false,
  hidden: false,
  deletedAt: null,
  createdAt: 1700000000000,
  updatedAt: 1700001000000,
  conflictSourceId: undefined,
}

const testFolder: Folder = {
  id: 'folder-1',
  name: '工作',
  emoji: '📁',
  parentId: null,
  order: 0,
  createdAt: 1700000000000,
  updatedAt: 1700001000000,
}

const supabaseNoteRow = {
  id: 'note-1',
  user_id: 'user-1',
  title: '测试笔记',
  content: '{"type":"doc","content":[]}',
  tags: ['tag1', 'tag2'],
  folder_id: 'folder-1',
  pinned: true,
  favorited: false,
  locked: false,
  hidden: false,
  deleted_at: null,
  created_at: 1700000000000,
  updated_at: 1700001000000,
  conflict_source_id: null,
}

const supabaseFolderRow = {
  id: 'folder-1',
  user_id: 'user-1',
  name: '工作',
  emoji: '📁',
  parent_id: null,
  order: 0,
  created_at: 1700000000000,
  updated_at: 1700001000000,
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SupabaseSyncTransport', () => {
  let mock: ReturnType<typeof createMockSupabase>
  let transport: SupabaseSyncTransport

  beforeEach(() => {
    mock = createMockSupabase()
    transport = new SupabaseSyncTransport(mock.client)
  })

  describe('pullNotes', () => {
    it('should fetch notes updated since the given timestamp', async () => {
      // Terminal: .order() resolves the chain
      mock.builder.order.mockResolvedValueOnce({ data: [supabaseNoteRow], error: null })

      const notes = await transport.pullNotes('user-1', 1700000000000)

      expect(mock.client.from).toHaveBeenCalledWith('notes')
      expect(mock.builder.select).toHaveBeenCalledWith('*')
      expect(mock.builder.eq).toHaveBeenCalledWith('user_id', 'user-1')
      expect(mock.builder.gte).toHaveBeenCalledWith('updated_at', 1700000000000)
      expect(notes).toHaveLength(1)
      expect(notes[0]).toEqual(testNote)
    })

    it('should return empty array when no notes found', async () => {
      mock.builder.order.mockResolvedValueOnce({ data: [], error: null })

      const notes = await transport.pullNotes('user-1', 0)
      expect(notes).toEqual([])
    })

    it('should throw on Supabase error', async () => {
      mock.builder.order.mockResolvedValueOnce({ data: null, error: { message: 'Network error' } })

      await expect(transport.pullNotes('user-1', 0)).rejects.toThrow(
        'pullNotes failed: Network error'
      )
    })
  })

  describe('pullFolders', () => {
    it('should fetch all folders for the user', async () => {
      mock.builder.order.mockResolvedValueOnce({ data: [supabaseFolderRow], error: null })

      const folders = await transport.pullFolders('user-1')

      expect(mock.client.from).toHaveBeenCalledWith('folders')
      expect(mock.builder.eq).toHaveBeenCalledWith('user_id', 'user-1')
      expect(folders).toHaveLength(1)
      expect(folders[0]).toEqual(testFolder)
    })

    it('should throw on Supabase error', async () => {
      mock.builder.order.mockResolvedValueOnce({ data: null, error: { message: 'Auth error' } })

      await expect(transport.pullFolders('user-1')).rejects.toThrow(
        'pullFolders failed: Auth error'
      )
    })
  })

  describe('pushNotes', () => {
    it('should upsert notes to Supabase', async () => {
      mock.builder.upsert.mockResolvedValueOnce({ data: null, error: null })

      await transport.pushNotes([testNote], 'user-1')

      expect(mock.client.from).toHaveBeenCalledWith('notes')
      expect(mock.builder.upsert).toHaveBeenCalledWith(
        [expect.objectContaining({ id: 'note-1', user_id: 'user-1', title: '测试笔记' })],
        { onConflict: 'id' }
      )
    })

    it('should skip upsert when notes array is empty', async () => {
      await transport.pushNotes([], 'user-1')
      expect(mock.client.from).not.toHaveBeenCalled()
    })

    it('should throw on Supabase error', async () => {
      mock.builder.upsert.mockResolvedValueOnce({ data: null, error: { message: 'Quota exceeded' } })

      await expect(transport.pushNotes([testNote], 'user-1')).rejects.toThrow(
        'pushNotes failed: Quota exceeded'
      )
    })
  })

  describe('pushFolders', () => {
    it('should upsert folders to Supabase', async () => {
      mock.builder.upsert.mockResolvedValueOnce({ data: null, error: null })

      await transport.pushFolders([testFolder], 'user-1')

      expect(mock.client.from).toHaveBeenCalledWith('folders')
      expect(mock.builder.upsert).toHaveBeenCalledWith(
        [expect.objectContaining({ id: 'folder-1', user_id: 'user-1', name: '工作' })],
        { onConflict: 'id' }
      )
    })

    it('should skip upsert when folders array is empty', async () => {
      await transport.pushFolders([], 'user-1')
      expect(mock.client.from).not.toHaveBeenCalled()
    })
  })

  describe('deleteNote', () => {
    it('should delete a note by id and user_id', async () => {
      // Chain: .from('notes').delete().eq('id', ...).eq('user_id', ...)
      // The second .eq() is the terminal — make it resolve
      let eqCallCount = 0
      mock.builder.eq.mockImplementation(() => {
        eqCallCount++
        if (eqCallCount >= 2) {
          return Promise.resolve({ data: null, error: null })
        }
        return mock.builder
      })

      await transport.deleteNote('note-1', 'user-1')

      expect(mock.client.from).toHaveBeenCalledWith('notes')
      expect(mock.builder.delete).toHaveBeenCalled()
      expect(mock.builder.eq).toHaveBeenCalledWith('id', 'note-1')
      expect(mock.builder.eq).toHaveBeenCalledWith('user_id', 'user-1')
    })

    it('should throw on Supabase error', async () => {
      let eqCallCount = 0
      mock.builder.eq.mockImplementation(() => {
        eqCallCount++
        if (eqCallCount >= 2) {
          return Promise.resolve({ data: null, error: { message: 'Not found' } })
        }
        return mock.builder
      })

      await expect(transport.deleteNote('note-1', 'user-1')).rejects.toThrow(
        'deleteNote failed: Not found'
      )
    })
  })

  describe('deleteFolder', () => {
    it('should delete a folder by id and user_id', async () => {
      let eqCallCount = 0
      mock.builder.eq.mockImplementation(() => {
        eqCallCount++
        if (eqCallCount >= 2) {
          return Promise.resolve({ data: null, error: null })
        }
        return mock.builder
      })

      await transport.deleteFolder('folder-1', 'user-1')

      expect(mock.client.from).toHaveBeenCalledWith('folders')
      expect(mock.builder.delete).toHaveBeenCalled()
      expect(mock.builder.eq).toHaveBeenCalledWith('id', 'folder-1')
      expect(mock.builder.eq).toHaveBeenCalledWith('user_id', 'user-1')
    })

    it('should throw on Supabase error', async () => {
      let eqCallCount = 0
      mock.builder.eq.mockImplementation(() => {
        eqCallCount++
        if (eqCallCount >= 2) {
          return Promise.resolve({ data: null, error: { message: 'Forbidden' } })
        }
        return mock.builder
      })

      await expect(transport.deleteFolder('folder-1', 'user-1')).rejects.toThrow(
        'deleteFolder failed: Forbidden'
      )
    })
  })

  describe('subscribe', () => {
    it('should set up real-time subscription and return unsubscribe function', () => {
      const onNoteChange = vi.fn()
      const onNoteDelete = vi.fn()

      const unsubscribe = transport.subscribe('user-1', onNoteChange, onNoteDelete)

      expect(mock.client.channel).toHaveBeenCalledWith('sync:user-1')
      // 3 listeners: INSERT, UPDATE, DELETE
      expect(mock.mockChannel.on).toHaveBeenCalledTimes(3)
      expect(mock.mockChannel.subscribe).toHaveBeenCalled()
      expect(typeof unsubscribe).toBe('function')
    })

    it('should remove channel on unsubscribe', () => {
      const unsubscribe = transport.subscribe('user-1', vi.fn(), vi.fn())
      unsubscribe()

      expect(mock.client.removeChannel).toHaveBeenCalled()
    })

    it('should remove previous channel when subscribing again', () => {
      transport.subscribe('user-1', vi.fn(), vi.fn())
      transport.subscribe('user-1', vi.fn(), vi.fn())

      // removeChannel called once for the first subscription being replaced
      expect(mock.client.removeChannel).toHaveBeenCalledTimes(1)
    })
  })

  describe('updateSyncMeta', () => {
    it('should upsert sync metadata', async () => {
      mock.builder.upsert.mockResolvedValueOnce({ data: null, error: null })

      await transport.updateSyncMeta('user-1', 'device-abc')

      expect(mock.client.from).toHaveBeenCalledWith('sync_meta')
      expect(mock.builder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          device_id: 'device-abc',
        }),
        { onConflict: 'user_id,device_id' }
      )
    })

    it('should throw on Supabase error', async () => {
      mock.builder.upsert.mockResolvedValueOnce({
        data: null,
        error: { message: 'Permission denied' },
      })

      await expect(transport.updateSyncMeta('user-1', 'device-abc')).rejects.toThrow(
        'updateSyncMeta failed: Permission denied'
      )
    })
  })
})
