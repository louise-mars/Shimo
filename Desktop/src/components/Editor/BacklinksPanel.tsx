/**
 * BacklinksPanel — shows notes that link TO the current note via [[title]].
 * Rendered at the bottom of the NoteEditor when backlinks exist.
 */

import { useMemo } from 'react'
import { useAppStore } from '@notepro/shared'
import { getPreview } from '@notepro/shared'
import type { Note } from '@notepro/shared'

interface Props {
  noteId: string
  noteTitle: string
}

interface Backlink {
  note: Note
  preview: string
}

export default function BacklinksPanel({ noteId, noteTitle }: Props) {
  const notes = useAppStore((s) => s.notes)
  const setActiveNote = useAppStore((s) => s.setActiveNote)

  const backlinks: Backlink[] = useMemo(() => {
    if (!noteTitle) return []

    const results: Backlink[] = []
    // Search for [[noteTitle]] in raw content JSON (where it appears as text node content)
    const patternLower = `[[${noteTitle.toLowerCase()}]]`

    for (const n of notes) {
      if (n.id === noteId || n.deletedAt || n.hidden) continue
      if (!n.content) continue

      // Direct search in the raw stringified JSON content
      // Since [[title]] is stored as literal text inside JSON text nodes,
      // searching the raw string is reliable and fast
      const contentLower = n.content.toLowerCase()
      if (contentLower.includes(patternLower)) {
        results.push({
          note: n,
          preview: getPreview(n.content, 80),
        })
      }
    }

    return results
  }, [notes, noteId, noteTitle])

  if (backlinks.length === 0) return null

  return (
    <div style={{
      padding: '16px 24px 24px',
      maxWidth: 680,
      width: '100%',
    }}>
      <div style={{
        borderTop: '1px solid var(--border-light)',
        paddingTop: 16,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 10,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 500,
            color: 'var(--text-faint)',
            fontFamily: 'var(--font-num)',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}>
            ← 被引用
          </span>
          <span style={{
            fontSize: 10,
            color: 'var(--text-faint)',
            fontFamily: 'var(--font-num)',
            background: 'var(--bg-secondary)',
            padding: '1px 6px',
            borderRadius: 3,
          }}>
            {backlinks.length}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {backlinks.map(({ note, preview }) => (
            <button
              key={note.id}
              onClick={() => setActiveNote(note.id)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 2,
                padding: '8px 12px',
                border: 'none', borderRadius: 6,
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.1s',
                width: '100%',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{
                fontSize: 13, fontWeight: 500,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-serif)',
              }}>
                {note.title || '无标题'}
              </span>
              {preview && (
                <span style={{
                  fontSize: 11,
                  color: 'var(--text-faint)',
                  fontFamily: 'var(--font-sans)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {preview}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
