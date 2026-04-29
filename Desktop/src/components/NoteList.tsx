import { useMemo, useRef, useState, useEffect } from 'react'
import { useStore } from '../store'
import type { Note } from '@notepro/shared'
import { getPreview, pinyinMatch, semanticSearch, isEmbeddingAvailable } from '@notepro/shared'

// 高亮搜索关键词
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

function groupByDate(notes: Note[]) {
  const today     = new Date().setHours(0, 0, 0, 0)
  const yesterday = today - 86400000
  const thisWeek  = today - 6 * 86400000

  const groups: Record<string, Note[]> = {}
  const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt)

  for (const note of sorted) {
    const t = note.updatedAt
    const label =
      t >= today     ? '今天' :
      t >= yesterday ? '昨天' :
      t >= thisWeek  ? '本周' :
      (() => { const d = new Date(t); return `${d.getFullYear()}年${d.getMonth()+1}月` })()
    if (!groups[label]) groups[label] = []
    groups[label].push(note)
  }

  const order = ['今天', '昨天', '本周']
  const keys = [
    ...order.filter(k => groups[k]),
    ...Object.keys(groups).filter(k => !order.includes(k)),
  ]
  return keys.map(label => ({ label, notes: groups[label] }))
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export default function NoteList({ width }: { width?: number }) {
  const { state, dispatch } = useStore()
  const searchRef = useRef<HTMLInputElement>(null)
  const [sortMode, setSortMode] = useState<'updated' | 'created' | 'title'>('updated')

  // 过滤
  const filtered = useMemo(() => {
    let notes = state.notes.filter(n => !n.hidden && !n.deletedAt) // 隐藏和已删除不显示
    if (state.activeTag === '__fav') {
      notes = notes.filter(n => n.favorited)
    } else if (state.activeTag === '__trash') {
      notes = state.notes.filter(n => !!n.deletedAt) // 回收站：只显示已删除
    } else if (state.activeTag) {
      notes = notes.filter(n => n.tags.includes(state.activeTag!))
    }
    if (state.searchQuery) {
      notes = notes.filter(n =>
        pinyinMatch(n.title, state.searchQuery) ||
        pinyinMatch(getPreview(n.content), state.searchQuery) ||
        n.tags.some(t => pinyinMatch(t, state.searchQuery))
      )
    }
    return notes
  }, [state.notes, state.activeTag, state.searchQuery])

  // 语义搜索（当关键词搜索结果少于 3 条时触发）
  const [semanticResults, setSemanticResults] = useState<string[]>([])
  useEffect(() => {
    if (!state.searchQuery || filtered.length >= 3 || !isEmbeddingAvailable()) {
      setSemanticResults([])
      return
    }
    // 延迟 500ms 避免频繁调用
    const timer = setTimeout(async () => {
      try {
        // 需要 userId，从 supabase auth 获取
        const { supabase } = await import('@notepro/shared')
        if (!supabase) return
        const { data } = await supabase.auth.getSession()
        const userId = data?.session?.user?.id
        if (!userId) return
        const results = await semanticSearch(state.searchQuery, userId, 5)
        setSemanticResults(results.map(r => r.noteId))
      } catch { /* ignore */ }
    }, 500)
    return () => clearTimeout(timer)
  }, [state.searchQuery, filtered.length])

  // 排序（合并语义搜索结果）
  const sorted = useMemo(() => {
    let arr = [...filtered]
    // 如果有语义搜索结果，追加到列表末尾（去重）
    if (semanticResults.length > 0) {
      const existingIds = new Set(arr.map(n => n.id))
      const semanticNotes = semanticResults
        .filter(id => !existingIds.has(id))
        .map(id => state.notes.find(n => n.id === id))
        .filter((n): n is Note => !!n && !n.deletedAt && !n.hidden)
      arr = [...arr, ...semanticNotes]
    }
    // 置顶笔记始终在前
    arr.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      if (sortMode === 'title') return (a.title || '').localeCompare(b.title || '', 'zh-CN')
      if (sortMode === 'created') return b.createdAt - a.createdAt
      return b.updatedAt - a.updatedAt
    })
    return arr
  }, [filtered, sortMode, semanticResults, state.notes])

  const groups = groupByDate(sorted)

  return (
    <div className="note-list-panel" role="list" aria-label="笔记列表" style={width ? { width } : undefined}>
      {/* 搜索框 */}
      <div className="note-list-search">
        <input
          ref={searchRef}
          className="search-input"
          placeholder="搜索…"
          value={state.searchQuery}
          onChange={e => dispatch({ type: 'SET_SEARCH', query: e.target.value })}
        />
        {state.searchQuery && (
          <button className="search-clear" onClick={() => dispatch({ type: 'SET_SEARCH', query: '' })}>✕</button>
        )}
        <button
          onClick={() => setSortMode(m => m === 'updated' ? 'created' : m === 'created' ? 'title' : 'updated')}
          title={`排序：${sortMode === 'updated' ? '更新时间' : sortMode === 'created' ? '创建时间' : '标题'}`}
          style={{
            border: 'none', background: 'none', color: 'var(--text-faint)',
            fontSize: 11, cursor: 'pointer', padding: '4px 6px', borderRadius: 4,
            fontFamily: 'var(--font-num)', flexShrink: 0,
          }}
        >
          {sortMode === 'updated' ? '↕新' : sortMode === 'created' ? '↕旧' : '↕名'}
        </button>
      </div>

      {/* 列表 */}
      <div className="note-list-scroll">
        {filtered.length === 0 ? (
          <div className="note-list-empty">
            {state.searchQuery ? '没有找到相关笔记' : '暂无笔记'}
          </div>
        ) : (
          groups.map(group => (
            <div key={group.label}>
              <div className="note-group-label">{group.label}</div>
              {group.notes.map(note => (
                <div
                  key={note.id}
                  className={`note-item ${state.activeNoteId === note.id ? 'active' : ''}`}
                  onClick={() => dispatch({ type: 'SET_ACTIVE_NOTE', noteId: note.id })}
                  role="listitem"
                >
                  {/* 第一行：标题 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                    {note.pinned && <span style={{ fontSize: 10, flexShrink: 0 }}>📌</span>}
                    <span className="note-item-title" style={{ fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-serif)' }}>
                      {note.locked
                        ? highlightText('🔒 ' + (note.title || '加密笔记'), state.searchQuery)
                        : highlightText(note.title || '无标题', state.searchQuery)
                      }
                    </span>
                  </div>
                  {/* 第二行：预览 */}
                  {!note.locked && (
                    <div style={{
                      fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.4,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      marginBottom: 3,
                    }}>
                      {getPreview(note.content, 60)}
                    </div>
                  )}
                  {/* 第三行：标签 + 时间 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 4, overflow: 'hidden' }}>
                      {note.tags.slice(0, 3).map(t => (
                        <span key={t} style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-sans)' }}>#{t}</span>
                      ))}
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-num)', flexShrink: 0 }}>
                      {formatTime(note.updatedAt)}
                    </span>
                  </div>
                  {/* 回收站操作按钮 */}
                  {state.activeTag === '__trash' && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button
                        onClick={e => { e.stopPropagation(); dispatch({ type: 'RESTORE_NOTE', noteId: note.id }) }}
                        style={{ fontSize: 11, color: 'var(--success)', background: 'none', border: '1px solid var(--success)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
                      >恢复</button>
                      <button
                        onClick={e => { e.stopPropagation(); if (confirm('永久删除？不可恢复。')) dispatch({ type: 'PERMANENT_DELETE', noteId: note.id }) }}
                        style={{ fontSize: 11, color: 'var(--danger)', background: 'none', border: '1px solid var(--danger)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
                      >永久删除</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
