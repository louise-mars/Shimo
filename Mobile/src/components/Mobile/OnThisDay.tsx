import { useMemo } from 'react'
import { useStore } from '../../store'
import { getPreview } from '@notepro/shared'

interface Props {
  onSelectNote: (noteId: string) => void
}

export default function OnThisDay({ onSelectNote }: Props) {
  const { state, dispatch } = useStore()

  const memories = useMemo(() => {
    const now = new Date()
    const thisMonth = now.getMonth()
    const thisDay = now.getDate()

    return state.notes
      .filter(note => {
        const d = new Date(note.createdAt)
        return (
          d.getMonth() === thisMonth &&
          d.getDate() === thisDay &&
          d.getFullYear() < now.getFullYear() // 排除今年
        )
      })
      .sort((a, b) => a.createdAt - b.createdAt) // 从最早到最近
  }, [state.notes])

  if (memories.length === 0) return null

  const yearsAgo = (ts: number) => {
    const years = new Date().getFullYear() - new Date(ts).getFullYear()
    return years === 1 ? '1年前' : `${years}年前`
  }

  return (
    <div style={{
      margin: '0 20px 16px',
      padding: '14px 16px',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-light)',
      borderRadius: 10,
      borderLeft: '3px solid var(--accent)',
    }}>
      {/* 标题 */}
      <div style={{
        fontSize: 11,
        color: 'var(--accent)',
        fontFamily: 'var(--font-sans)',
        fontWeight: 500,
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 10,
      }}>
        ◈ 历史上的今天
      </div>

      {/* 笔记列表 */}
      {memories.map((note, i) => (
        <div
          key={note.id}
          onClick={() => {
            dispatch({ type: 'SET_ACTIVE_NOTE', noteId: note.id })
            onSelectNote(note.id)
          }}
          style={{
            paddingTop: i > 0 ? 10 : 0,
            marginTop: i > 0 ? 10 : 0,
            borderTop: i > 0 ? '1px solid var(--border-light)' : 'none',
            cursor: 'pointer',
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 3,
          }}>
            <span style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-serif)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}>
              {note.title || getPreview(note.content, 50) || '无标题'}
            </span>
            <span style={{
              fontSize: 11,
              color: 'var(--text-faint)',
              fontFamily: 'var(--font-num)',
              flexShrink: 0,
            }}>
              {yearsAgo(note.createdAt)}
            </span>
          </div>
          {note.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 6 }}>
              {note.tags.slice(0, 3).map(t => (
                <span key={t} style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-sans)' }}>
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
