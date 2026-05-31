/**
 * AI Context Assembly Module
 *
 * Assembles relevant note context for AI queries using keyword scoring
 * with recency fallback and token budget management.
 */

import type { Note } from '../../types'
import { extractPlainText } from '../../utils/tiptap'

// ─── Public Interface ────────────────────────────────────────────────────────

export interface AssembleContextOptions {
  maxTokens?: number  // default: 8000
  maxNotes?: number   // default: 10
}

export interface AssembleContextResult {
  context: string
  noteIds: string[]
}

// ─── Token Estimation ────────────────────────────────────────────────────────

/**
 * Estimate token count for a string.
 * Uses ~4 chars per token as a rough heuristic for both Chinese and English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ─── Keyword Extraction ──────────────────────────────────────────────────────

/**
 * Extract keywords from text by splitting on whitespace and common punctuation.
 * Filters out empty strings and very short tokens (< 2 chars).
 */
export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,;.!?，。；！？、：:""''「」【】（）()\[\]{}<>《》\n\r\t]+/)
    .filter((token) => token.length >= 2)
}

// ─── Keyword Scoring ─────────────────────────────────────────────────────────

/**
 * Score a note by keyword overlap with query keywords.
 * Searches across title, tags, and content plain text.
 */
function scoreByKeywordOverlap(keywords: string[], note: Note): number {
  const plainText = extractPlainText(note.content)
  const noteText = `${note.title} ${note.tags.join(' ')} ${plainText}`.toLowerCase()
  return keywords.filter((kw) => noteText.includes(kw)).length
}

// ─── Truncation ──────────────────────────────────────────────────────────────

/**
 * Truncate note text to fit within a character budget,
 * preserving the title and first paragraph.
 */
function truncatePreservingStart(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text

  // Find end of first paragraph (double newline or first significant break)
  const firstParaEnd = text.indexOf('\n\n')
  const preserveEnd = firstParaEnd > 0 ? Math.min(firstParaEnd, maxChars) : Math.min(text.length, maxChars)

  // If the first paragraph fits, include it fully then truncate the rest
  if (preserveEnd <= maxChars) {
    return text.slice(0, maxChars)
  }

  return text.slice(0, maxChars)
}

/**
 * Format a single note for context inclusion.
 * Returns: "## {title}\n{plainText}"
 */
function formatNoteForContext(note: Note): string {
  const plainText = extractPlainText(note.content)
  const title = note.title || '无标题'
  return `## ${title}\n${plainText}`
}

// ─── Main Assembly Function ──────────────────────────────────────────────────

/**
 * Assemble context for AI query from a set of notes.
 *
 * Algorithm:
 * 1. Filter out deleted and hidden notes
 * 2. Score notes by keyword overlap with query (title + tags + content)
 * 3. If fewer than 3 notes match keywords, fill remaining slots with most recently updated notes
 * 4. Take top N notes (default 10)
 * 5. Truncate to fit within token budget (default 8000), preserving title + first paragraph
 *
 * @param query - The user's question/query
 * @param notes - All available notes
 * @param options - Optional configuration for maxTokens and maxNotes
 * @returns Object with assembled context string and included note IDs
 */
export function assembleContext(
  query: string,
  notes: Note[],
  options?: AssembleContextOptions
): AssembleContextResult {
  const maxTokens = options?.maxTokens ?? 8000
  const maxNotes = options?.maxNotes ?? 10

  // Filter active notes only
  const activeNotes = notes.filter((n) => !n.deletedAt && !n.hidden)

  if (activeNotes.length === 0) {
    return { context: '', noteIds: [] }
  }

  // Extract keywords from query
  const keywords = extractKeywords(query)

  // Score by keyword overlap
  const scored = activeNotes.map((note) => ({
    note,
    score: keywords.length > 0 ? scoreByKeywordOverlap(keywords, note) : 0,
  }))

  // Determine which notes matched by keywords
  const keywordMatches = scored.filter((s) => s.score > 0)

  let selectedNotes: Note[]

  if (keywordMatches.length >= 3) {
    // Enough keyword matches — sort by score descending, take top N
    keywordMatches.sort((a, b) => b.score - a.score)
    selectedNotes = keywordMatches.slice(0, maxNotes).map((s) => s.note)
  } else {
    // Recency fallback: start with keyword matches, fill remaining with most recent
    const matchedIds = new Set(keywordMatches.map((s) => s.note.id))
    const matchedNotes = keywordMatches
      .sort((a, b) => b.score - a.score)
      .map((s) => s.note)

    // Fill remaining slots with most recently updated notes (not already included)
    const remaining = activeNotes
      .filter((n) => !matchedIds.has(n.id))
      .sort((a, b) => b.updatedAt - a.updatedAt)

    selectedNotes = [...matchedNotes, ...remaining].slice(0, maxNotes)
  }

  // Apply token budget with truncation
  const maxChars = maxTokens * 4 // ~4 chars per token
  const contextParts: string[] = []
  const noteIds: string[] = []
  let usedChars = 0
  const separatorLen = 2 // '\n\n' between notes

  for (const note of selectedNotes) {
    const formatted = formatNoteForContext(note)
    // Account for separator if not the first note
    const separatorCost = contextParts.length > 0 ? separatorLen : 0
    const noteChars = formatted.length + separatorCost

    if (usedChars + noteChars <= maxChars) {
      // Fits entirely
      contextParts.push(formatted)
      noteIds.push(note.id)
      usedChars += noteChars
    } else {
      // Truncate this note to fit remaining budget
      const remainingChars = maxChars - usedChars - separatorCost
      if (remainingChars > 0) {
        const truncated = truncatePreservingStart(formatted, remainingChars)
        if (truncated.length > 0) {
          contextParts.push(truncated)
          noteIds.push(note.id)
          usedChars += truncated.length + separatorCost
        }
      }
      break // Budget exhausted
    }
  }

  return {
    context: contextParts.join('\n\n'),
    noteIds,
  }
}
