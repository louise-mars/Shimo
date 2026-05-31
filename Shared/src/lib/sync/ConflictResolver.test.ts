import { describe, it, expect } from 'vitest'
import { LWWConflictResolver, formatConflictTitle } from './ConflictResolver'
import type { Note } from '../../types'

/** Helper to create a minimal Note for testing */
function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    title: '测试笔记',
    content: '{"type":"doc","content":[]}',
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

describe('LWWConflictResolver', () => {
  const resolver = new LWWConflictResolver()

  describe('no true conflict (same content or same timestamp)', () => {
    it('should return local_wins when local is newer and content is same', () => {
      const local = makeNote({ updatedAt: 3000 })
      const remote = makeNote({ updatedAt: 2000 })

      const result = resolver.resolve(local, remote)

      expect(result.resolution).toBe('local_wins')
      expect(result.winner).toBe(local)
      expect(result.conflictCopy).toBeNull()
    })

    it('should return remote_wins when remote is newer and content is same', () => {
      const local = makeNote({ updatedAt: 2000, pinned: true, favorited: true })
      const remote = makeNote({ updatedAt: 3000 })

      const result = resolver.resolve(local, remote)

      expect(result.resolution).toBe('remote_wins')
      expect(result.winner.updatedAt).toBe(3000)
      // Local pin/favorite metadata preserved
      expect(result.winner.pinned).toBe(true)
      expect(result.winner.favorited).toBe(true)
      expect(result.conflictCopy).toBeNull()
    })

    it('should return local_wins when timestamps are equal (even with different content)', () => {
      const local = makeNote({ updatedAt: 3000, content: 'local content' })
      const remote = makeNote({ updatedAt: 3000, content: 'remote content' })

      const result = resolver.resolve(local, remote)

      // Same timestamp means no true conflict per the logic
      expect(result.resolution).toBe('local_wins')
      expect(result.winner).toBe(local)
      expect(result.conflictCopy).toBeNull()
    })

    it('should return local_wins when content is same but timestamps differ', () => {
      const local = makeNote({ updatedAt: 2000, content: 'same content' })
      const remote = makeNote({ updatedAt: 3000, content: 'same content' })

      // Same content means no true conflict — but remote is newer
      const result = resolver.resolve(local, remote)

      // Content is same, so bothModified is false → remote wins since remote.updatedAt > local.updatedAt
      expect(result.resolution).toBe('remote_wins')
      expect(result.conflictCopy).toBeNull()
    })
  })

  describe('true conflict (different content AND different timestamps)', () => {
    it('should create conflict copy when local wins (local newer)', () => {
      const local = makeNote({
        updatedAt: 5000,
        content: 'local edited content',
        pinned: true,
        favorited: true,
      })
      const remote = makeNote({
        updatedAt: 4000,
        content: 'remote edited content',
      })

      const result = resolver.resolve(local, remote)

      expect(result.resolution).toBe('conflict_copy_created')
      expect(result.winner.content).toBe('local edited content')
      expect(result.winner.pinned).toBe(true)
      expect(result.winner.favorited).toBe(true)

      // Conflict copy is the remote (loser)
      expect(result.conflictCopy).not.toBeNull()
      expect(result.conflictCopy!.content).toBe('remote edited content')
      expect(result.conflictCopy!.conflictSourceId).toBe(local.id)
      expect(result.conflictCopy!.id).not.toBe(local.id)
      expect(result.conflictCopy!.id).not.toBe(remote.id)
    })

    it('should create conflict copy when remote wins (remote newer)', () => {
      const local = makeNote({
        updatedAt: 3000,
        content: 'local edited content',
        pinned: true,
        favorited: false,
      })
      const remote = makeNote({
        updatedAt: 6000,
        content: 'remote edited content',
        pinned: false,
        favorited: true,
      })

      const result = resolver.resolve(local, remote)

      expect(result.resolution).toBe('conflict_copy_created')
      // Remote wins but local pin/favorite preserved
      expect(result.winner.content).toBe('remote edited content')
      expect(result.winner.pinned).toBe(true)
      expect(result.winner.favorited).toBe(false)

      // Conflict copy is the local (loser)
      expect(result.conflictCopy).not.toBeNull()
      expect(result.conflictCopy!.content).toBe('local edited content')
      expect(result.conflictCopy!.conflictSourceId).toBe(result.winner.id)
    })

    it('should generate conflict copy with correct title format', () => {
      const local = makeNote({
        updatedAt: 5000,
        content: 'local content',
        title: '我的笔记',
      })
      const remote = makeNote({
        updatedAt: 4000,
        content: 'remote content',
        title: '我的笔记',
      })

      const result = resolver.resolve(local, remote)

      expect(result.conflictCopy).not.toBeNull()
      // Title format: {title}_冲突副本_{YYYYMMDD}
      const today = new Date()
      const year = today.getFullYear()
      const month = String(today.getMonth() + 1).padStart(2, '0')
      const day = String(today.getDate()).padStart(2, '0')
      const expectedTitle = `我的笔记_冲突副本_${year}${month}${day}`
      expect(result.conflictCopy!.title).toBe(expectedTitle)
    })

    it('should use 无标题 for empty title in conflict copy', () => {
      const local = makeNote({
        updatedAt: 5000,
        content: 'local content',
        title: '',
      })
      const remote = makeNote({
        updatedAt: 4000,
        content: 'remote content',
        title: '',
      })

      const result = resolver.resolve(local, remote)

      expect(result.conflictCopy).not.toBeNull()
      expect(result.conflictCopy!.title).toContain('无标题_冲突副本_')
    })

    it('should set conflict copy pinned and favorited to false', () => {
      const local = makeNote({
        updatedAt: 5000,
        content: 'local content',
        pinned: true,
        favorited: true,
      })
      const remote = makeNote({
        updatedAt: 4000,
        content: 'remote content',
        pinned: true,
        favorited: true,
      })

      const result = resolver.resolve(local, remote)

      expect(result.conflictCopy).not.toBeNull()
      expect(result.conflictCopy!.pinned).toBe(false)
      expect(result.conflictCopy!.favorited).toBe(false)
    })

    it('should assign new timestamps to conflict copy', () => {
      const local = makeNote({
        updatedAt: 5000,
        content: 'local content',
        createdAt: 1000,
      })
      const remote = makeNote({
        updatedAt: 4000,
        content: 'remote content',
        createdAt: 1000,
      })

      const before = Date.now()
      const result = resolver.resolve(local, remote)
      const after = Date.now()

      expect(result.conflictCopy).not.toBeNull()
      expect(result.conflictCopy!.createdAt).toBeGreaterThanOrEqual(before)
      expect(result.conflictCopy!.createdAt).toBeLessThanOrEqual(after)
      expect(result.conflictCopy!.updatedAt).toBeGreaterThanOrEqual(before)
      expect(result.conflictCopy!.updatedAt).toBeLessThanOrEqual(after)
    })
  })

  describe('metadata preservation', () => {
    it('should preserve local pinned state when remote wins (no conflict)', () => {
      const local = makeNote({ updatedAt: 1000, pinned: true })
      const remote = makeNote({ updatedAt: 2000, pinned: false })

      const result = resolver.resolve(local, remote)

      expect(result.winner.pinned).toBe(true)
    })

    it('should preserve local favorited state when remote wins (no conflict)', () => {
      const local = makeNote({ updatedAt: 1000, favorited: true })
      const remote = makeNote({ updatedAt: 2000, favorited: false })

      const result = resolver.resolve(local, remote)

      expect(result.winner.favorited).toBe(true)
    })

    it('should preserve local pinned/favorited when remote wins in true conflict', () => {
      const local = makeNote({
        updatedAt: 3000,
        content: 'local',
        pinned: true,
        favorited: true,
      })
      const remote = makeNote({
        updatedAt: 5000,
        content: 'remote',
        pinned: false,
        favorited: false,
      })

      const result = resolver.resolve(local, remote)

      expect(result.resolution).toBe('conflict_copy_created')
      expect(result.winner.pinned).toBe(true)
      expect(result.winner.favorited).toBe(true)
    })
  })
})

describe('formatConflictTitle', () => {
  it('should format title with date suffix', () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')

    const result = formatConflictTitle('我的笔记')
    expect(result).toBe(`我的笔记_冲突副本_${year}${month}${day}`)
  })

  it('should use 无标题 for empty string', () => {
    const result = formatConflictTitle('')
    expect(result).toContain('无标题_冲突副本_')
  })

  it('should use provided title when non-empty', () => {
    const result = formatConflictTitle('Test Note')
    expect(result).toMatch(/^Test Note_冲突副本_\d{8}$/)
  })
})
