/**
 * Unit tests for NoteHistory module
 *
 * Tests createSnapshot, getSnapshots, clearSnapshots with:
 * - 5-minute minimum interval enforcement
 * - Content-change requirement
 * - 50-snapshot cap per note
 * - IndexedDB storage via idbGet/idbSet
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSnapshot, getSnapshots, clearSnapshots, CONSTANTS } from './noteHistory'

// Mock the IndexedDB storage layer
vi.mock('../storage/indexedDB', () => {
  const store = new Map<string, unknown>()
  return {
    idbGet: vi.fn(async (key: string) => store.get(key) ?? null),
    idbSet: vi.fn(async (key: string, value: unknown) => { store.set(key, value) }),
    __store: store,
  }
})

// Access the mock store for test setup
async function getMockStore() {
  const mod = await import('../storage/indexedDB') as unknown as { __store: Map<string, unknown> }
  return mod.__store
}

describe('NoteHistory — createSnapshot', () => {
  beforeEach(async () => {
    const store = await getMockStore()
    store.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates a snapshot when no previous snapshots exist', async () => {
    const result = await createSnapshot('note-1', '{"type":"doc","content":[]}', 'My Note')
    expect(result).toBe(true)

    const snapshots = await getSnapshots('note-1')
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].noteId).toBe('note-1')
    expect(snapshots[0].title).toBe('My Note')
    expect(snapshots[0].content).toBe('{"type":"doc","content":[]}')
  })

  it('skips snapshot if less than 5 minutes since last snapshot', async () => {
    // Create first snapshot
    await createSnapshot('note-1', 'content-v1', 'Title')
    expect(await getSnapshots('note-1')).toHaveLength(1)

    // Advance 3 minutes (less than 5)
    vi.advanceTimersByTime(3 * 60 * 1000)

    // Try to create another — should be skipped
    const result = await createSnapshot('note-1', 'content-v2', 'Title')
    expect(result).toBe(false)
    expect(await getSnapshots('note-1')).toHaveLength(1)
  })

  it('creates snapshot after 5 minutes have elapsed', async () => {
    await createSnapshot('note-1', 'content-v1', 'Title')

    // Advance exactly 5 minutes
    vi.advanceTimersByTime(5 * 60 * 1000)

    const result = await createSnapshot('note-1', 'content-v2', 'Title')
    expect(result).toBe(true)
    expect(await getSnapshots('note-1')).toHaveLength(2)
  })

  it('skips snapshot if content has not changed', async () => {
    await createSnapshot('note-1', 'same-content', 'Title')

    // Advance 10 minutes
    vi.advanceTimersByTime(10 * 60 * 1000)

    // Same content — should be skipped
    const result = await createSnapshot('note-1', 'same-content', 'Title')
    expect(result).toBe(false)
    expect(await getSnapshots('note-1')).toHaveLength(1)
  })

  it('creates snapshot when content changes after interval', async () => {
    await createSnapshot('note-1', 'content-v1', 'Title')

    vi.advanceTimersByTime(6 * 60 * 1000)

    const result = await createSnapshot('note-1', 'content-v2', 'Title Updated')
    expect(result).toBe(true)

    const snapshots = await getSnapshots('note-1')
    expect(snapshots).toHaveLength(2)
    expect(snapshots[0].content).toBe('content-v2')
    expect(snapshots[0].title).toBe('Title Updated')
  })

  it('enforces 50-snapshot cap, evicting oldest', async () => {
    // Create 50 snapshots
    for (let i = 0; i < 50; i++) {
      vi.advanceTimersByTime(6 * 60 * 1000)
      await createSnapshot('note-1', `content-${i}`, 'Title')
    }

    const before = await getSnapshots('note-1')
    expect(before).toHaveLength(50)

    // Create one more — should evict oldest
    vi.advanceTimersByTime(6 * 60 * 1000)
    const result = await createSnapshot('note-1', 'content-50', 'Title')
    expect(result).toBe(true)

    const after = await getSnapshots('note-1')
    expect(after).toHaveLength(50)
    // Most recent should be first
    expect(after[0].content).toBe('content-50')
    // Oldest (content-0) should have been evicted
    expect(after.find(s => s.content === 'content-0')).toBeUndefined()
  })

  it('stores snapshots in reverse chronological order', async () => {
    await createSnapshot('note-1', 'first', 'Title')
    vi.advanceTimersByTime(6 * 60 * 1000)
    await createSnapshot('note-1', 'second', 'Title')
    vi.advanceTimersByTime(6 * 60 * 1000)
    await createSnapshot('note-1', 'third', 'Title')

    const snapshots = await getSnapshots('note-1')
    expect(snapshots[0].content).toBe('third')
    expect(snapshots[1].content).toBe('second')
    expect(snapshots[2].content).toBe('first')
  })

  it('computes word count for Chinese text in TipTap JSON', async () => {
    const content = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '你好世界' }] }],
    })

    await createSnapshot('note-1', content, 'Title')
    const snapshots = await getSnapshots('note-1')
    // 4 Chinese characters = 4 words
    expect(snapshots[0].wordCount).toBe(4)
  })

  it('computes word count for mixed content', async () => {
    const content = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '你好 hello world' }] }],
    })

    await createSnapshot('note-1', content, 'Title')
    const snapshots = await getSnapshots('note-1')
    // 2 Chinese chars + 2 English words = 4
    expect(snapshots[0].wordCount).toBe(4)
  })

  it('handles non-JSON content gracefully for word count', async () => {
    await createSnapshot('note-1', 'plain text content here', 'Title')
    const snapshots = await getSnapshots('note-1')
    // 4 English words
    expect(snapshots[0].wordCount).toBe(4)
  })
})

describe('NoteHistory — getSnapshots', () => {
  beforeEach(async () => {
    const store = await getMockStore()
    store.clear()
  })

  it('returns empty array for note with no history', async () => {
    const snapshots = await getSnapshots('nonexistent-note')
    expect(snapshots).toEqual([])
  })

  it('returns snapshots for the correct note only', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T10:00:00Z'))

    await createSnapshot('note-1', 'content-a', 'Note A')
    await createSnapshot('note-2', 'content-b', 'Note B')

    const snapshotsA = await getSnapshots('note-1')
    const snapshotsB = await getSnapshots('note-2')

    expect(snapshotsA).toHaveLength(1)
    expect(snapshotsA[0].noteId).toBe('note-1')
    expect(snapshotsB).toHaveLength(1)
    expect(snapshotsB[0].noteId).toBe('note-2')

    vi.useRealTimers()
  })
})

describe('NoteHistory — clearSnapshots', () => {
  beforeEach(async () => {
    const store = await getMockStore()
    store.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('removes all snapshots for a note', async () => {
    await createSnapshot('note-1', 'content-1', 'Title')
    vi.advanceTimersByTime(6 * 60 * 1000)
    await createSnapshot('note-1', 'content-2', 'Title')

    expect(await getSnapshots('note-1')).toHaveLength(2)

    await clearSnapshots('note-1')
    expect(await getSnapshots('note-1')).toEqual([])
  })

  it('does not affect other notes', async () => {
    await createSnapshot('note-1', 'content-a', 'Note A')
    await createSnapshot('note-2', 'content-b', 'Note B')

    await clearSnapshots('note-1')

    expect(await getSnapshots('note-1')).toEqual([])
    expect(await getSnapshots('note-2')).toHaveLength(1)
  })

  it('is safe to call on a note with no snapshots', async () => {
    await expect(clearSnapshots('nonexistent')).resolves.toBeUndefined()
  })
})

describe('NoteHistory — Constants', () => {
  it('exports correct constants', () => {
    expect(CONSTANTS.MAX_SNAPSHOTS_PER_NOTE).toBe(50)
    expect(CONSTANTS.MIN_INTERVAL_MS).toBe(5 * 60 * 1000)
    expect(CONSTANTS.SNAPSHOTS_KEY_PREFIX).toBe('snapshots-')
  })
})
