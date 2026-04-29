import { useState, useEffect, useRef, useMemo } from 'react'
import { useStore } from '../../store'

function extractText(content: string): string {
  if (!content) return ''
  try {
    const json = JSON.parse(content)
    const texts: string[] = []
    const walk = (node: { text?: string; content?: unknown[] }) => {
      if (node.text) texts.push(node.text)
      if (node.content) node.content.forEach((c: unknown) => walk(c as { text?: string; content?: unknown[] }))
    }
    walk(json)
    return texts.join(' ')
  } catch { return '' }
}

export default function SearchPalette({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const results = useMemo(() => {
    if (!query.trim()) {
      // Show recent notes when no query
      return [...state.notes]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 8)
        .map(n => ({ note: n, matchType: 'recent' as const }))
    }
    const q = query.toLowerCase()
    return state.notes
      .map(n => {
        const titleMatch = n.title.toLowerCase().includes(q)
        const tagMatch = n.tags.some(t => t.toLowerCase().includes(q))
        const contentMatch = extractText(n.content).toLowerCase().includes(q)
        if (titleMatch) return { note: n, matchType: 'title' as const }
        if (tagMatch) return { note: n, matchType: 'tag' as const }
        if (contentMatch) return { note: n, matchType: 'content' as const }
        return null
      })
      .filter(Boolean) as { note: typeof state.notes[0]; matchType: string }[]
  }, [query, state.notes])

  const select = (noteId: string) => {
    dispatch({ type: 'SET_ACTIVE_NOTE', noteId })
    onClose()
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, results.length - 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
      }
      if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault()
        select(results[selectedIndex].note.id)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [results, selectedIndex, onClose]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setSelectedIndex(0) }, [query])

  const highlightMatch = (text: string) => {
    if (!query.trim()) return text
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <span style={{ background: 'var(--warning)', borderRadius: 2, padding: '0 1px' }}>
          {text.slice(idx, idx + query.length)}
        </span>
        {text.slice(idx + query.length)}
      </>
    )
  }

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div style={{
        width: 520, maxHeight: '60vh',
        background: 'var(--bg-elevated)',
        borderRadius: 12,
        border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
        animation: 'fadeIn 150ms ease-out',
      }}>
        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px',
          borderBottom: '1px solid var(--border-light)',
        }}>
          <span style={{ fontSize: 18, opacity: 0.4 }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search notes, tags..."
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 15, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)',
            }}
          />
          <span className="kbd">Esc</span>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 'calc(60vh - 56px)', overflowY: 'auto', padding: '6px' }}>
          {!query.trim() && results.length > 0 && (
            <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Recent
            </div>
          )}
          {results.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              No results found
            </div>
          ) : (
            results.map((r, i) => (
              <div
                key={r.note.id}
                className={`slash-menu-item ${i === selectedIndex ? 'selected' : ''}`}
                onClick={() => select(r.note.id)}
                onMouseEnter={() => setSelectedIndex(i)}
                style={{ borderRadius: 6 }}
              >
                <div className="slash-icon" style={{ width: 32, height: 32, fontSize: 14 }}>
                  {r.note.pinned ? '📌' : r.note.favorited ? '⭐' : '📝'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {highlightMatch(r.note.title || 'Untitled')}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                    {r.note.tags.length > 0 && (
                      <span style={{ marginRight: 6 }}>{r.note.tags.map(t => `#${t}`).join(' ')}</span>
                    )}
                    {extractText(r.note.content).slice(0, 60)}
                  </div>
                </div>
                {r.matchType !== 'recent' && (
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    {r.matchType}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
