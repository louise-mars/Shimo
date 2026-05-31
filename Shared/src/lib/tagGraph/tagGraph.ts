/**
 * Tag Graph Data Builder for D3 Force-Directed Visualization
 *
 * Builds a note-centric graph where:
 * - Nodes represent notes
 * - Edges represent relationships (shared tags, temporal proximity, semantic similarity)
 *
 * Node selection: Start from active note, expand by shared tags, limit to maxNodes (default 30).
 * Edge computation: tag overlap, temporal proximity (24h window), semantic similarity (cosine).
 * Graceful degradation: If fetchEmbeddings is not provided or fails, semantic edges are skipped.
 */

import type { Note } from '../../types'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string
  title: string
  tags: string[]
  isActive: boolean
}

export interface GraphEdge {
  source: string
  target: string
  weight: number
  type: 'tag' | 'temporal' | 'semantic'
}

export interface TagGraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface BuildTagGraphOptions {
  maxNodes?: number
  fetchEmbeddings?: (noteIds: string[]) => Promise<Map<string, number[]>>
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_MAX_NODES = 30
const TEMPORAL_WINDOW_MS = 24 * 60 * 60 * 1000 // 24 hours
const SIMILARITY_THRESHOLD = 0.7

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Build graph data for D3 force-directed visualization.
 *
 * @param notes - All available notes (active, non-deleted)
 * @param activeNoteId - Currently active note ID (graph centers on this)
 * @param options - Optional configuration (maxNodes, fetchEmbeddings)
 * @returns TagGraphData with nodes and edges
 */
export async function buildTagGraph(
  notes: Note[],
  activeNoteId: string | null,
  options?: BuildTagGraphOptions
): Promise<TagGraphData> {
  const maxNodes = options?.maxNodes ?? DEFAULT_MAX_NODES

  // Filter to active (non-deleted) notes only
  const activeNotes = notes.filter((n) => !n.deletedAt)

  if (activeNotes.length === 0) {
    return { nodes: [], edges: [] }
  }

  // Select nodes centered on active note
  const selectedNotes = selectNodes(activeNotes, activeNoteId, maxNodes)

  if (selectedNotes.length === 0) {
    return { nodes: [], edges: [] }
  }

  // Build graph nodes
  const graphNodes: GraphNode[] = selectedNotes.map((note) => ({
    id: note.id,
    title: note.title,
    tags: note.tags,
    isActive: note.id === activeNoteId,
  }))

  // Compute edges
  const edges: GraphEdge[] = []

  // 1. Tag-based edges (shared tags between notes)
  const tagEdges = computeTagEdges(selectedNotes)
  edges.push(...tagEdges)

  // 2. Temporal proximity edges (notes updated within 24h of each other)
  const temporalEdges = computeTemporalEdges(selectedNotes)
  edges.push(...temporalEdges)

  // 3. Semantic similarity edges (cosine similarity of embeddings)
  if (options?.fetchEmbeddings) {
    try {
      const noteIds = selectedNotes.map((n) => n.id)
      const embeddings = await options.fetchEmbeddings(noteIds)
      if (embeddings && embeddings.size > 0) {
        const semanticEdges = computeSemanticEdges(selectedNotes, embeddings)
        edges.push(...semanticEdges)
      }
    } catch {
      // Graceful degradation: skip semantic edges on failure
    }
  }

  return { nodes: graphNodes, edges }
}

// ─── Node Selection ──────────────────────────────────────────────────────────

/**
 * Select up to maxNodes notes, centered on the active note.
 * Strategy:
 * 1. Start with the active note
 * 2. Expand to notes sharing tags with the active note
 * 3. Fill remaining slots with most recently updated notes
 */
export function selectNodes(
  notes: Note[],
  activeNoteId: string | null,
  maxNodes: number
): Note[] {
  if (notes.length <= maxNodes) {
    return notes
  }

  const selected = new Map<string, Note>()

  // 1. Add active note first
  const activeNote = activeNoteId
    ? notes.find((n) => n.id === activeNoteId)
    : null

  if (activeNote) {
    selected.set(activeNote.id, activeNote)

    // 2. Expand by shared tags (notes that share at least one tag with active note)
    if (activeNote.tags.length > 0) {
      const tagSet = new Set(activeNote.tags)
      const neighbors = notes
        .filter((n) => n.id !== activeNote.id && n.tags.some((t) => tagSet.has(t)))
        .sort((a, b) => {
          // Sort by number of shared tags (descending), then by recency
          const aShared = a.tags.filter((t) => tagSet.has(t)).length
          const bShared = b.tags.filter((t) => tagSet.has(t)).length
          if (bShared !== aShared) return bShared - aShared
          return b.updatedAt - a.updatedAt
        })

      for (const neighbor of neighbors) {
        if (selected.size >= maxNodes) break
        selected.set(neighbor.id, neighbor)
      }
    }
  }

  // 3. Fill remaining slots with most recently updated notes
  if (selected.size < maxNodes) {
    const remaining = notes
      .filter((n) => !selected.has(n.id))
      .sort((a, b) => b.updatedAt - a.updatedAt)

    for (const note of remaining) {
      if (selected.size >= maxNodes) break
      selected.set(note.id, note)
    }
  }

  return Array.from(selected.values())
}

// ─── Edge Computation ────────────────────────────────────────────────────────

/**
 * Compute tag-based edges: notes sharing at least one tag.
 * Weight = number of shared tags.
 */
export function computeTagEdges(notes: Note[]): GraphEdge[] {
  const edges: GraphEdge[] = []

  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const a = notes[i]
      const b = notes[j]

      if (a.tags.length === 0 || b.tags.length === 0) continue

      const sharedTags = a.tags.filter((t) => b.tags.includes(t))
      if (sharedTags.length > 0) {
        edges.push({
          source: a.id,
          target: b.id,
          weight: sharedTags.length,
          type: 'tag',
        })
      }
    }
  }

  return edges
}

/**
 * Compute temporal proximity edges: notes updated within 24 hours of each other.
 * Weight = 1 - (timeDiff / 24h), so closer in time = higher weight.
 */
export function computeTemporalEdges(notes: Note[]): GraphEdge[] {
  const edges: GraphEdge[] = []

  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const a = notes[i]
      const b = notes[j]

      const timeDiff = Math.abs(a.updatedAt - b.updatedAt)
      if (timeDiff <= TEMPORAL_WINDOW_MS) {
        const weight = 1 - timeDiff / TEMPORAL_WINDOW_MS
        edges.push({
          source: a.id,
          target: b.id,
          weight,
          type: 'temporal',
        })
      }
    }
  }

  return edges
}

/**
 * Compute semantic similarity edges using cosine similarity of embeddings.
 * Only creates edges where similarity >= threshold (0.7).
 */
export function computeSemanticEdges(
  notes: Note[],
  embeddings: Map<string, number[]>
): GraphEdge[] {
  const edges: GraphEdge[] = []

  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const a = notes[i]
      const b = notes[j]

      const embA = embeddings.get(a.id)
      const embB = embeddings.get(b.id)

      if (!embA || !embB) continue

      const similarity = cosineSimilarity(embA, embB)
      if (similarity >= SIMILARITY_THRESHOLD) {
        edges.push({
          source: a.id,
          target: b.id,
          weight: similarity,
          type: 'semantic',
        })
      }
    }
  }

  return edges
}

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1 (typically 0 to 1 for embeddings).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) return 0

  return dotProduct / denominator
}
