/**
 * Tests for Image Store module
 *
 * Tests the utility functions (makeAssetUri, parseAssetUri) and
 * the IndexedDBImageStore implementation using fake-indexeddb.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  makeAssetUri,
  parseAssetUri,
  IndexedDBImageStore,
  createImageStore,
} from './imageStore'

// ─── Asset URI Helpers ───────────────────────────────────────────────────────

describe('makeAssetUri', () => {
  it('creates correct asset URI format', () => {
    const uri = makeAssetUri('abc-123', 'png')
    expect(uri).toBe('asset://local/abc-123.png')
  })

  it('handles various extensions', () => {
    expect(makeAssetUri('id1', 'jpg')).toBe('asset://local/id1.jpg')
    expect(makeAssetUri('id2', 'webp')).toBe('asset://local/id2.webp')
    expect(makeAssetUri('id3', 'gif')).toBe('asset://local/id3.gif')
  })

  it('handles UUIDs as IDs', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    expect(makeAssetUri(uuid, 'png')).toBe(`asset://local/${uuid}.png`)
  })
})

describe('parseAssetUri', () => {
  it('parses valid asset URI', () => {
    const result = parseAssetUri('asset://local/abc-123.png')
    expect(result).toEqual({ id: 'abc-123', ext: 'png' })
  })

  it('parses URI with UUID id', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    const result = parseAssetUri(`asset://local/${uuid}.jpg`)
    expect(result).toEqual({ id: uuid, ext: 'jpg' })
  })

  it('returns null for invalid URIs', () => {
    expect(parseAssetUri('http://example.com/image.png')).toBeNull()
    expect(parseAssetUri('shimo-img://abc')).toBeNull()
    expect(parseAssetUri('')).toBeNull()
    expect(parseAssetUri('asset://remote/abc.png')).toBeNull()
  })

  it('returns null for URIs without extension', () => {
    expect(parseAssetUri('asset://local/abc')).toBeNull()
  })

  it('round-trips with makeAssetUri', () => {
    const id = 'test-id-123'
    const ext = 'webp'
    const uri = makeAssetUri(id, ext)
    const parsed = parseAssetUri(uri)
    expect(parsed).toEqual({ id, ext })
  })
})

// ─── IndexedDBImageStore ─────────────────────────────────────────────────────

describe('IndexedDBImageStore', () => {
  let store: IndexedDBImageStore
  let localStorageStore: Record<string, string>

  beforeEach(() => {
    localStorageStore = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => localStorageStore[key] ?? null,
      setItem: (key: string, value: string) => { localStorageStore[key] = value },
      removeItem: (key: string) => { delete localStorageStore[key] },
      clear: () => { localStorageStore = {} },
    })
    store = new IndexedDBImageStore()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves a blob and returns an asset URI', async () => {
    const blob = new Blob(['hello'], { type: 'image/png' })
    const uri = await store.save(blob, 'png')

    expect(uri).toMatch(/^asset:\/\/local\/.+\.png$/)
  })

  it('loads a previously saved blob', async () => {
    const content = 'test image data'
    const blob = new Blob([content], { type: 'image/png' })
    const uri = await store.save(blob, 'png')

    const loaded = await store.load(uri)
    expect(loaded).not.toBeNull()
    expect(loaded!.size).toBe(blob.size)

    const text = await loaded!.text()
    expect(text).toBe(content)
  })

  it('returns null for non-existent asset URI', async () => {
    const result = await store.load('asset://local/nonexistent.png')
    expect(result).toBeNull()
  })

  it('returns null for invalid URI format', async () => {
    const result = await store.load('http://example.com/image.png')
    expect(result).toBeNull()
  })

  it('tracks reference counts with addRef/removeRef', async () => {
    const blob = new Blob(['data'], { type: 'image/png' })
    const uri = await store.save(blob, 'png')

    await store.addRef(uri, 'note-1')
    await store.addRef(uri, 'note-2')

    // Adding same ref again should be idempotent
    await store.addRef(uri, 'note-1')

    const usage = await store.getUsage()
    expect(usage.count).toBe(1)

    // Remove one ref
    await store.removeRef(uri, 'note-1')

    // Image should still exist (note-2 still references it)
    const loaded = await store.load(uri)
    expect(loaded).not.toBeNull()
  })

  it('cleanOrphans removes images with no references', async () => {
    const blob1 = new Blob(['image1'], { type: 'image/png' })
    const blob2 = new Blob(['image2'], { type: 'image/jpg' })

    const uri1 = await store.save(blob1, 'png')
    const uri2 = await store.save(blob2, 'jpg')

    // Add ref to uri1 only
    await store.addRef(uri1, 'note-1')

    // uri2 has no refs, should be cleaned
    const removed = await store.cleanOrphans()
    expect(removed).toBe(1)

    // uri1 should still be loadable
    const loaded1 = await store.load(uri1)
    expect(loaded1).not.toBeNull()

    // uri2 should be gone
    const loaded2 = await store.load(uri2)
    expect(loaded2).toBeNull()
  })

  it('getUsage returns correct count and bytes', async () => {
    const blob1 = new Blob(['short'], { type: 'image/png' })
    const blob2 = new Blob(['a longer piece of data'], { type: 'image/jpg' })

    await store.save(blob1, 'png')
    await store.save(blob2, 'jpg')

    const usage = await store.getUsage()
    expect(usage.count).toBe(2)
    expect(usage.bytes).toBe(blob1.size + blob2.size)
  })

  it('getUsage returns zero for empty store', async () => {
    const usage = await store.getUsage()
    expect(usage.count).toBe(0)
    expect(usage.bytes).toBe(0)
  })

  it('addRef is no-op for invalid URI', async () => {
    // Should not throw
    await store.addRef('invalid-uri', 'note-1')
  })

  it('removeRef is no-op for invalid URI', async () => {
    // Should not throw
    await store.removeRef('invalid-uri', 'note-1')
  })
})

// ─── Factory Function ────────────────────────────────────────────────────────

describe('createImageStore', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns IndexedDBImageStore in test environment (no Tauri/Capacitor)', () => {
    const store = createImageStore()
    expect(store).toBeInstanceOf(IndexedDBImageStore)
  })
})
