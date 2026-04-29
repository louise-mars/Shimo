import { useState, useRef, useEffect, useMemo } from 'react'
import { useStore } from '../../store'
import { getPreview, pinyinMatch } from '@notepro/shared'

const SEARCH_HISTORY_KEY = 'shimo-search-history'
const MAX_HISTORY = 8

function getSearchHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]') } catch { return [] }
}
function addSearchHistory(q: string) {
  const history = getSearchHistory().filter(h => h !== q)
  history.unshift(q)
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)))
}

function highlightText(text: string, query: string) {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return <>{text.slice(0, idx)}<mark style={{ background: 'rgba(181,52,26,0.2)', color: 'var(--accent)', fontWeight: 500, padding: '0 2px', borderRadius: 2 }}>{text.slice(idx, idx + query.length)}</mark>{text.slice(idx + query.length)}</>
}

interface Props { onSelectNote: () => void }

export default function SearchPage({ onSelectNote }: Props) {
  const { state, dispatch } = useStore()
  const [query, setQuery] = useState('')
  const [history, setHistory] = useState(getSearchHistory)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // 所有标签聚合
  const allTags = useMemo(() => {
    const map = new Map<string, number>()
    state.notes.forEach(n => n.tags.forEach(t => map.set(t, (map.get(t) || 0) + 1)))
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [state.notes])

  // 搜索结果（支持拼音）
  const results = useMemo(() => {
    const q = query.trim()
    if (!q) return []
    return state.notes.filter(n => !n.deletedAt && (
      pinyinMatch(n.title, q) ||
      pinyinMatch(getPreview(n.content), q) ||
      n.tags.some(t => pinyinMatch(t, q))
    )).sort((a, b) => b.updatedAt - a.updatedAt)
  }, [query, state.notes])

  const selectNote = (noteId: string) => {
    if (query.trim()) {
      addSearchHistory(query.trim())
      setHistory(getSearchHistory())
    }
    dispatch({ type: 'SET_ACTIVE_NOTE', noteId })
    onSelectNote()
  }

  const filterByTag = (tag: string) => {
    setQuery('#' + tag)
  }

  return (
    <div className="page">
      {/* 搜索框 */}
      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input
          ref={inputRef}
          className="search-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索笔记…"
        />
        {query && (
          <button className="search-clear" onClick={() => setQuery('')}>✕</button>
        )}
      </div>

      <div className="search-body">
        {query ? (
          /* 搜索结果 */
          results.length === 0 ? (
            <div className="empty"><p>没有找到相关笔记</p></div>
          ) : (
            results.map(note => (
              <div key={note.id} className="note-row" onClick={() => selectNote(note.id)}>
                <div className="note-row-main">
                  <span className="note-row-title">{highlightText(note.title || '无标题', query)}</span>
                </div>
                <div className="note-row-preview">{highlightText(getPreview(note.content, 60), query)}</div>
                {note.tags.length > 0 && (
                  <div className="note-row-tags">
                    {note.tags.map(t => <span key={t} className="note-tag">#{t}</span>)}
                  </div>
                )}
              </div>
            ))
          )
        ) : (
          /* 搜索历史 + 标签聚合 */
          <>
            {history.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div className="group-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>最近搜索</span>
                  <button onClick={() => { localStorage.removeItem(SEARCH_HISTORY_KEY); setHistory([]) }}
                    style={{ border: 'none', background: 'none', color: 'var(--text-faint)', fontSize: 11, cursor: 'pointer' }}>清除</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {history.map(h => (
                    <button key={h} onClick={() => setQuery(h)} style={{
                      padding: '5px 10px', borderRadius: 6,
                      border: '1px solid var(--border-light)', background: 'var(--bg-elevated)',
                      color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                    }}>{h}</button>
                  ))}
                </div>
              </div>
            )}
            {allTags.length > 0 && (
            <div>
              <div className="group-label">标签</div>
              <div className="tag-grid">
                {allTags.map(([tag, count]) => (
                  <button key={tag} className="tag-chip" onClick={() => filterByTag(tag)}>
                    <span>#{tag}</span>
                    <span className="tag-chip-count">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  )
}
