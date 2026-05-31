import { describe, it, expect } from 'vitest'
import { fullTextSearch, type SemanticSearchResult } from './semanticSearch'
import type { Note } from '../../types'

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: overrides.id || 'note-1',
    title: overrides.title || '',
    content: overrides.content || '{"type":"doc","content":[]}',
    tags: overrides.tags || [],
    folderId: overrides.folderId ?? null,
    pinned: overrides.pinned ?? false,
    favorited: overrides.favorited ?? false,
    locked: overrides.locked ?? false,
    hidden: overrides.hidden ?? false,
    deletedAt: overrides.deletedAt ?? null,
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
  }
}

function makeNoteWithText(id: string, title: string, text: string): Note {
  const content = JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })
  return makeNote({ id, title, content })
}

describe('fullTextSearch', () => {
  it('returns empty array for empty query', () => {
    const notes = [makeNoteWithText('1', 'Hello', 'World')]
    expect(fullTextSearch('', notes)).toEqual([])
    expect(fullTextSearch('   ', notes)).toEqual([])
  })

  it('matches notes by content text', () => {
    const notes = [
      makeNoteWithText('1', '日记', '今天天气很好，去公园散步了'),
      makeNoteWithText('2', '工作', '完成了项目报告'),
      makeNoteWithText('3', '读书', '读了一本关于编程的书'),
    ]

    const results = fullTextSearch('公园', notes)
    expect(results).toHaveLength(1)
    expect(results[0].noteId).toBe('1')
    expect(results[0].similarity).toBeGreaterThan(0)
  })

  it('matches notes by title', () => {
    const notes = [
      makeNoteWithText('1', '日记', '内容一'),
      makeNoteWithText('2', '工作日志', '内容二'),
    ]

    const results = fullTextSearch('日记', notes)
    expect(results).toHaveLength(1)
    expect(results[0].noteId).toBe('1')
    // Title matches should have high similarity
    expect(results[0].similarity).toBeGreaterThanOrEqual(0.9)
  })

  it('ranks title matches higher than content matches', () => {
    const notes = [
      makeNoteWithText('1', '编程笔记', '今天学了 React'),
      makeNoteWithText('2', '日记', '今天写了一些编程笔记'),
    ]

    const results = fullTextSearch('编程', notes)
    expect(results).toHaveLength(2)
    // Title match should rank first
    expect(results[0].noteId).toBe('1')
    expect(results[0].similarity).toBeGreaterThan(results[1].similarity)
  })

  it('excludes deleted notes', () => {
    const notes = [
      makeNoteWithText('1', '活跃笔记', '搜索内容'),
      { ...makeNoteWithText('2', '已删除', '搜索内容'), deletedAt: Date.now() },
    ]

    const results = fullTextSearch('搜索', notes)
    expect(results).toHaveLength(1)
    expect(results[0].noteId).toBe('1')
  })

  it('excludes hidden notes', () => {
    const notes = [
      makeNoteWithText('1', '可见笔记', '搜索内容'),
      { ...makeNoteWithText('2', '隐藏笔记', '搜索内容'), hidden: true },
    ]

    const results = fullTextSearch('搜索', notes)
    expect(results).toHaveLength(1)
    expect(results[0].noteId).toBe('1')
  })

  it('respects the limit parameter', () => {
    const notes = Array.from({ length: 20 }, (_, i) =>
      makeNoteWithText(`note-${i}`, `笔记${i}`, `共同内容关键词`)
    )

    const results = fullTextSearch('关键词', notes, 5)
    expect(results).toHaveLength(5)
  })

  it('is case-insensitive for Latin text', () => {
    const notes = [
      makeNoteWithText('1', 'React Notes', 'Learning React hooks'),
    ]

    const results = fullTextSearch('react', notes)
    expect(results).toHaveLength(1)
    expect(results[0].noteId).toBe('1')
  })

  it('boosts score for multiple occurrences', () => {
    const notes = [
      makeNoteWithText('1', '笔记A', '编程是有趣的'),
      makeNoteWithText('2', '笔记B', '编程很好，编程让人快乐，编程是未来'),
    ]

    const results = fullTextSearch('编程', notes)
    expect(results).toHaveLength(2)
    // Note with more occurrences should have higher score
    expect(results[0].noteId).toBe('2')
  })

  it('handles notes with invalid JSON content gracefully', () => {
    const notes = [
      makeNote({ id: '1', title: '测试', content: 'invalid json' }),
      makeNoteWithText('2', '正常笔记', '测试内容'),
    ]

    // Should not throw, and should still find the valid note
    const results = fullTextSearch('测试', notes)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some(r => r.noteId === '1')).toBe(true) // title match
  })
})
