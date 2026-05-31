/**
 * Note History — Snapshot Management
 *
 * Manages note version history by storing snapshots in IndexedDB.
 *
 * Rules:
 * - Minimum 5-minute interval between snapshots for the same note
 * - Only creates a snapshot if content has actually changed
 * - Maximum 50 snapshots per note (oldest evicted when cap is reached)
 * - Snapshots stored in IndexedDB under 'snapshots' object store (via idbGet/idbSet with key prefix)
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { idbGet, idbSet } from '../storage/indexedDB'
import type { NoteSnapshot } from '../../types'

const SNAPSHOTS_KEY_PREFIX = 'snapshots-'
const MAX_SNAPSHOTS_PER_NOTE = 50
const MIN_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Create a snapshot for a note.
 *
 * Only creates a snapshot if:
 * 1. At least 5 minutes have elapsed since the last snapshot for this note
 * 2. The content has actually changed compared to the most recent snapshot
 *
 * If the note already has 50 snapshots, the oldest is evicted.
 *
 * @param noteId - The note's unique identifier
 * @param content - The current TipTap JSON content string
 * @param title - The current note title
 * @returns true if a snapshot was created, false if skipped
 */
export async function createSnapshot(
  noteId: string,
  content: string,
  title: string
): Promise<boolean> {
  const snapshots = await loadSnapshots(noteId)
  const latest = snapshots[0] ?? null

  // Rule 1: Enforce 5-minute minimum interval
  if (latest && Date.now() - latest.createdAt < MIN_INTERVAL_MS) {
    return false
  }

  // Rule 2: Content must have changed
  if (latest && latest.content === content) {
    return false
  }

  // Compute word count (Chinese characters + whitespace-separated words)
  const wordCount = computeWordCount(content)

  const snapshot: NoteSnapshot = {
    noteId,
    title,
    content,
    createdAt: Date.now(),
    wordCount,
  }

  // Prepend new snapshot and enforce 50-snapshot cap (evict oldest)
  const updated = [snapshot, ...snapshots].slice(0, MAX_SNAPSHOTS_PER_NOTE)
  await saveSnapshots(noteId, updated)

  return true
}

/**
 * Get all snapshots for a note, ordered by most recent first.
 *
 * @param noteId - The note's unique identifier
 * @returns Array of NoteSnapshot in reverse chronological order
 */
export async function getSnapshots(noteId: string): Promise<NoteSnapshot[]> {
  return loadSnapshots(noteId)
}

/**
 * Clear all snapshots for a note.
 * Called when a note is permanently deleted.
 *
 * @param noteId - The note's unique identifier
 */
export async function clearSnapshots(noteId: string): Promise<void> {
  await saveSnapshots(noteId, [])
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

async function loadSnapshots(noteId: string): Promise<NoteSnapshot[]> {
  const data = await idbGet<NoteSnapshot[]>(SNAPSHOTS_KEY_PREFIX + noteId)
  return data ?? []
}

async function saveSnapshots(noteId: string, snapshots: NoteSnapshot[]): Promise<void> {
  await idbSet(SNAPSHOTS_KEY_PREFIX + noteId, snapshots)
}

/**
 * Compute word count from content string.
 * Counts Chinese characters individually and whitespace-separated tokens for other text.
 * Strips JSON structure to approximate plain text word count.
 */
function computeWordCount(content: string): number {
  // Try to extract text from TipTap JSON
  let plainText: string
  try {
    const doc = JSON.parse(content)
    plainText = extractText(doc)
  } catch {
    // If not valid JSON, treat as plain text
    plainText = content
  }

  if (!plainText.trim()) return 0

  // Count Chinese characters
  const chineseChars = (plainText.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length

  // Count non-Chinese words (whitespace-separated)
  const nonChinese = plainText.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ').trim()
  const otherWords = nonChinese ? nonChinese.split(/\s+/).filter(Boolean).length : 0

  return chineseChars + otherWords
}

/**
 * Recursively extract plain text from a TipTap JSON node.
 */
function extractText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''

  const n = node as { type?: string; text?: string; content?: unknown[] }

  if (n.text) return n.text

  if (Array.isArray(n.content)) {
    return n.content.map(extractText).join('')
  }

  return ''
}

// ─── Exported Constants (for testing) ────────────────────────────────────────

export const CONSTANTS = {
  MAX_SNAPSHOTS_PER_NOTE,
  MIN_INTERVAL_MS,
  SNAPSHOTS_KEY_PREFIX,
} as const
