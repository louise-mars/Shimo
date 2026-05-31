/**
 * Tests for Image Wiring module
 *
 * Tests the integration between the Zustand store and ImageStore:
 * - extractAssetUris extracts asset:// URIs from note content
 * - onImageInserted calls imageStore.addRef
 * - handleNoteDeleted removes refs and cleans orphans
 * - setupImageWiring detects permanent deletions and triggers cleanup
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createStore } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { createNoteSlice } from '../store/noteSlice'
import { createFolderSlice } from '../store/folderSlice'
import { createSyncSlice } from '../store/syncSlice'
import { createUISlice } from '../store/uiSlice'
import type { AppStore } from '../store/types'
import type { IImageStore } from '../imageStore/imageStore'
import type { Note } from '../../types'
import {
  extractAssetUris,
  onImageInserted,
  handleNoteDeleted,
  setupImageWiring,
} from './imageWiring'

// ─── Mock ImageStore ─────────────────────────────────────────────────────────

function createMockImageStore(): IImageStore {
  return {
    save: vi.fn().mockResolvedValue('asset://local/test.png'),
    load: vi.fn().mockResolvedValue(null),
    addRef: vi.fn().mockResolvedValue(undefined),
    removeRef: vi.fn().mockResolvedValue(undefined),
    cleanOrphans: vi.fn().mockResolvedValue(0),
    getUsage: vi.fn().mockResolvedValue({ count: 0, bytes: 0 }),
  }
}

// ─── Test Store Factory ──────────────────────────────────────────────────────

function createTestStore() {
  return createStore<AppStore>()(
    immer((set, get, store) => ({
      ...createNoteSlice(set, get),
      ...createFolderSlice(set, get, store),
      ...createSyncSlice(set, get, store),
      ...createUISlice(set, get, store),
    }))
  )
}

// ─── Helper: Create a note with image content ────────────────────────────────

function makeNoteWithImages(id: string, assetUris: string[]): Note {
  // Build a simple TipTap JSON with image nodes
  const imageNodes = assetUris.map((uri) => ({
    type: 'image',
    attrs: { src: uri },
  }))
  const content = JSON.stringify({
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
      ...imageNodes,
    ],
  })

  return {
    id,
    title: 'Test Note',
    content,
    tags: [],
    folderId: null,
    pinned: false,
    favorited: false,
    locked: false,
    hidden: false,
    deletedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

// ─── extractAssetUris ────────────────────────────────────────────────────────

describe('extractAssetUris', () => {
  it('extracts asset URIs from TipTap JSON content', () => {
    const content = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: 'asset://local/abc-123.png' },
        },
        {
          type: 'image',
          attrs: { src: 'asset://local/def-456.jpg' },
        },
      ],
    })

    const uris = extractAssetUris(content)
    expect(uris).toContain('asset://local/abc-123.png')
    expect(uris).toContain('asset://local/def-456.jpg')
    expect(uris).toHaveLength(2)
  })

  it('returns empty array for content without asset URIs', () => {
    const content = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'No images' }] }],
    })

    expect(extractAssetUris(content)).toEqual([])
  })

  it('returns empty array for empty content', () => {
    expect(extractAssetUris('')).toEqual([])
  })

  it('deduplicates repeated URIs', () => {
    const uri = 'asset://local/same-image.png'
    const content = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: uri } },
        { type: 'image', attrs: { src: uri } },
      ],
    })

    const uris = extractAssetUris(content)
    expect(uris).toHaveLength(1)
    expect(uris[0]).toBe(uri)
  })

  it('does not match non-asset URIs', () => {
    const content = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'https://example.com/image.png' } },
        { type: 'image', attrs: { src: 'data:image/png;base64,abc' } },
      ],
    })

    expect(extractAssetUris(content)).toEqual([])
  })
})

// ─── onImageInserted ─────────────────────────────────────────────────────────

describe('onImageInserted', () => {
  it('calls imageStore.addRef with the correct arguments', async () => {
    const imageStore = createMockImageStore()
    const assetUri = 'asset://local/img-1.png'
    const noteId = 'note-123'

    await onImageInserted(imageStore, assetUri, noteId)

    expect(imageStore.addRef).toHaveBeenCalledWith(assetUri, noteId)
    expect(imageStore.addRef).toHaveBeenCalledTimes(1)
  })
})

// ─── handleNoteDeleted ───────────────────────────────────────────────────────

describe('handleNoteDeleted', () => {
  it('removes refs for all asset URIs in the note and cleans orphans', async () => {
    const imageStore = createMockImageStore()
    const note = makeNoteWithImages('note-1', [
      'asset://local/img-a.png',
      'asset://local/img-b.jpg',
    ])

    await handleNoteDeleted(imageStore, note)

    expect(imageStore.removeRef).toHaveBeenCalledWith('asset://local/img-a.png', 'note-1')
    expect(imageStore.removeRef).toHaveBeenCalledWith('asset://local/img-b.jpg', 'note-1')
    expect(imageStore.removeRef).toHaveBeenCalledTimes(2)
    expect(imageStore.cleanOrphans).toHaveBeenCalledTimes(1)
  })

  it('does not call cleanOrphans if note has no images', async () => {
    const imageStore = createMockImageStore()
    const note: Note = {
      id: 'note-2',
      title: 'No images',
      content: JSON.stringify({ type: 'doc', content: [] }),
      tags: [],
      folderId: null,
      pinned: false,
      favorited: false,
      locked: false,
      hidden: false,
      deletedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const result = await handleNoteDeleted(imageStore, note)

    expect(imageStore.removeRef).not.toHaveBeenCalled()
    expect(imageStore.cleanOrphans).not.toHaveBeenCalled()
    expect(result).toBe(0)
  })
})

// ─── setupImageWiring ────────────────────────────────────────────────────────

describe('setupImageWiring', () => {
  let store: ReturnType<typeof createTestStore>
  let imageStore: IImageStore

  beforeEach(() => {
    store = createTestStore()
    imageStore = createMockImageStore()
  })

  it('returns an unsubscribe function', () => {
    const unsubscribe = setupImageWiring(store, imageStore)
    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
  })

  it('calls removeRef and cleanOrphans when a note is permanently deleted', async () => {
    // Set up a note with images in the store
    const noteId = store.getState().createNote()
    const assetUri = 'asset://local/test-img.png'
    const content = JSON.stringify({
      type: 'doc',
      content: [{ type: 'image', attrs: { src: assetUri } }],
    })
    store.getState().updateNote(noteId, { content })

    // Wire up
    const unsubscribe = setupImageWiring(store, imageStore)

    // Permanently delete the note
    store.getState().permanentDelete(noteId)

    // Allow async handlers to complete
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(imageStore.removeRef).toHaveBeenCalledWith(assetUri, noteId)
    expect(imageStore.cleanOrphans).toHaveBeenCalled()

    unsubscribe()
  })

  it('handles emptyTrash removing multiple notes with images', async () => {
    // Create two notes with images and soft-delete them
    const noteId1 = store.getState().createNote()
    const noteId2 = store.getState().createNote()

    const uri1 = 'asset://local/img-1.png'
    const uri2 = 'asset://local/img-2.jpg'

    store.getState().updateNote(noteId1, {
      content: JSON.stringify({ type: 'doc', content: [{ type: 'image', attrs: { src: uri1 } }] }),
    })
    store.getState().updateNote(noteId2, {
      content: JSON.stringify({ type: 'doc', content: [{ type: 'image', attrs: { src: uri2 } }] }),
    })

    // Soft-delete both
    store.getState().deleteNote(noteId1)
    store.getState().deleteNote(noteId2)

    // Wire up
    const unsubscribe = setupImageWiring(store, imageStore)

    // Empty trash
    store.getState().emptyTrash()

    // Allow async handlers to complete
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(imageStore.removeRef).toHaveBeenCalledWith(uri1, noteId1)
    expect(imageStore.removeRef).toHaveBeenCalledWith(uri2, noteId2)
    expect(imageStore.cleanOrphans).toHaveBeenCalledTimes(2)

    unsubscribe()
  })

  it('does not trigger cleanup for soft-delete (note still in array)', async () => {
    const noteId = store.getState().createNote()
    store.getState().updateNote(noteId, {
      content: JSON.stringify({
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'asset://local/x.png' } }],
      }),
    })

    const unsubscribe = setupImageWiring(store, imageStore)

    // Soft-delete (note remains in array with deletedAt set)
    store.getState().deleteNote(noteId)

    await new Promise((resolve) => setTimeout(resolve, 10))

    // Should NOT trigger image cleanup — note is still in the array
    expect(imageStore.removeRef).not.toHaveBeenCalled()
    expect(imageStore.cleanOrphans).not.toHaveBeenCalled()

    unsubscribe()
  })

  it('stops listening after unsubscribe', async () => {
    const noteId = store.getState().createNote()
    store.getState().updateNote(noteId, {
      content: JSON.stringify({
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'asset://local/y.png' } }],
      }),
    })

    const unsubscribe = setupImageWiring(store, imageStore)
    unsubscribe()

    // Permanently delete after unsubscribe
    store.getState().permanentDelete(noteId)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(imageStore.removeRef).not.toHaveBeenCalled()
  })
})
