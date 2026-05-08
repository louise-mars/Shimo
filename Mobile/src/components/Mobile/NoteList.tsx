import { useState, useRef } from 'react'
import { useStore } from '../../store'
import OnThisDay from './OnThisDay'
import type { Note } from '@notepro/shared'
import { getPreview } from '@notepro/shared'

function groupByDate(notes: Note[]): { label: string; notes: Note[] }[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400000
  const thisWeek = today - 6 * 86400000

  const groups: Record<string, Note[]> = {}

  const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt)

  for (const note of sorted) {
    const d = note.updatedAt
    let label: string
    if (d >= today)          label = '今天'
    else if (d >= yesterday) label = '昨天'
    else if (d >= thisWeek)  label = '本周'
    else {
      const date = new Date(d)
      label = `${date.getFullYear()}年${date.getMonth() + 1}月`
    }
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
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

interface Props { onNewNote?: () => void; onSelectNote?: () => void; onRefresh?: () => void }

export default function NoteList(_props: Props) {
  const { state, dispatch } = useStore()
  const groups = groupByDate(state.notes.filter(n => !n.deletedAt && !n.hidden))
  const [refreshing, setRefreshing] = useState(false)
  const touchStartY = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!scrollRef.current || scrollRef.current.scrollTop > 0) return
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (dy > 80 && _props.onRefresh) {
      setRefreshing(true)
      _props.onRefresh()
      setTimeout(() => setRefreshing(false), 2000)
    }
  }

  return (
    <div className="page">
      {/* 顶部 */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="page-title">拾墨</span>
        <button
          onClick={() => {
            const active = state.notes.filter(n => !n.deletedAt && !n.hidden)
            if (active.length === 0) return
            const random = active[Math.floor(Math.random() * active.length)]
            dispatch({ type: 'SET_ACTIVE_NOTE', noteId: random.id })
            _props.onSelectNote?.()
          }}
          style={{
            border: 'none', background: 'var(--bg-secondary)',
            color: 'var(--text-faint)', fontSize: 12,
            padding: '6px 12px', borderRadius: 6,
            fontFamily: 'var(--font-sans)', cursor: 'pointer',
          }}
        >
          ◈ 随机回顾
        </button>
      </div>

      {/* 列表 */}
      <div className="note-list" ref={scrollRef} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {refreshing && (
          <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: 'var(--accent)', animation: 'pulse 1s infinite' }}>
            同步中…
          </div>
        )}
        {/* On This Day */}
        <OnThisDay onSelectNote={() => _props.onSelectNote?.()} />

        {state.notes.length === 0 ? (
          <div className="empty" style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '60px 20px', gap: 12,
          }}>
            <div style={{
              fontSize: 56, opacity: 0.1,
              fontFamily: 'var(--font-serif)',
            }}>
              墨
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-faint)' }}>此处空无一物</p>
            <button
              onClick={() => {
                dispatch({ type: 'CREATE_NOTE' })
                _props.onSelectNote?.()
              }}
              style={{
                marginTop: 8,
                padding: '12px 28px',
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 500,
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 18 }}>✦</span>
              落笔成文
            </button>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.label}>
              <div className="group-label">{group.label}</div>
              {group.notes.map(note => (
                <div
                  key={note.id}
                  className="note-row"
                  onClick={() => dispatch({ type: 'SET_ACTIVE_NOTE', noteId: note.id })}
                >
                  <div className="note-row-main">
                    <span className="note-row-title">
                      {note.pinned && <span style={{ fontSize: 10, marginRight: 4 }}>📌</span>}
                      {note.locked ? '🔒 ' + (note.title || '加密笔记') : (note.title || '无标题')}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="note-row-time">{formatTime(note.updatedAt)}</span>
                      {/* 第二次激发入口 */}
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          dispatch({ type: 'SET_ACTIVE_NOTE', noteId: note.id })
                          sessionStorage.setItem('shimo-auto-voice', '1')
                        }}
                        title="追加想法"
                        style={{
                          border: 'none', background: 'none',
                          color: 'var(--text-faint)', fontSize: 16,
                          cursor: 'pointer', padding: '2px 4px',
                          lineHeight: 1, borderRadius: 4,
                          opacity: 0.6,
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {/* 预览行 */}
                  {!note.locked && (
                    <div className="note-row-preview">
                      {getPreview(note.content, 60) || ''}
                    </div>
                  )}
                  {note.tags.length > 0 && (
                    <div className="note-row-tags">
                      {note.tags.map(t => (
                        <span key={t} className="note-tag">#{t}</span>
                      ))}
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
