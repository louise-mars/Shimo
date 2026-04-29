import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../store'
import { exportNoteAsFile } from '@notepro/shared'
import { Search, Plus, X, ArrowUpDown, LayoutGrid, List, Pin, Star, FolderInput, Download, Trash2 } from 'lucide-react'
import type { NoteListView } from '@notepro/shared'

type SortMode = 'updated' | 'created' | 'title'

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function extractPreview(content: string): string {
  if (!content) return 'Empty note'
  try {
    const json = JSON.parse(content)
    const texts: string[] = []
    const walk = (node: { text?: string; content?: unknown[] }) => {
      if (node.text) texts.push(node.text)
      if (node.content) node.content.forEach((c: unknown) => walk(c as { text?: string; content?: unknown[] }))
    }
    walk(json)
    return texts.join(' ').slice(0, 100) || 'Empty note'
  } catch { return 'Empty note' }
}

interface ContextMenuState { noteId: string; x: number; y: number }

export default function NoteList() {
  const { state, dispatch } = useStore()
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('updated')
  const [viewMode, setViewMode] = useState<NoteListView>('card')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  let filtered = [...state.notes]
  const fid = state.activeFolderId
  if (fid === '__favorites') filtered = filtered.filter(n => n.favorited)
  else if (fid === '__pinned') filtered = filtered.filter(n => n.pinned)
  else if (fid === '__recent') filtered = filtered.filter(n => Date.now() - n.updatedAt < 7 * 24 * 60 * 60 * 1000)
  else if (fid && fid !== 'default') filtered = filtered.filter(n => n.folderId === fid)

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase()
    filtered = filtered.filter(n =>
      n.title.toLowerCase().includes(q) || extractPreview(n.content).toLowerCase().includes(q) || n.tags.some(t => t.toLowerCase().includes(q))
    )
  }

  filtered.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (sortMode === 'title') return (a.title || 'Untitled').localeCompare(b.title || 'Untitled')
    if (sortMode === 'created') return b.createdAt - a.createdAt
    return b.updatedAt - a.updatedAt
  })

  const folderName = (() => {
    if (!fid) return 'All Notes'
    if (fid === '__favorites') return 'Favorites'
    if (fid === '__pinned') return 'Pinned'
    if (fid === '__recent') return 'Recent'
    return state.folders.find(f => f.id === fid)?.name ?? 'All Notes'
  })()

  const hasNotes = filtered.length > 0
  const hasAnyNotes = state.notes.length > 0

  useEffect(() => {
    if (!contextMenu && !showSortMenu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) { setContextMenu(null); setShowMoveMenu(false) }
      setShowSortMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [contextMenu, showSortMenu])

  const contextNote = contextMenu ? state.notes.find(n => n.id === contextMenu.noteId) : null

  return (
    <div className="note-list-panel">
      <div className="note-list-header">
        {/* Row 1: Title + New button */}
        <div className="note-list-actions">
          <span className="note-list-title">{folderName}</span>
          <button className="new-note-btn" onClick={() => dispatch({ type: 'CREATE_NOTE' })}>
            <Plus size={15} /> New
          </button>
        </div>

        {/* Row 2: Search - only show when there are notes to search */}
        {hasAnyNotes && (
          <div className="search-box">
            <Search size={15} />
            <input placeholder="Search..." value={state.searchQuery} onChange={e => dispatch({ type: 'SET_SEARCH', query: e.target.value })} />
            {state.searchQuery && (
              <button className="icon-btn" onClick={() => dispatch({ type: 'SET_SEARCH', query: '' })} style={{ width: 22, height: 22 }}>
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {/* Row 3: Count + Sort/View - only show when there are filtered results */}
        {hasNotes && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{filtered.length} note{filtered.length !== 1 ? 's' : ''}</span>
            <div style={{ display: 'flex', gap: 1 }}>
              <div style={{ position: 'relative' }}>
                <button className="icon-btn" onClick={() => setShowSortMenu(v => !v)} title="Sort" style={{ width: 28, height: 28 }}>
                  <ArrowUpDown size={14} />
                </button>
                {showSortMenu && (
                  <div className="slash-menu" style={{ position: 'absolute', top: 32, right: 0, zIndex: 100, minWidth: 150 }}>
                    {([['updated', 'Last edited'], ['created', 'Date created'], ['title', 'Title A→Z']] as [SortMode, string][]).map(([mode, label]) => (
                      <div key={mode} className={`slash-menu-item ${sortMode === mode ? 'selected' : ''}`}
                        onClick={() => { setSortMode(mode); setShowSortMenu(false) }}>
                        <span className="slash-title" style={{ fontSize: 12 }}>{sortMode === mode ? '✓ ' : '   '}{label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button className="icon-btn" onClick={() => setViewMode('card')} title="Card view"
                style={{ width: 28, height: 28, color: viewMode === 'card' ? 'var(--accent)' : undefined }}>
                <LayoutGrid size={14} />
              </button>
              <button className="icon-btn" onClick={() => setViewMode('list')} title="List view"
                style={{ width: 28, height: 28, color: viewMode === 'list' ? 'var(--accent)' : undefined }}>
                <List size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="note-list-scroll">
        {!hasNotes ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            {state.searchQuery ? (
              <>
                <Search size={32} style={{ opacity: 0.15, marginBottom: 12 }} />
                <p style={{ fontSize: 13 }}>No results for "{state.searchQuery}"</p>
              </>
            ) : !hasAnyNotes ? (
              /* First-time empty: friendly welcome */
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 32, marginBottom: 4 }}>📝</div>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>Start writing</p>
                <p style={{ fontSize: 12, lineHeight: 1.5, maxWidth: 200 }}>
                  Click <b>+ New</b> above or press <span className="kbd">Ctrl+N</span>
                </p>
              </div>
            ) : (
              /* Filtered empty (e.g. empty folder) */
              <>
                <p style={{ fontSize: 13 }}>No notes in this view</p>
              </>
            )}
          </div>
        ) : viewMode === 'card' ? (
          filtered.map(note => (
            <div key={note.id} className={`note-card ${state.activeNoteId === note.id ? 'active' : ''}`}
              draggable onDragStart={e => e.dataTransfer.setData('noteId', note.id)}
              onClick={() => dispatch({ type: 'SET_ACTIVE_NOTE', noteId: note.id })}
              onContextMenu={e => { e.preventDefault(); setContextMenu({ noteId: note.id, x: e.clientX, y: e.clientY }); setShowMoveMenu(false) }}>
              {note.pinned && <span className="note-card-pin"><Pin size={12} /></span>}
              <div className="note-card-title">
                {note.favorited && <Star size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: -1, color: '#D4A843', fill: '#D4A843' }} />}
                {note.title || 'Untitled'}
              </div>
              <div className="note-card-preview">{extractPreview(note.content)}</div>
              <div className="note-card-meta">
                <span>{formatTime(note.updatedAt)}</span>
                {note.tags.length > 0 && (
                  <div className="note-card-tags">
                    {note.tags.slice(0, 2).map(t => (<span key={t} className="tag"><span className="tag-dot" />{t}</span>))}
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          filtered.map(note => (
            <div key={note.id} className={`note-card ${state.activeNoteId === note.id ? 'active' : ''}`}
              style={{ padding: '6px 10px', marginBottom: 0 }}
              onClick={() => dispatch({ type: 'SET_ACTIVE_NOTE', noteId: note.id })}
              onContextMenu={e => { e.preventDefault(); setContextMenu({ noteId: note.id, x: e.clientX, y: e.clientY }); setShowMoveMenu(false) }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {note.pinned && <Pin size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                {note.favorited && <Star size={11} style={{ color: '#D4A843', fill: '#D4A843', flexShrink: 0 }} />}
                <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {note.title || 'Untitled'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>{formatTime(note.updatedAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && contextNote && (
        <div ref={menuRef} className="slash-menu" style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 200, minWidth: 180 }}>
          <div className="slash-menu-item" onClick={() => { dispatch({ type: 'TOGGLE_PIN', noteId: contextNote.id }); setContextMenu(null) }}>
            <div className="slash-icon" style={{ width: 30, height: 30 }}><Pin size={16} /></div>
            <span className="slash-title">{contextNote.pinned ? 'Unpin' : 'Pin to top'}</span>
          </div>
          <div className="slash-menu-item" onClick={() => { dispatch({ type: 'TOGGLE_FAVORITE', noteId: contextNote.id }); setContextMenu(null) }}>
            <div className="slash-icon" style={{ width: 30, height: 30 }}><Star size={16} /></div>
            <span className="slash-title">{contextNote.favorited ? 'Unfavorite' : 'Favorite'}</span>
          </div>
          <div className="slash-menu-item" onClick={() => setShowMoveMenu(v => !v)}>
            <div className="slash-icon" style={{ width: 30, height: 30 }}><FolderInput size={16} /></div>
            <span className="slash-title">Move to folder</span>
          </div>
          {showMoveMenu && (
            <div style={{ padding: '2px 6px 2px 46px' }}>
              <div className="slash-menu-item" style={{ padding: '4px 8px' }}
                onClick={() => { dispatch({ type: 'UPDATE_NOTE', noteId: contextNote.id, updates: { folderId: null } }); setContextMenu(null); setShowMoveMenu(false) }}>
                <span className="slash-title" style={{ fontSize: 12 }}>All Notes</span>
              </div>
              {state.folders.filter(f => f.id !== 'default').map(f => (
                <div key={f.id} className="slash-menu-item" style={{ padding: '4px 8px' }}
                  onClick={() => { dispatch({ type: 'UPDATE_NOTE', noteId: contextNote.id, updates: { folderId: f.id } }); setContextMenu(null); setShowMoveMenu(false) }}>
                  <span className="slash-title" style={{ fontSize: 12 }}>{f.emoji} {f.name}</span>
                </div>
              ))}
            </div>
          )}
          <div className="slash-menu-item" onClick={() => { exportNoteAsFile(contextNote); setContextMenu(null) }}>
            <div className="slash-icon" style={{ width: 30, height: 30 }}><Download size={16} /></div>
            <span className="slash-title">Export Markdown</span>
          </div>
          <div style={{ height: 1, background: 'var(--border-light)', margin: '4px 6px' }} />
          <div className="slash-menu-item" onClick={() => { dispatch({ type: 'DELETE_NOTE', noteId: contextNote.id }); setContextMenu(null) }}>
            <div className="slash-icon" style={{ width: 30, height: 30, color: 'var(--danger)' }}><Trash2 size={16} /></div>
            <span className="slash-title" style={{ color: 'var(--danger)' }}>Delete</span>
          </div>
        </div>
      )}
    </div>
  )
}
