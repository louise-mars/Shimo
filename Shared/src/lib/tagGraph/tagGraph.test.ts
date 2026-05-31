import { describe, it, expect, vi } from 'vitest'
import {
  buildTagGraph,
  selectNodes,
  computeTagEdges,
  computeTemporalEdges,
  computeSemanticEdges,
  cosineSimilarity,
} from './tagGraph'
import type { Note } from '../../types'

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeNote(overrides: Partial<Note> & { id: string }): Note {
  return {
    title: '',
    content: '{}',
    tags: [],
    folderId: null,
    pinned: false,
    favorited: false,
    locked: false,
    hidden: false,
    deletedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

// ─── cosineSimilarity ────────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 2, 3]
    expect(cosineSimilarity(v, v)).toBeCloseTo(1)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
  })

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1)
  })

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0)
  })

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0)
  })

  it('returns 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0)
  })
})

// ─── computeTagEdges ─────────────────────────────────────────────────────────

describe('computeTagEdges', () => {
  it('creates edges for notes sharing tags', () => {
    const notes = [
      makeNote({ id: 'a', tags: ['js', 'react'] }),
      makeNote({ id: 'b', tags: ['react', 'vue'] }),
      makeNote({ id: 'c', tags: ['python'] }),
    ]

    const edges = computeTagEdges(notes)

    expect(edges).toHaveLength(1)
    expect(edges[0]).toEqual({
      source: 'a',
      target: 'b',
      weight: 1,
      type: 'tag',
    })
  })

  it('weight equals number of shared tags', () => {
    const notes = [
      makeNote({ id: 'a', tags: ['js', 'react', 'web'] }),
      makeNote({ id: 'b', tags: ['react', 'web', 'css'] }),
    ]

    const edges = computeTagEdges(notes)

    expect(edges[0].weight).toBe(2)
  })

  it('returns empty for notes with no shared tags', () => {
    const notes = [
      makeNote({ id: 'a', tags: ['js'] }),
      makeNote({ id: 'b', tags: ['python'] }),
    ]

    expect(computeTagEdges(notes)).toHaveLength(0)
  })

  it('skips notes with no tags', () => {
    const notes = [
      makeNote({ id: 'a', tags: [] }),
      makeNote({ id: 'b', tags: ['react'] }),
    ]

    expect(computeTagEdges(notes)).toHaveLength(0)
  })
})

// ─── computeTemporalEdges ────────────────────────────────────────────────────

describe('computeTemporalEdges', () => {
  it('creates edges for notes updated within 24h of each other', () => {
    const now = Date.now()
    const notes = [
      makeNote({ id: 'a', updatedAt: now }),
      makeNote({ id: 'b', updatedAt: now - 12 * 60 * 60 * 1000 }), // 12h ago
    ]

    const edges = computeTemporalEdges(notes)

    expect(edges).toHaveLength(1)
    expect(edges[0].type).toBe('temporal')
    expect(edges[0].weight).toBeCloseTo(0.5)
  })

  it('does not create edges for notes more than 24h apart', () => {
    const now = Date.now()
    const notes = [
      makeNote({ id: 'a', updatedAt: now }),
      makeNote({ id: 'b', updatedAt: now - 25 * 60 * 60 * 1000 }), // 25h ago
    ]

    expect(computeTemporalEdges(notes)).toHaveLength(0)
  })

  it('weight is 1 for notes updated at the same time', () => {
    const now = Date.now()
    const notes = [
      makeNote({ id: 'a', updatedAt: now }),
      makeNote({ id: 'b', updatedAt: now }),
    ]

    const edges = computeTemporalEdges(notes)

    expect(edges[0].weight).toBeCloseTo(1)
  })

  it('weight approaches 0 for notes nearly 24h apart', () => {
    const now = Date.now()
    const notes = [
      makeNote({ id: 'a', updatedAt: now }),
      makeNote({ id: 'b', updatedAt: now - 23.9 * 60 * 60 * 1000 }),
    ]

    const edges = computeTemporalEdges(notes)

    expect(edges[0].weight).toBeLessThan(0.01)
  })
})

// ─── computeSemanticEdges ────────────────────────────────────────────────────

describe('computeSemanticEdges', () => {
  it('creates edges for notes with similarity >= 0.7', () => {
    const notes = [
      makeNote({ id: 'a' }),
      makeNote({ id: 'b' }),
    ]

    // Vectors with high cosine similarity
    const embeddings = new Map<string, number[]>([
      ['a', [1, 0, 0]],
      ['b', [0.9, 0.1, 0]],
    ])

    const edges = computeSemanticEdges(notes, embeddings)

    expect(edges).toHaveLength(1)
    expect(edges[0].type).toBe('semantic')
    expect(edges[0].weight).toBeGreaterThanOrEqual(0.7)
  })

  it('does not create edges for notes with similarity < 0.7', () => {
    const notes = [
      makeNote({ id: 'a' }),
      makeNote({ id: 'b' }),
    ]

    // Orthogonal vectors
    const embeddings = new Map<string, number[]>([
      ['a', [1, 0, 0]],
      ['b', [0, 1, 0]],
    ])

    expect(computeSemanticEdges(notes, embeddings)).toHaveLength(0)
  })

  it('skips notes without embeddings', () => {
    const notes = [
      makeNote({ id: 'a' }),
      makeNote({ id: 'b' }),
      makeNote({ id: 'c' }),
    ]

    const embeddings = new Map<string, number[]>([
      ['a', [1, 0, 0]],
      // 'b' has no embedding
      ['c', [0.95, 0.05, 0]],
    ])

    const edges = computeSemanticEdges(notes, embeddings)

    // Only a-c edge possible
    expect(edges.every((e) => e.source !== 'b' && e.target !== 'b')).toBe(true)
  })
})

// ─── selectNodes ─────────────────────────────────────────────────────────────

describe('selectNodes', () => {
  it('returns all notes when count <= maxNodes', () => {
    const notes = [
      makeNote({ id: 'a' }),
      makeNote({ id: 'b' }),
    ]

    const selected = selectNodes(notes, 'a', 30)

    expect(selected).toHaveLength(2)
  })

  it('limits to maxNodes', () => {
    const notes = Array.from({ length: 50 }, (_, i) =>
      makeNote({ id: `note-${i}`, updatedAt: Date.now() - i * 1000 })
    )

    const selected = selectNodes(notes, 'note-0', 30)

    expect(selected).toHaveLength(30)
  })

  it('includes active note first', () => {
    const notes = Array.from({ length: 50 }, (_, i) =>
      makeNote({ id: `note-${i}`, updatedAt: Date.now() - i * 1000 })
    )

    const selected = selectNodes(notes, 'note-40', 5)

    expect(selected.some((n) => n.id === 'note-40')).toBe(true)
  })

  it('prioritizes notes sharing tags with active note', () => {
    const notes = [
      makeNote({ id: 'active', tags: ['react', 'js'], updatedAt: 100 }),
      makeNote({ id: 'related', tags: ['react'], updatedAt: 50 }),
      makeNote({ id: 'unrelated', tags: ['python'], updatedAt: 200 }),
      makeNote({ id: 'also-related', tags: ['js', 'react'], updatedAt: 30 }),
      makeNote({ id: 'recent', tags: [], updatedAt: 300 }),
    ]

    const selected = selectNodes(notes, 'active', 3)

    // Active note + 2 most related by shared tags
    expect(selected.map((n) => n.id)).toContain('active')
    expect(selected.map((n) => n.id)).toContain('also-related') // 2 shared tags
    expect(selected.map((n) => n.id)).toContain('related') // 1 shared tag
  })

  it('fills remaining slots with most recent notes', () => {
    const notes = [
      makeNote({ id: 'active', tags: ['unique'], updatedAt: 100 }),
      makeNote({ id: 'recent1', tags: [], updatedAt: 500 }),
      makeNote({ id: 'recent2', tags: [], updatedAt: 400 }),
      makeNote({ id: 'old', tags: [], updatedAt: 10 }),
    ]

    const selected = selectNodes(notes, 'active', 3)

    expect(selected.map((n) => n.id)).toContain('active')
    expect(selected.map((n) => n.id)).toContain('recent1')
    expect(selected.map((n) => n.id)).toContain('recent2')
  })

  it('works when activeNoteId is null', () => {
    const notes = Array.from({ length: 50 }, (_, i) =>
      makeNote({ id: `note-${i}`, updatedAt: Date.now() - i * 1000 })
    )

    const selected = selectNodes(notes, null, 10)

    expect(selected).toHaveLength(10)
    // Should be the 10 most recent
    expect(selected[0].id).toBe('note-0')
  })
})

// ─── buildTagGraph (integration) ─────────────────────────────────────────────

describe('buildTagGraph', () => {
  it('returns empty graph for empty notes', async () => {
    const result = await buildTagGraph([], null)

    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
  })

  it('excludes deleted notes', async () => {
    const notes = [
      makeNote({ id: 'a', deletedAt: Date.now() }),
      makeNote({ id: 'b', deletedAt: null }),
    ]

    const result = await buildTagGraph(notes, null)

    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].id).toBe('b')
  })

  it('marks active note in graph nodes', async () => {
    const notes = [
      makeNote({ id: 'a' }),
      makeNote({ id: 'b' }),
    ]

    const result = await buildTagGraph(notes, 'a')

    const activeNode = result.nodes.find((n) => n.id === 'a')
    const otherNode = result.nodes.find((n) => n.id === 'b')

    expect(activeNode?.isActive).toBe(true)
    expect(otherNode?.isActive).toBe(false)
  })

  it('limits nodes to maxNodes', async () => {
    const notes = Array.from({ length: 50 }, (_, i) =>
      makeNote({ id: `note-${i}`, updatedAt: Date.now() - i * 1000 })
    )

    const result = await buildTagGraph(notes, null, { maxNodes: 10 })

    expect(result.nodes).toHaveLength(10)
  })

  it('defaults maxNodes to 30', async () => {
    const notes = Array.from({ length: 50 }, (_, i) =>
      makeNote({ id: `note-${i}`, updatedAt: Date.now() - i * 1000 })
    )

    const result = await buildTagGraph(notes, null)

    expect(result.nodes).toHaveLength(30)
  })

  it('computes tag and temporal edges', async () => {
    const now = Date.now()
    const notes = [
      makeNote({ id: 'a', tags: ['react'], updatedAt: now }),
      makeNote({ id: 'b', tags: ['react'], updatedAt: now - 6 * 60 * 60 * 1000 }),
    ]

    const result = await buildTagGraph(notes, 'a')

    const tagEdges = result.edges.filter((e) => e.type === 'tag')
    const temporalEdges = result.edges.filter((e) => e.type === 'temporal')

    expect(tagEdges).toHaveLength(1)
    expect(temporalEdges).toHaveLength(1)
  })

  it('fetches embeddings and computes semantic edges', async () => {
    const notes = [
      makeNote({ id: 'a' }),
      makeNote({ id: 'b' }),
    ]

    const mockFetchEmbeddings = vi.fn().mockResolvedValue(
      new Map<string, number[]>([
        ['a', [1, 0, 0]],
        ['b', [0.95, 0.05, 0]],
      ])
    )

    const result = await buildTagGraph(notes, 'a', {
      fetchEmbeddings: mockFetchEmbeddings,
    })

    expect(mockFetchEmbeddings).toHaveBeenCalledWith(['a', 'b'])
    const semanticEdges = result.edges.filter((e) => e.type === 'semantic')
    expect(semanticEdges).toHaveLength(1)
  })

  it('gracefully degrades when fetchEmbeddings fails', async () => {
    const notes = [
      makeNote({ id: 'a', tags: ['react'] }),
      makeNote({ id: 'b', tags: ['react'] }),
    ]

    const mockFetchEmbeddings = vi.fn().mockRejectedValue(new Error('Network error'))

    const result = await buildTagGraph(notes, 'a', {
      fetchEmbeddings: mockFetchEmbeddings,
    })

    // Should still have tag edges, no semantic edges
    const semanticEdges = result.edges.filter((e) => e.type === 'semantic')
    expect(semanticEdges).toHaveLength(0)

    const tagEdges = result.edges.filter((e) => e.type === 'tag')
    expect(tagEdges).toHaveLength(1)
  })

  it('gracefully degrades when fetchEmbeddings is not provided', async () => {
    const notes = [
      makeNote({ id: 'a', tags: ['react'] }),
      makeNote({ id: 'b', tags: ['react'] }),
    ]

    const result = await buildTagGraph(notes, 'a')

    const semanticEdges = result.edges.filter((e) => e.type === 'semantic')
    expect(semanticEdges).toHaveLength(0)
  })

  it('includes correct node data', async () => {
    const notes = [
      makeNote({ id: 'a', title: 'Note A', tags: ['react', 'js'] }),
    ]

    const result = await buildTagGraph(notes, 'a')

    expect(result.nodes[0]).toEqual({
      id: 'a',
      title: 'Note A',
      tags: ['react', 'js'],
      isActive: true,
    })
  })
})
