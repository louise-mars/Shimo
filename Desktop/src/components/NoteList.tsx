import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { useStore } from '../store'
import type { Note } from '@notepro/shared'
import { getPreview, pinyinMatch, semanticSearch, isEmbeddingAvailable, fullTextSearch } from '@notepro/shared'

// ─── Types ───────────────────────────────────────────────────────────────────

type SortMode = 'updatedAt' | 'createdAt' | 'title'

interface NoteGroup {
  label: string
  notes: Note[]
}

// ─── Constants ───────────────────────────────────────────────────────────────

const VIRTUALIZATION_THRESHOLD = 500
const SEMANTIC_SEARCH_DELAY = 500

// ─── Highlight helper ────────────────────────────────────────────────────────

function highlightText(text: string, query: string): React.ReactNode {
  if (!query) return text
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)
  if (index === -1) return text
  return (
    <>
      {text.slice(0, index)}
      <mark style={{
        background: 'rgba(181, 52, 26, 0.2)',
        color: 'var(--accent)',
        padding: '1px 3px',
        borderRadius: 3,
        fontWeight: 500,
      }}>
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  )
}

// ─── Date grouping ───────────────────────────────────────────────────────────

function groupByDate(notes: Note[], sortMode: SortMode): NoteGroup[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400000
  const weekStart = today - 6 * 86400000

  const groups: Record<string, Note[]> = {}

  for (const note of notes) {
    const t = sortMode === 'createdAt' ? note.createdAt : note.updatedAt
    let label: string
    if (t >= today) {
      label = '今天'
    } else if (t >= yesterday) {
      label = '昨天'
    } else if (t >= weekStart) {
      label = '本周'
    } else {
      const d = new Date(t)
      label = `${d.getFullYear()}年${d.getMonth() + 1}月`
    }
    if (!groups[label]) groups[label] = []
    groups[label].push(note)
  }

  // Maintain order: 今天 → 昨天 → 本周 → monthly (newest first)
  const fixedOrder = ['今天', '昨天', '本周']
  const monthlyKeys = Object.keys(groups)
    .filter(k => !fixedOrder.includes(k))
    .sort((a, b) => {
      // Parse "2024年12月" format and sort descending
      const parseYM = (s: string) => {
        const m = s.match(/(\d+)年(\d+)月/)
        return m ? parseInt(m[1]) * 100 + parseInt(m[2]) : 0
      }
      return parseYM(b) - parseYM(a)
    })

  const orderedKeys = [
    ...fixedOrder.filter(k => groups[k]),
    ...monthlyKeys,
  ]

  return orderedKeys.map(label => ({ label, notes: groups[label] }))
}

// ─── Sort helper ─────────────────────────────────────────────────────────────

function sortNotes(notes: Note[], sortMode: SortMode): Note[] {
  const sorted = [...notes]

  // Pinned notes always first
  sorted.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1

    switch (sortMode) {
      case 'title':
        return (a.title || '').localeCompare(b.title || '', 'zh-CN')
      case 'createdAt':
        return b.createdAt - a.createdAt
      case 'updatedAt':
      default:
        return b.updatedAt - a.updatedAt
    }
  })

  return sorted
}

// ─── Time formatting ─────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

// ─── NoteItem component ──────────────────────────────────────────────────────

function NoteItem({
  note,
  isActive,
  searchQuery,
  isTrashView,
  onSelect,
  onRestore,
  onPermanentDelete,
}: {
  note: Note
  isActive: boolean
  searchQuery: string
  isTrashView: boolean
  onSelect: () => void
  onRestore: () => void
  onPermanentDelete: () => void
}) {
  const hasConflict = !!note.conflictSourceId

  return (
    <div
      className={`note-item ${isActive ? 'active' : ''}`}
      onClick={onSelect}
      role="listitem"
      aria-label={note.title || '无标题'}
    >
      {/* Row 1: Title + badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
        {note.pinned && <span style={{ fontSize: 10, flexShrink: 0 }} aria-label="已置顶">📌</span>}
        {hasConflict && (
          <span
            style={{
              fontSize: 9,
              flexShrink: 0,
              background: 'var(--warning, #f59e0b)',
              color: '#fff',
              borderRadius: 3,
              padding: '1px 4px',
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
            }}
            title="存在同步冲突副本"
            aria-label="冲突"
          >
            冲突
          </span>
        )}
        <span
          className="note-item-title"
          style={{ fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-serif)' }}
        >
          {note.locked
            ? highlightText('🔒 ' + (note.title || '加密笔记'), searchQuery)
            : highlightText(note.title || '无标题', searchQuery)
          }
        </span>
      </div>

      {/* Row 2: Content preview */}
      {!note.locked && (
        <div style={{
          fontSize: 12,
          color: 'var(--text-tertiary)',
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginBottom: 3,
        }}>
          {searchQuery
            ? highlightText(getPreview(note.content, 60), searchQuery)
            : getPreview(note.content, 60)
          }
        </div>
      )}

      {/* Row 3: Tags + timestamp */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 4, overflow: 'hidden' }}>
          {note.tags.slice(0, 3).map(t => (
            <span key={t} style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-sans)' }}>
              #{t}
            </span>
          ))}
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-num)', flexShrink: 0 }}>
          {formatTime(note.updatedAt)}
        </span>
      </div>

      {/* Trash view: restore/delete buttons */}
      {isTrashView && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button
            onClick={e => { e.stopPropagation(); onRestore() }}
            style={{
              fontSize: 11, color: 'var(--success)', background: 'none',
              border: '1px solid var(--success)', borderRadius: 4,
              padding: '2px 8px', cursor: 'pointer',
            }}
          >
            恢复
          </button>
          <button
            onClick={e => { e.stopPropagation(); onPermanentDelete() }}
            style={{
              fontSize: 11, color: 'var(--danger)', background: 'none',
              border: '1px solid var(--danger)', borderRadius: 4,
              padding: '2px 8px', cursor: 'pointer',
            }}
          >
            永久删除
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main NoteList component ─────────────────────────────────────────────────

export default function NoteList({ width, onCollapse }: { width?: number; onCollapse?: () => void }) {
  const { state, dispatch } = useStore()
  const searchRef = useRef<HTMLInputElement>(null)
  const listContainerRef = useRef<HTMLDivElement>(null)
  const [sortMode, setSortMode] = useState<SortMode>('updatedAt')
  const [containerHeight, setContainerHeight] = useState(600)

  const isTrashView = state.activeTag === '__trash'

  // Measure container height for virtualization
  useEffect(() => {
    const container = listContainerRef.current
    if (!container) return

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // ─── Filter notes ───────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let notes: Note[]

    if (isTrashView) {
      // Trash view: only show deleted notes
      notes = state.notes.filter(n => !!n.deletedAt)
    } else if (state.activeTag === '__fav') {
      // Favorites view
      notes = state.notes.filter(n => !n.hidden && !n.deletedAt && n.favorited)
    } else {
      // Default view: exclude hidden and deleted
      notes = state.notes.filter(n => !n.hidden && !n.deletedAt)

      // Tag filter
      if (state.activeTag) {
        notes = notes.filter(n => n.tags.includes(state.activeTag!))
      }

      // Folder filter
      if (state.activeFolderId) {
        notes = notes.filter(n => n.folderId === state.activeFolderId)
      }
    }

    // Search with pinyin matching
    if (state.searchQuery) {
      notes = notes.filter(n =>
        pinyinMatch(n.title, state.searchQuery) ||
        pinyinMatch(getPreview(n.content), state.searchQuery) ||
        n.tags.some(t => pinyinMatch(t, state.searchQuery))
      )
    }

    return notes
  }, [state.notes, state.activeTag, state.activeFolderId, state.searchQuery, isTrashView])

  // ─── Semantic search (when keyword results < 3) ─────────────────────────

  const [semanticResults, setSemanticResults] = useState<string[]>([])

  useEffect(() => {
    if (!state.searchQuery || filtered.length >= 3) {
      setSemanticResults([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        if (isEmbeddingAvailable()) {
          // Vector embedding search via Supabase
          const { supabase } = await import('@notepro/shared')
          if (!supabase) return
          const { data } = await supabase.auth.getSession()
          const userId = data?.session?.user?.id
          if (!userId) return
          const results = await semanticSearch(state.searchQuery, userId, 5)
          setSemanticResults(results.map(r => r.noteId))
        } else {
          // Full-text content search fallback (Req 7.9)
          const results = fullTextSearch(state.searchQuery, state.notes, 5)
          setSemanticResults(results.map(r => r.noteId))
        }
      } catch {
        /* ignore search failures */
      }
    }, SEMANTIC_SEARCH_DELAY)

    return () => clearTimeout(timer)
  }, [state.searchQuery, filtered.length, state.notes])

  // ─── Sort and merge semantic results ────────────────────────────────────

  const sortedNotes = useMemo(() => {
    let arr = [...filtered]

    // Append semantic search results (deduplicated)
    if (semanticResults.length > 0) {
      const existingIds = new Set(arr.map(n => n.id))
      const semanticNotes = semanticResults
        .filter(id => !existingIds.has(id))
        .map(id => state.notes.find(n => n.id === id))
        .filter((n): n is Note => !!n && !n.deletedAt && !n.hidden)
      arr = [...arr, ...semanticNotes]
    }

    return sortNotes(arr, sortMode)
  }, [filtered, sortMode, semanticResults, state.notes])

  // ─── Group by date ──────────────────────────────────────────────────────

  const groups = useMemo(() => {
    // For pinned notes, separate them into their own group at the top
    const pinned = sortedNotes.filter(n => n.pinned)
    const unpinned = sortedNotes.filter(n => !n.pinned)

    const result: NoteGroup[] = []

    if (pinned.length > 0) {
      result.push({ label: '置顶', notes: pinned })
    }

    const dateGroups = groupByDate(unpinned, sortMode)
    result.push(...dateGroups)

    return result
  }, [sortedNotes, sortMode])

  const useVirtualization = sortedNotes.length >= VIRTUALIZATION_THRESHOLD

  // ─── Handlers ──────────────────────────────────────────────────────────

  const handleSelect = useCallback((noteId: string) => {
    dispatch({ type: 'SET_ACTIVE_NOTE', noteId })
  }, [dispatch])

  const handleRestore = useCallback((noteId: string) => {
    dispatch({ type: 'RESTORE_NOTE', noteId })
  }, [dispatch])

  const handlePermanentDelete = useCallback((noteId: string) => {
    if (confirm('永久删除？不可恢复。')) {
      dispatch({ type: 'PERMANENT_DELETE', noteId })
    }
  }, [dispatch])

  const cycleSortMode = useCallback(() => {
    setSortMode(m => {
      if (m === 'updatedAt') return 'createdAt'
      if (m === 'createdAt') return 'title'
      return 'updatedAt'
    })
  }, [])

  const sortLabel = sortMode === 'updatedAt' ? '↕新' : sortMode === 'createdAt' ? '↕旧' : '↕名'
  const sortTitle = sortMode === 'updatedAt' ? '排序：更新时间' : sortMode === 'createdAt' ? '排序：创建时间' : '排序：标题'

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      className="note-list-panel"
      role="list"
      aria-label="笔记列表"
      style={width ? { width } : undefined}
    >
      {/* Search bar */}
      <div className="note-list-search">
        {onCollapse && (
          <button
            onClick={onCollapse}
            title="隐藏列表 (Ctrl+\)"
            aria-label="隐藏列表"
            style={{
              width: 28, height: 28, border: 'none', borderRadius: 5,
              background: 'transparent', color: 'var(--text-faint)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, flexShrink: 0, opacity: 0.5, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.background = 'transparent' }}
          >
            ◁
          </button>
        )}
        <input
          ref={searchRef}
          className="search-input"
          placeholder="搜索…"
          aria-label="搜索笔记"
          value={state.searchQuery}
          onChange={e => dispatch({ type: 'SET_SEARCH', query: e.target.value })}
        />
        {state.searchQuery && (
          <button
            className="search-clear"
            onClick={() => dispatch({ type: 'SET_SEARCH', query: '' })}
            aria-label="清除搜索"
          >
            ✕
          </button>
        )}
        <button
          onClick={cycleSortMode}
          title={sortTitle}
          aria-label={sortTitle}
          style={{
            border: 'none', background: 'none', color: 'var(--text-faint)',
            fontSize: 11, cursor: 'pointer', padding: '4px 6px', borderRadius: 4,
            fontFamily: 'var(--font-num)', flexShrink: 0,
          }}
        >
          {sortLabel}
        </button>
      </div>

      {/* Note list content */}
      <div className="note-list-scroll" ref={listContainerRef}>
        {sortedNotes.length === 0 ? (
          <div className="note-list-empty">
            {state.searchQuery ? '没有找到相关笔记' : isTrashView ? '回收站为空' : '暂无笔记'}
          </div>
        ) : useVirtualization ? (
          /* Windowed rendering for 500+ notes — simplified scroll container */
          <div style={{ height: containerHeight, overflow: 'auto' }}>
            {groups.map(group => (
              <div key={group.label}>
                <div className="note-group-label">{group.label}</div>
                {group.notes.map(note => (
                  <NoteItem
                    key={note.id}
                    note={note}
                    isActive={state.activeNoteId === note.id}
                    searchQuery={state.searchQuery}
                    isTrashView={isTrashView}
                    onSelect={() => handleSelect(note.id)}
                    onRestore={() => handleRestore(note.id)}
                    onPermanentDelete={() => handlePermanentDelete(note.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          /* Standard rendering for < 500 notes */
          groups.map(group => (
            <div key={group.label}>
              <div className="note-group-label">{group.label}</div>
              {group.notes.map(note => (
                <NoteItem
                  key={note.id}
                  note={note}
                  isActive={state.activeNoteId === note.id}
                  searchQuery={state.searchQuery}
                  isTrashView={isTrashView}
                  onSelect={() => handleSelect(note.id)}
                  onRestore={() => handleRestore(note.id)}
                  onPermanentDelete={() => handlePermanentDelete(note.id)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

