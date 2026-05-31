/**
 * Image Wiring — Connects the editor and note deletion to the ImageStore.
 *
 * 1. onImageInserted(assetUri, noteId): Adds a reference when an image is inserted into a note.
 * 2. Subscribes to the store to detect permanent note deletions, scans deleted note content
 *    for asset:// URIs, removes references, and cleans orphaned images.
 *
 * Usage:
 *   const unsubscribe = setupImageWiring(appStore, imageStore)
 *   // Later, to tear down:
 *   unsubscribe()
 */

import type { StoreApi } from 'zustand'
import type { AppStore } from '../store/types'
import type { IImageStore } from '../imageStore/imageStore'
import type { Note } from '../../types'

// ─── Asset URI Extraction ────────────────────────────────────────────────────

/**
 * Extract all asset:// URIs from a note's content string.
 * Matches the format: asset://local/{id}.{ext}
 */
export function extractAssetUris(content: string): string[] {
  if (!content) return []
  const regex = /asset:\/\/local\/[^"'\s)}\]]+/g
  const matches = content.match(regex)
  return matches ? [...new Set(matches)] : []
}

// ─── Helper: onImageInserted ─────────────────────────────────────────────────

/**
 * Called when an image is inserted into the editor.
 * Registers a reference from the note to the image asset.
 */
export function onImageInserted(
  imageStore: IImageStore,
  assetUri: string,
  noteId: string
): Promise<void> {
  return imageStore.addRef(assetUri, noteId)
}

// ─── Helper: Handle permanent note deletion ──────────────────────────────────

/**
 * When a note is permanently deleted, scan its content for asset:// URIs,
 * remove references for each, then clean orphaned images.
 */
export async function handleNoteDeleted(
  imageStore: IImageStore,
  note: Note
): Promise<number> {
  const uris = extractAssetUris(note.content)

  for (const uri of uris) {
    await imageStore.removeRef(uri, note.id)
  }

  // Clean up any images that now have zero references
  if (uris.length > 0) {
    return imageStore.cleanOrphans()
  }
  return 0
}

// ─── Setup Wiring ────────────────────────────────────────────────────────────

/**
 * Wire the image store to the Zustand store.
 *
 * Subscribes to the notes array and detects when notes are permanently removed.
 * When a note disappears from the array (permanent delete or empty trash),
 * its asset references are cleaned up.
 *
 * Returns an unsubscribe function to tear down the wiring.
 */
export function setupImageWiring(
  store: StoreApi<AppStore>,
  imageStore: IImageStore
): () => void {
  // Track the previous notes array to detect removals
  let previousNotes: Note[] = store.getState().notes

  const unsubscribe = store.subscribe((state: AppStore, prevState: AppStore) => {
    const currentNotes = state.notes

    // Only process if the notes array reference changed
    if (currentNotes === prevState.notes) {
      previousNotes = currentNotes
      return
    }

    // Find notes that were in previousNotes but are no longer in currentNotes
    const currentIds = new Set(currentNotes.map((n: Note) => n.id))
    const removedNotes = previousNotes.filter((n: Note) => !currentIds.has(n.id))

    // Process each removed note for image cleanup
    for (const note of removedNotes) {
      // Fire and forget — don't block the store subscription
      handleNoteDeleted(imageStore, note).catch((err: unknown) => {
        console.error('[imageWiring] Failed to clean images for note:', note.id, err)
      })
    }

    previousNotes = currentNotes
  })

  return unsubscribe
}
