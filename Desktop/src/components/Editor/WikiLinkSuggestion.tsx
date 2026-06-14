/**
 * WikiLinkSuggestion — autocomplete popup that appears when the user types [[
 * Shows a filtered list of note titles to complete the link.
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { useAppStore } from '@notepro/shared'
import { pinyinMatch } from '@notepro/shared'
import type { Editor } from '@tiptap/core'

interface Props {
  editor: Editor
  onClose: () => void
}

export default function WikiLinkSuggestion({ editor, onClose }: Props) {
  const notes = useAppStore((s) => s.notes)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Track the typed query after [[
  useEffect(() => {
    const handleUpdate = () => {
      try {
        const { from } = editor.state.selection
        // Look back for [[ pattern
        const textBefore = editor.state.doc.textBetween(Math.max(0, from - 50), from)
        const lastBracket = textBefore.lastIndexOf('[[')
        if (lastBracket === -1) {
          onClose()
          return
        }
        // Check if there's a closing ]] between [[ and cursor
        const afterBracket = textBefore.slice(lastBracket + 2)
        if (afterBracket.includes(']]')) {
          onClose()
          return
        }
        setQuery(afterBracket)

        // Position the popup
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

  // Filter notes by query
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

  // Reset selection on filter change
  useEffect(() => {
    setSelectedIndex(0)
  }, [filtered.length, query])

  // Scroll into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // Complete the link
  const completeLinkRef = useRef<(title: string) => void>(() => {})
  completeLinkRef.current = (title: string) => {
    try {
      const { from } = editor.state.selection
      const textBefore = editor.state.doc.textBetween(Math.max(0, from - 50), from)
      const lastBracket = textBefore.lastIndexOf('[[')
      if (lastBracket === -1) return

      const startPos = from - (textBefore.length - lastBracket)
      // Replace from [[ to cursor with [[title]]
      editor
        .chain()
        .focus()
        .deleteRange({ from: startPos, to: from })
        .insertContent(`[[${title}]]`)
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
          completeLinkRef.current(filtered[selectedIndex].title)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    // Use capture phase to intercept before editor
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
        minWidth: 240,
        maxWidth: 320,
        maxHeight: 280,
        overflow: 'auto',
        animation: 'fadeIn 100ms ease-out',
      }}
      ref={listRef}
    >
      {filtered.map((note, idx) => (
        <div
          key={note.id}
          onClick={() => completeLinkRef.current(note.title)}
          onMouseEnter={() => setSelectedIndex(idx)}
          style={{
            padding: '7px 10px',
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
          {note.tags.length > 0 && (
            <div style={{
              fontSize: 10, color: 'var(--text-faint)',
              fontFamily: 'var(--font-sans)',
              marginTop: 1,
            }}>
              {note.tags.slice(0, 3).map(t => `#${t}`).join(' ')}
            </div>
          )}
        </div>
      ))}

      <div style={{
        padding: '4px 10px 2px',
        fontSize: 10, color: 'var(--text-faint)',
        fontFamily: 'var(--font-num)',
        borderTop: '1px solid var(--border-light)',
        marginTop: 4,
      }}>
        ↑↓ 选择 · ↵ 确认 · Esc 取消
      </div>
    </div>
  )
}
