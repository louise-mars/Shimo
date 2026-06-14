/**
 * NoteEmbedSuggestion — autocomplete popup that appears when the user types ![[
 * Shows a filtered list of note titles to embed.
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { useAppStore } from '@notepro/shared'
import { pinyinMatch, getPreview } from '@notepro/shared'
import type { Editor } from '@tiptap/core'

interface Props {
  editor: Editor
  onClose: () => void
}

export default function NoteEmbedSuggestion({ editor, onClose }: Props) {
  const notes = useAppStore((s) => s.notes)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Track the typed query after ![[
  useEffect(() => {
    const handleUpdate = () => {
      try {
        const { from } = editor.state.selection
        const textBefore = editor.state.doc.textBetween(Math.max(0, from - 60), from)
        const lastBracket = textBefore.lastIndexOf('![[')
        if (lastBracket === -1) {
          onClose()
          return
        }
        const afterBracket = textBefore.slice(lastBracket + 3)
        if (afterBracket.includes(']]')) {
          onClose()
          return
        }
        setQuery(afterBracket)

        const coords = editor.view.coordsAtPos(from)
        setPosition({ top: coords.bottom + 4, left: coords.left })
      } catch {
        onClose()
      }
    }

    handleUpdate()
    editor.on('selectionUpdate', handleUpdate)
    editor.on('update', handleUpdate)

    return () => {
      editor.off('selectionUpdate', handleUpdate)
      editor.off('update', handleUpdate)
    }
  }, [editor, onClose])

  // Filter notes
  const filtered = useMemo(() => {
    const activeNotes = notes.filter(n => !n.deletedAt && !n.hidden && n.title)
    if (!query) {
      return activeNotes
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 8)
    }
    return activeNotes
      .filter(n => pinyinMatch(n.title, query))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8)
  }, [notes, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [filtered.length, query])

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // Complete the embed — replace ![[...]] with the noteEmbed node
  const completeEmbedRef = useRef<(title: string) => void>(() => {})
  completeEmbedRef.current = (title: string) => {
    try {
      const { from } = editor.state.selection
      const textBefore = editor.state.doc.textBetween(Math.max(0, from - 60), from)
      const lastBracket = textBefore.lastIndexOf('![[')
      if (lastBracket === -1) return

      const startPos = from - (textBefore.length - lastBracket)
      // Delete the ![[query text and insert the embed node
      editor
        .chain()
        .focus()
        .deleteRange({ from: startPos, to: from })
        .insertContent({
          type: 'noteEmbed',
          attrs: { title },
        })
        .run()
    } catch { /* ignore */ }
    onClose()
  }

  // Keyboard handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filtered[selectedIndex]) {
          e.preventDefault()
          completeEmbedRef.current(filtered[selectedIndex].title)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [filtered, selectedIndex, onClose])

  if (!position || filtered.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 200,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-light)',
        borderRadius: 10,
        boxShadow: 'var(--shadow-lg)',
        padding: 6,
        minWidth: 260,
        maxWidth: 340,
        maxHeight: 300,
        overflow: 'auto',
        animation: 'fadeIn 100ms ease-out',
      }}
      ref={listRef}
    >
      {/* Header hint */}
      <div style={{
        padding: '4px 10px 6px',
        fontSize: 10, color: 'var(--text-faint)',
        fontFamily: 'var(--font-num)',
        borderBottom: '1px solid var(--border-light)',
        marginBottom: 4,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{
          background: 'var(--accent-light)',
          color: 'var(--accent)',
          padding: '1px 6px', borderRadius: 3,
          fontWeight: 500,
        }}>嵌入</span>
        选择要嵌入的笔记
      </div>

      {filtered.map((note, idx) => (
        <div
          key={note.id}
          onClick={() => completeEmbedRef.current(note.title)}
          onMouseEnter={() => setSelectedIndex(idx)}
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            cursor: 'pointer',
            background: idx === selectedIndex ? 'var(--bg-active)' : 'transparent',
            transition: 'background 80ms ease',
          }}
        >
          <div style={{
            fontSize: 13, fontWeight: 500,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-serif)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {note.title}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--text-faint)',
            fontFamily: 'var(--font-sans)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginTop: 1,
          }}>
            {getPreview(note.content, 50) || '空笔记'}
          </div>
        </div>
      ))}

      <div style={{
        padding: '4px 10px 2px',
        fontSize: 10, color: 'var(--text-faint)',
        fontFamily: 'var(--font-num)',
        borderTop: '1px solid var(--border-light)',
        marginTop: 4,
      }}>
        ↑↓ 选择 · ↵ 嵌入 · Esc 取消
      </div>
    </div>
  )
}
