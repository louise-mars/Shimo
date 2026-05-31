import { useMemo } from 'react'
import { useAppStore } from '@notepro/shared/dist/lib/store/createStore'
import { getPreview } from '@notepro/shared'

interface Props {
  onSelect: (noteId: string) => void
}

export default function OnThisDay({ onSelect }: Props) {
  const notes = useAppStore((s) => s.notes)
  const setActiveNote = useAppStore((s) => s.setActiveNote)

  const memories = useMemo(() => {
    const now = new Date()
    return notes.filter(note => {
      if (note.deletedAt) return false
      const d = new Date(note.createdAt)
      return (
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate() &&
        d.getFullYear() < now.getFullYear()
      )
    }).sort((a, b) => a.createdAt - b.createdAt)
  }, [notes])

  if (memories.length === 0) return null

  const yearsAgo = (ts: number) => {
    const y = new Date().getFullYear() - new Date(ts).getFullYear()
    return y === 1 ? '1年前' : `${y}年前`
  }

  return (
    <div style={{
      margin: '8px 8px 0',
      padding: '10px 12px',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-light)',
      borderLeft: '2px solid var(--accent)',
      borderRadius: 6,
    }}>
      <div style={{
        fontSize: 10, color: 'var(--accent)',
        fontFamily: 'var(--font-num)', fontWeight: 500,
        letterSpacing: 0.8, textTransform: 'uppercase',
        marginBottom: 8,
      }}>
        ◈ 历史上的今天
      </div>
      {memories.map((note, i) => (
        <div
          key={note.id}
          onClick={() => {
            setActiveNote(note.id)
            onSelect(note.id)
          }}
          style={{
            paddingTop: i > 0 ? 7 : 0,
            marginTop: i > 0 ? 7 : 0,
            borderTop: i > 0 ? '1px solid var(--border-light)' : 'none',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'baseline' }}>
            <span style={{
              fontSize: 12, fontWeight: 500,
              color: 'var(--text-primary)', fontFamily: 'var(--font-serif)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>
              {note.title || getPreview(note.content, 40) || '无标题'}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-num)', flexShrink: 0 }}>
              {yearsAgo(note.createdAt)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
