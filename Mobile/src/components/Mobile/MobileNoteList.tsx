import { useState, useRef } from 'react'
import { useStore } from '../../store'
import { hapticLight, hapticMedium } from '../../lib/native'
import type { Note } from '@notepro/shared'

interface MobileNoteListProps {
  onCreateNote: () => void
  onOpenSearch: () => void
  onOpenTemplates: () => void
}

export default function MobileNoteList({ 
  onCreateNote, 
  onOpenSearch, 
  onOpenTemplates 
}: MobileNoteListProps) {
  const { state, dispatch } = useStore()
  const [swipingNoteId, setSwipingNoteId] = useState<string | null>(null)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  const filteredNotes = state.notes
    .filter(note =>
      !state.activeFolderId || state.activeFolderId === 'default' ||
      note.folderId === state.activeFolderId
    )
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return b.updatedAt - a.updatedAt
    })

  const activeFolder = state.folders.find(f => f.id === state.activeFolderId)

  const handleNoteClick = (noteId: string) => {
    hapticLight()
    dispatch({ type: 'SET_ACTIVE_NOTE', noteId })
  }

  const handleTouchStart = (e: React.TouchEvent, _noteId: string) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchMove = (e: React.TouchEvent, _noteId: string) => {
    const touchX = e.touches[0].clientX
    const touchY = e.touches[0].clientY
    const deltaX = touchStartX.current - touchX
    const deltaY = Math.abs(touchStartY.current - touchY)
    const id = (e.currentTarget as HTMLElement).dataset.noteId
    if (deltaX > 50 && deltaY < 30 && id) {
      setSwipingNoteId(id)
    }
  }

  const handleTouchEnd = () => {
    if (swipingNoteId) {
      // 延迟重置，给用户时间看到操作
      setTimeout(() => setSwipingNoteId(null), 2000)
    }
  }

  const togglePin = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    dispatch({ type: 'TOGGLE_PIN', noteId })
    setSwipingNoteId(null)
  }

  const toggleFavorite = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    dispatch({ type: 'TOGGLE_FAVORITE', noteId })
    setSwipingNoteId(null)
  }

  const deleteNote = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    hapticMedium()
    if (confirm('确定要删除这条笔记吗？')) {
      dispatch({ type: 'DELETE_NOTE', noteId })
    }
    setSwipingNoteId(null)
  }


  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return date.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    } else if (diffDays === 1) {
      return '昨天'
    } else if (diffDays < 7) {
      return `${diffDays}天前`
    } else {
      return date.toLocaleDateString('zh-CN', { 
        month: 'short', 
        day: 'numeric' 
      })
    }
  }

  const getPreviewText = (note: Note) => {
    if (!note.content) return '无内容'
    try {
      const doc = JSON.parse(note.content)
      const extractText = (node: any): string => {
        if (node.text) return node.text
        if (node.content) {
          return node.content.map(extractText).join('')
        }
        return ''
      }
      const text = extractText(doc).trim()
      return text || '无内容'
    } catch {
      return '无内容'
    }
  }

  return (
    <div className="mobile-note-list">
      {/* 顶部工具栏 */}
      <div className="mobile-header">
        <h1 className="mobile-header-title">
          {activeFolder && activeFolder.id !== 'default' ? `${activeFolder.emoji} ${activeFolder.name}` : '拾墨'}
        </h1>
        <div className="mobile-header-actions">
          <button className="mobile-header-btn" onClick={onOpenSearch} title="搜索">🔍</button>
          <button className="mobile-header-btn" onClick={onOpenTemplates} title="模板">📜</button>
        </div>
      </div>

      {/* 文件夹快速切换 */}
      <div className="mobile-folder-tabs">
        {state.folders.map(folder => (
          <button
            key={folder.id}
            className={`mobile-folder-tab ${state.activeFolderId === folder.id || (!state.activeFolderId && folder.id === 'default') ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_ACTIVE_FOLDER', folderId: folder.id })}
          >
            <span>{folder.emoji}</span>
            <span>{folder.name}</span>
          </button>
        ))}
      </div>

      {/* 笔记列表 */}
      <div className="mobile-note-list-scroll">
        {filteredNotes.length === 0 ? (
          <div className="mobile-empty-state">
            <div className="mobile-empty-state-icon">🖋</div>
            <div className="mobile-empty-state-title">此处空无一物</div>
            <div className="mobile-empty-state-desc">点击右下角笔墨，留下第一行文字</div>
          </div>
        ) : (
          filteredNotes.map(note => (
            <div
              key={note.id}
              className={`mobile-note-card ${note.pinned ? 'pinned' : ''}`}
              onClick={() => handleNoteClick(note.id)}
              onTouchStart={(e) => handleTouchStart(e, note.id)}
              onTouchMove={(e) => handleTouchMove(e, note.id)}
              onTouchEnd={handleTouchEnd}
              data-note-id={note.id}
            >
              <div className="mobile-note-title">
                {note.pinned && <span style={{ marginRight: '6px', fontSize: '12px' }}>📌</span>}
                {note.favorited && <span style={{ marginRight: '6px', fontSize: '12px' }}>⭐</span>}
                {note.title || '无题'}
              </div>

              <div className="mobile-note-preview">
                {getPreviewText(note)}
              </div>

              <div className="mobile-note-meta">
                <div className="mobile-note-tags">
                  {note.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="mobile-note-tag">{tag}</span>
                  ))}
                  {note.tags.length > 3 && (
                    <span className="mobile-note-tag">+{note.tags.length - 3}</span>
                  )}
                </div>
                <div className="mobile-note-date">{formatDate(note.updatedAt)}</div>
              </div>

              {/* 滑动操作 */}
              {swipingNoteId === note.id && (
                <div className="mobile-swipe-actions">
                  <button onClick={(e) => togglePin(note.id, e)}>
                    {note.pinned ? '📌' : '📍'}
                  </button>
                  <button onClick={(e) => toggleFavorite(note.id, e)}>
                    {note.favorited ? '⭐' : '☆'}
                  </button>
                  <button onClick={(e) => deleteNote(note.id, e)}>🗑️</button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 浮动新建按钮 - 印章风格 */}
      <button className="mobile-fab" onClick={onCreateNote} title="新建笔记">
        ✒️
      </button>
    </div>
  )
}