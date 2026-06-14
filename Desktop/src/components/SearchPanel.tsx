/**
 * SearchPanel — Advanced search overlay with:
 * - Full-text search across all note content
 * - Date range filtering
 * - Tag filtering
 * - Regex support (toggle)
 * - Results with highlighted context snippets
 * - Saved searches (localStorage)
 *
 * Triggered via Ctrl+F (global) or from Command Palette
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useAppStore } from '@notepro/shared'
import { extractText, getPreview } from '@notepro/shared'
import { pinyinMatch } from '@notepro/shared'
import type { Note } from '@notepro/shared'

interface Props {
  onClose: () => void
}

interface SearchResult {
  note: Note
  matchContext: string // Snippet around the match
  matchType: 'title' | 'content' | 'tag'
  score: number
}

interface SavedSearch {
  id: string
  query: string
  filters: SearchFilters
  createdAt: number
}

interface SearchFilters {
  dateFrom: string // YYYY-MM-DD or ''
  dateTo: string
  tags: string[]
  useRegex: boolean
  onlyFavorites: boolean
  onlyWithTasks: boolean
}

const SAVED_SEARCHES_KEY = 'shimo-saved-searches'
const DEFAULT_FILTERS: SearchFilters = {
  dateFrom: '',
  dateTo: '',
  tags: [],
  useRegex: false,
  onlyFavorites: false,
  onlyWithTasks: false,
}

function loadSavedSearches(): SavedSearch[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_SEARCHES_KEY) || '[]')
  } catch { return [] }
}

function saveSavedSearches(searches: SavedSearch[]) {
  localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(searches.slice(0, 10)))
}

function getContextSnippet(text: string, query: string, maxLen = 100): string {
  const lower = text.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx === -1) return text.slice(0, maxLen)
  const start = Math.max(0, idx - 30)
  const end = Math.min(text.length, idx + query.length + 70)
  let snippet = text.slice(start, end)
  if (start > 0) snippet = '…' + snippet
  if (end < text.length) snippet = snippet + '…'
  return snippet
}

function hasTaskList(content: string): boolean {
  return content.includes('"taskList"') || content.includes('"taskItem"')
}

export default function SearchPanel({ onClose }: Props) {
  const notes = useAppStore((s) => s.notes)
  const setActiveNote = useAppStore((s) => s.setActiveNote)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const [savedSearches, setSavedSearches] = useState(loadSavedSearches)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // All tags for filter dropdown
  const allTags = useMemo(() => {
    const tagMap = new Map<string, number>()
    notes.filter(n => !n.deletedAt).forEach(n => n.tags.forEach(t => tagMap.set(t, (tagMap.get(t) || 0) + 1)))
    return Array.from(tagMap.entries()).sort((a, b) => b[1] - a[1]).map(([t]) => t)
  }, [notes])

  // Search results
  const results: SearchResult[] = useMemo(() => {
    if (!query.trim() && !filters.tags.length && !filters.onlyFavorites && !filters.onlyWithTasks) return []

    const q = query.trim()
    let regex: RegExp | null = null
    if (filters.useRegex && q) {
      try { regex = new RegExp(q, 'gi') } catch { /* invalid regex, fall back to literal */ }
    }

    const results: SearchResult[] = []

    for (const note of notes) {
      if (note.deletedAt || note.hidden) continue

      // Date filter
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom).getTime()
        if (note.updatedAt < from) continue
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo).getTime() + 86400000 // end of day
        if (note.updatedAt > to) continue
      }

      // Tag filter
      if (filters.tags.length > 0) {
        if (!filters.tags.some(t => note.tags.includes(t))) continue
      }

      // Favorites filter
      if (filters.onlyFavorites && !note.favorited) continue

      // Tasks filter
      if (filters.onlyWithTasks && !hasTaskList(note.content)) continue

      // If no text query, just show filtered notes
      if (!q) {
        results.push({
          note,
          matchContext: getPreview(note.content, 80),
          matchType: 'content',
          score: note.updatedAt,
        })
        continue
      }

      // Text search
      const titleText = note.title || ''
      const contentText = extractText(note.content)

      if (regex) {
        // Regex search
        regex.lastIndex = 0
        const titleMatch = regex.test(titleText)
        regex.lastIndex = 0
        const contentMatch = regex.test(contentText)

        if (titleMatch) {
          results.push({ note, matchContext: titleText, matchType: 'title', score: 1000 })
        } else if (contentMatch) {
          regex.lastIndex = 0
          const match = regex.exec(contentText)
          const ctx = match ? getContextSnippet(contentText, match[0]) : contentText.slice(0, 100)
          results.push({ note, matchContext: ctx, matchType: 'content', score: 500 })
        }
      } else {
        // Standard search (substring + pinyin)
        const lowerQ = q.toLowerCase()
        const lowerTitle = titleText.toLowerCase()
        const lowerContent = contentText.toLowerCase()

        if (lowerTitle.includes(lowerQ) || pinyinMatch(titleText, q)) {
          results.push({
            note,
            matchContext: getContextSnippet(contentText, q),
            matchType: 'title',
            score: 1000,
          })
        } else if (lowerContent.includes(lowerQ)) {
          results.push({
            note,
            matchContext: getContextSnippet(contentText, q),
            matchType: 'content',
            score: 500,
          })
        } else if (note.tags.some(t => pinyinMatch(t, q) || t.toLowerCase().includes(lowerQ))) {
          results.push({
            note,
            matchContext: getPreview(note.content, 80),
            matchType: 'tag',
            score: 300,
          })
        }
      }
    }

    // Sort: title matches first, then by score/recency
    results.sort((a, b) => b.score - a.score || b.note.updatedAt - a.note.updatedAt)
    return results.slice(0, 50)
  }, [query, filters, notes])

  useEffect(() => { setSelectedIndex(0) }, [results.length, query])

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleSelect = useCallback((noteId: string) => {
    setActiveNote(noteId)
    onClose()
  }, [setActiveNote, onClose])

  const handleSaveSearch = () => {
    if (!query.trim()) return
    const saved: SavedSearch = {
      id: Date.now().toString(),
      query,
      filters: { ...filters },
      createdAt: Date.now(),
    }
    const updated = [saved, ...savedSearches.filter(s => s.query !== query)].slice(0, 10)
    setSavedSearches(updated)
    saveSavedSearches(updated)
  }

  const handleLoadSearch = (search: SavedSearch) => {
    setQuery(search.query)
    setFilters(search.filters)
  }

  const handleDeleteSaved = (id: string) => {
    const updated = savedSearches.filter(s => s.id !== id)
    setSavedSearches(updated)
    saveSavedSearches(updated)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[selectedIndex]) handleSelect(results[selectedIndex].note.id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  // Highlight the query match in context
  const highlightMatch = (text: string) => {
    if (!query.trim()) return text
    const q = query.trim()
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '0 2px', borderRadius: 2, fontWeight: 500 }}>
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '10vh',
      }}
      role="dialog"
      aria-label="高级搜索"
    >
      <div
        style={{
          width: 580, maxHeight: '75vh',
          background: 'var(--bg-elevated)',
          borderRadius: 14, border: '1px solid var(--border-light)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          animation: 'commandPaletteIn 150ms ease-out',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input row */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16, color: 'var(--text-faint)', flexShrink: 0 }}>⌕</span>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={filters.useRegex ? '输入正则表达式…' : '搜索笔记内容…'}
              style={{
                flex: 1, border: 'none', background: 'transparent',
                fontSize: 15, color: 'var(--text-primary)',
                outline: 'none', fontFamily: filters.useRegex ? 'var(--font-mono)' : 'var(--font-sans)',
              }}
            />
            <button
              onClick={() => setShowFilters(!showFilters)}
              title="筛选条件"
              style={{
                border: 'none', borderRadius: 5, padding: '4px 10px',
                background: showFilters || filters.tags.length || filters.dateFrom || filters.onlyFavorites || filters.onlyWithTasks
                  ? 'var(--accent-light)' : 'var(--bg-secondary)',
                color: showFilters ? 'var(--accent)' : 'var(--text-faint)',
                fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}
            >
              筛选 {(filters.tags.length + (filters.dateFrom ? 1 : 0) + (filters.onlyFavorites ? 1 : 0) + (filters.onlyWithTasks ? 1 : 0)) > 0 && `(${filters.tags.length + (filters.dateFrom ? 1 : 0) + (filters.onlyFavorites ? 1 : 0) + (filters.onlyWithTasks ? 1 : 0)})`}
            </button>
            <button
              onClick={() => setFilters(f => ({ ...f, useRegex: !f.useRegex }))}
              title="正则搜索"
              style={{
                border: 'none', borderRadius: 5, padding: '4px 8px',
                background: filters.useRegex ? 'var(--accent-light)' : 'var(--bg-secondary)',
                color: filters.useRegex ? 'var(--accent)' : 'var(--text-faint)',
                fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)',
              }}
            >.*</button>
            {query && (
              <button
                onClick={handleSaveSearch}
                title="保存搜索"
                style={{
                  border: 'none', borderRadius: 5, padding: '4px 8px',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-faint)', fontSize: 12, cursor: 'pointer',
                }}
              >★</button>
            )}
          </div>

          {/* Filters panel */}
          {showFilters && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 0 4px',
              borderTop: '1px solid var(--border-light)', paddingTop: 10,
            }}>
              {/* Date range */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-faint)' }}>
                <span>日期</span>
                <input type="date" value={filters.dateFrom}
                  onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                  style={{ fontSize: 11, border: '1px solid var(--border-light)', borderRadius: 4, padding: '2px 4px', background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                />
                <span>~</span>
                <input type="date" value={filters.dateTo}
                  onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
                  style={{ fontSize: 11, border: '1px solid var(--border-light)', borderRadius: 4, padding: '2px 4px', background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                />
              </div>

              {/* Tag filter */}
              <select
                value=""
                onChange={e => {
                  if (e.target.value && !filters.tags.includes(e.target.value)) {
                    setFilters(f => ({ ...f, tags: [...f.tags, e.target.value] }))
                  }
                }}
                style={{ fontSize: 11, border: '1px solid var(--border-light)', borderRadius: 4, padding: '2px 6px', background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
              >
                <option value="">+标签</option>
                {allTags.map(t => <option key={t} value={t}>#{t}</option>)}
              </select>

              {/* Toggle filters */}
              <button
                onClick={() => setFilters(f => ({ ...f, onlyFavorites: !f.onlyFavorites }))}
                style={{
                  border: '1px solid var(--border-light)', borderRadius: 4, padding: '2px 8px',
                  background: filters.onlyFavorites ? 'var(--accent-light)' : 'transparent',
                  color: filters.onlyFavorites ? 'var(--accent)' : 'var(--text-faint)',
                  fontSize: 11, cursor: 'pointer',
                }}
              >★ 收藏</button>

              <button
                onClick={() => setFilters(f => ({ ...f, onlyWithTasks: !f.onlyWithTasks }))}
                style={{
                  border: '1px solid var(--border-light)', borderRadius: 4, padding: '2px 8px',
                  background: filters.onlyWithTasks ? 'var(--accent-light)' : 'transparent',
                  color: filters.onlyWithTasks ? 'var(--accent)' : 'var(--text-faint)',
                  fontSize: 11, cursor: 'pointer',
                }}
              >☑ 含任务</button>

              {/* Active tag chips */}
              {filters.tags.map(t => (
                <span key={t} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 4,
                  background: 'var(--accent-light)', color: 'var(--accent)',
                  fontSize: 11,
                }}>
                  #{t}
                  <button onClick={() => setFilters(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))}
                    style={{ border: 'none', background: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 10, padding: 0 }}
                  >✕</button>
                </span>
              ))}

              {/* Clear all */}
              {(filters.tags.length > 0 || filters.dateFrom || filters.onlyFavorites || filters.onlyWithTasks) && (
                <button
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  style={{ border: 'none', background: 'none', color: 'var(--text-faint)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
                >清除筛选</button>
              )}
            </div>
          )}

          {/* Saved searches */}
          {savedSearches.length > 0 && !query && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingTop: 4 }}>
              {savedSearches.slice(0, 5).map(s => (
                <button
                  key={s.id}
                  onClick={() => handleLoadSearch(s)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    border: '1px solid var(--border-light)', borderRadius: 4,
                    padding: '3px 8px', background: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  ★ {s.query.slice(0, 15)}{s.query.length > 15 ? '…' : ''}
                  <span
                    onClick={e => { e.stopPropagation(); handleDeleteSaved(s.id) }}
                    style={{ color: 'var(--text-faint)', fontSize: 9, cursor: 'pointer' }}
                  >✕</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} style={{ flex: 1, overflow: 'auto', padding: 6 }}>
          {results.length === 0 && query && (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
              {filters.useRegex ? '无正则匹配结果' : '未找到相关笔记'}
            </div>
          )}
          {results.length === 0 && !query && !filters.onlyFavorites && !filters.onlyWithTasks && !filters.tags.length && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
              输入关键词搜索，支持中文、拼音和正则
            </div>
          )}
          {results.map((r, idx) => (
            <div
              key={r.note.id}
              onClick={() => handleSelect(r.note.id)}
              onMouseEnter={() => setSelectedIndex(idx)}
              style={{
                padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                background: idx === selectedIndex ? 'var(--bg-active)' : 'transparent',
                transition: 'background 80ms ease',
                marginBottom: 2,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{
                  fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
                  fontFamily: 'var(--font-serif)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  flex: 1,
                }}>
                  {highlightMatch(r.note.title || '无标题')}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-num)', flexShrink: 0 }}>
                  {new Date(r.note.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                </span>
              </div>
              <div style={{
                fontSize: 12, color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-sans)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {highlightMatch(r.matchContext)}
              </div>
              {r.note.tags.length > 0 && (
                <div style={{ marginTop: 3, display: 'flex', gap: 4 }}>
                  {r.note.tags.slice(0, 4).map(t => (
                    <span key={t} style={{ fontSize: 10, color: 'var(--text-faint)' }}>#{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 14px', borderTop: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-num)',
        }}>
          <span>{results.length > 0 ? `${results.length} 条结果` : ''}</span>
          <span>↑↓ 导航 · ↵ 打开 · Esc 关闭</span>
        </div>
      </div>
    </div>
  )
}
