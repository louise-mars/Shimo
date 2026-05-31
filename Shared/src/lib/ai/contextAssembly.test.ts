import { describe, it, expect } from 'vitest'
import { assembleContext, extractKeywords, estimateTokens } from './contextAssembly'
import type { Note } from '../../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: overrides.id ?? 'note-1',
    title: overrides.title ?? '测试笔记',
    content: overrides.content ?? JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '这是测试内容' }] }],
    }),
    tags: overrides.tags ?? [],
    folderId: overrides.folderId ?? null,
    pinned: overrides.pinned ?? false,
    favorited: overrides.favorited ?? false,
    locked: overrides.locked ?? false,
    hidden: overrides.hidden ?? false,
    deletedAt: overrides.deletedAt ?? null,
    createdAt: overrides.createdAt ?? 1000000,
    updatedAt: overrides.updatedAt ?? 1000000,
  }
}

function makeNoteWithText(id: string, title: string, text: string, tags: string[] = [], updatedAt = 1000000): Note {
  return makeNote({
    id,
    title,
    content: JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    }),
    tags,
    updatedAt,
  })
}

// ─── extractKeywords ─────────────────────────────────────────────────────────

describe('extractKeywords', () => {
  it('should split text on whitespace and punctuation', () => {
    const keywords = extractKeywords('hello world, how are you?')
    expect(keywords).toEqual(['hello', 'world', 'how', 'are', 'you'])
  })

  it('should filter out short tokens (< 2 chars)', () => {
    const keywords = extractKeywords('I am a test')
    // 'I', 'a' are < 2 chars, filtered out
    expect(keywords).toEqual(['am', 'test'])
  })

  it('should handle Chinese punctuation', () => {
    const keywords = extractKeywords('你好，世界！这是测试。')
    expect(keywords).toEqual(['你好', '世界', '这是测试'])
  })

  it('should lowercase all keywords', () => {
    const keywords = extractKeywords('Hello WORLD Test')
    expect(keywords).toEqual(['hello', 'world', 'test'])
  })

  it('should return empty array for empty string', () => {
    expect(extractKeywords('')).toEqual([])
  })

  it('should handle mixed Chinese and English', () => {
    const keywords = extractKeywords('React 组件 TypeScript 类型')
    expect(keywords).toEqual(['react', '组件', 'typescript', '类型'])
  })
})

// ─── estimateTokens ──────────────────────────────────────────────────────────

describe('estimateTokens', () => {
  it('should estimate ~4 chars per token', () => {
    const text = 'abcdefgh' // 8 chars → 2 tokens
    expect(estimateTokens(text)).toBe(2)
  })

  it('should round up', () => {
    const text = 'abcde' // 5 chars → ceil(5/4) = 2
    expect(estimateTokens(text)).toBe(2)
  })

  it('should handle empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })
})

// ─── assembleContext - Keyword Scoring ───────────────────────────────────────

describe('assembleContext - keyword scoring', () => {
  it('should select notes matching query keywords', () => {
    const notes = [
      makeNoteWithText('n1', 'React教程', 'React组件开发指南', ['react', '前端']),
      makeNoteWithText('n2', 'Vue教程', 'Vue组件开发指南', ['vue', '前端']),
      makeNoteWithText('n3', 'Node.js', 'Node服务端开发', ['node', '后端']),
      makeNoteWithText('n4', 'React Hooks', 'useEffect和useState', ['react', 'hooks']),
      makeNoteWithText('n5', 'CSS布局', 'Flexbox和Grid', ['css', '前端']),
    ]

    const result = assembleContext('React组件', notes)
    // Notes n1 and n4 should be prioritized (they contain "react")
    expect(result.noteIds).toContain('n1')
    expect(result.noteIds).toContain('n4')
  })

  it('should score by keyword overlap count', () => {
    const notes = [
      makeNoteWithText('n1', 'React Hooks教程', 'React Hooks是React的核心特性', ['react', 'hooks']),
      makeNoteWithText('n2', 'React基础', 'React入门', ['react']),
      makeNoteWithText('n3', 'Vue教程', 'Vue框架', ['vue']),
    ]

    const result = assembleContext('React Hooks', notes)
    // n1 has more keyword overlap (both "react" and "hooks")
    expect(result.noteIds[0]).toBe('n1')
  })

  it('should match keywords in tags', () => {
    const notes = [
      makeNoteWithText('n1', '笔记一', '普通内容', ['typescript', '编程']),
      makeNoteWithText('n2', '笔记二', '普通内容', ['python', '编程']),
      makeNoteWithText('n3', '笔记三', '普通内容', ['cooking', '生活']),
    ]

    const result = assembleContext('typescript编程', notes)
    expect(result.noteIds).toContain('n1')
  })
})

// ─── assembleContext - Recency Fallback ──────────────────────────────────────

describe('assembleContext - recency fallback', () => {
  it('should fall back to recency when fewer than 3 keyword matches', () => {
    const notes = [
      makeNoteWithText('n1', '旧笔记', '无关内容一', [], 1000),
      makeNoteWithText('n2', '较新笔记', '无关内容二', [], 2000),
      makeNoteWithText('n3', '最新笔记', '无关内容三', [], 3000),
      makeNoteWithText('n4', '匹配笔记', '包含搜索关键词', [], 1500),
    ]

    const result = assembleContext('搜索关键词', notes)
    // Only 1 keyword match (< 3), so should fall back to recency
    // Should include the keyword match plus most recent notes
    expect(result.noteIds).toContain('n4') // keyword match
    expect(result.noteIds).toContain('n3') // most recent
    expect(result.noteIds).toContain('n2') // second most recent
  })

  it('should use pure recency when no keywords match at all', () => {
    const notes = [
      makeNoteWithText('n1', '笔记A', '内容A', [], 1000),
      makeNoteWithText('n2', '笔记B', '内容B', [], 3000),
      makeNoteWithText('n3', '笔记C', '内容C', [], 2000),
    ]

    const result = assembleContext('完全不相关的查询xyz', notes)
    // No matches, pure recency: n2 (3000) > n3 (2000) > n1 (1000)
    expect(result.noteIds[0]).toBe('n2')
    expect(result.noteIds[1]).toBe('n3')
    expect(result.noteIds[2]).toBe('n1')
  })

  it('should place keyword matches before recency fills', () => {
    const notes = [
      makeNoteWithText('n1', '匹配笔记', '包含目标关键词', [], 500),
      makeNoteWithText('n2', '最新笔记', '无关内容', [], 5000),
      makeNoteWithText('n3', '较新笔记', '无关内容', [], 4000),
    ]

    const result = assembleContext('目标关键词', notes)
    // 1 keyword match (< 3), recency fallback
    // keyword match first, then fill with recency
    expect(result.noteIds[0]).toBe('n1') // keyword match
    expect(result.noteIds).toContain('n2') // recency fill
    expect(result.noteIds).toContain('n3') // recency fill
  })
})

// ─── assembleContext - Budget Truncation ─────────────────────────────────────

describe('assembleContext - budget truncation', () => {
  it('should respect token budget', () => {
    // Create notes with known content length
    // 8000 tokens * 4 chars/token = 32000 chars budget
    const longText = 'a'.repeat(20000)
    const notes = [
      makeNoteWithText('n1', '笔记一', longText, ['keyword'], 3000),
      makeNoteWithText('n2', '笔记二', longText, ['keyword'], 2000),
      makeNoteWithText('n3', '笔记三', longText, ['keyword'], 1000),
    ]

    const result = assembleContext('keyword', notes, { maxTokens: 8000 })
    // Total context should not exceed 8000 tokens (~32000 chars)
    const totalChars = result.context.length
    expect(totalChars).toBeLessThanOrEqual(32000)
  })

  it('should preserve title and first paragraph when truncating', () => {
    const longContent = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '第一段重要内容' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(50000) }] },
      ],
    })

    const notes = [
      makeNote({ id: 'n1', title: '重要标题', content: longContent, tags: ['keyword'], updatedAt: 3000 }),
      makeNote({ id: 'n2', title: '另一个', content: longContent, tags: ['keyword'], updatedAt: 2000 }),
      makeNote({ id: 'n3', title: '第三个', content: longContent, tags: ['keyword'], updatedAt: 1000 }),
    ]

    const result = assembleContext('keyword', notes, { maxTokens: 100 })
    // Should include the title of the first note
    expect(result.context).toContain('重要标题')
  })

  it('should stop adding notes when budget is exhausted', () => {
    // Very small budget
    const notes = [
      makeNoteWithText('n1', '笔记一', '短内容', ['keyword'], 3000),
      makeNoteWithText('n2', '笔记二', 'x'.repeat(5000), ['keyword'], 2000),
      makeNoteWithText('n3', '笔记三', 'y'.repeat(5000), ['keyword'], 1000),
    ]

    // Budget of 50 tokens = 200 chars — only first note should fit fully
    const result = assembleContext('keyword', notes, { maxTokens: 50 })
    const totalTokens = estimateTokens(result.context)
    expect(totalTokens).toBeLessThanOrEqual(50)
  })
})

// ─── assembleContext - Max Notes Limit ───────────────────────────────────────

describe('assembleContext - max notes limit', () => {
  it('should limit to 10 notes by default', () => {
    const notes = Array.from({ length: 20 }, (_, i) =>
      makeNoteWithText(`n${i}`, `笔记${i}`, `内容${i}`, ['共同标签'], i * 1000)
    )

    const result = assembleContext('共同标签', notes)
    expect(result.noteIds.length).toBeLessThanOrEqual(10)
  })

  it('should respect custom maxNotes option', () => {
    const notes = Array.from({ length: 20 }, (_, i) =>
      makeNoteWithText(`n${i}`, `笔记${i}`, `内容${i}`, ['共同标签'], i * 1000)
    )

    const result = assembleContext('共同标签', notes, { maxNotes: 5 })
    expect(result.noteIds.length).toBeLessThanOrEqual(5)
  })

  it('should return fewer notes if fewer are available', () => {
    const notes = [
      makeNoteWithText('n1', '笔记一', '内容一', ['tag'], 1000),
      makeNoteWithText('n2', '笔记二', '内容二', ['tag'], 2000),
    ]

    const result = assembleContext('tag', notes)
    expect(result.noteIds.length).toBe(2)
  })
})

// ─── assembleContext - Edge Cases ────────────────────────────────────────────

describe('assembleContext - edge cases', () => {
  it('should return empty result for empty notes array', () => {
    const result = assembleContext('test query', [])
    expect(result.context).toBe('')
    expect(result.noteIds).toEqual([])
  })

  it('should exclude deleted notes', () => {
    const notes = [
      makeNoteWithText('n1', '活跃笔记', '包含关键词', ['keyword'], 2000),
      makeNote({ id: 'n2', title: '已删除', tags: ['keyword'], deletedAt: 999, updatedAt: 3000 }),
    ]

    const result = assembleContext('keyword', notes)
    expect(result.noteIds).toContain('n1')
    expect(result.noteIds).not.toContain('n2')
  })

  it('should exclude hidden notes', () => {
    const notes = [
      makeNoteWithText('n1', '可见笔记', '包含关键词', ['keyword'], 2000),
      makeNote({ id: 'n2', title: '隐藏笔记', tags: ['keyword'], hidden: true, updatedAt: 3000 }),
    ]

    const result = assembleContext('keyword', notes)
    expect(result.noteIds).toContain('n1')
    expect(result.noteIds).not.toContain('n2')
  })

  it('should handle empty query gracefully', () => {
    const notes = [
      makeNoteWithText('n1', '笔记一', '内容一', [], 3000),
      makeNoteWithText('n2', '笔记二', '内容二', [], 2000),
    ]

    // Empty query → no keyword matches → recency fallback
    const result = assembleContext('', notes)
    expect(result.noteIds.length).toBeGreaterThan(0)
    expect(result.noteIds[0]).toBe('n1') // most recent
  })

  it('should return noteIds matching included notes', () => {
    const notes = [
      makeNoteWithText('n1', 'React', 'React内容', ['react'], 2000),
      makeNoteWithText('n2', 'Vue', 'Vue内容', ['vue'], 1000),
    ]

    const result = assembleContext('React', notes)
    // Each noteId should correspond to a note in the context
    for (const id of result.noteIds) {
      const note = notes.find((n) => n.id === id)
      expect(note).toBeDefined()
    }
  })
})
