/**
 * FocusMode — distraction-free writing overlay.
 * Hides all chrome (sidebar, note list, toolbar) and presents the editor
 * full-width with larger serif font and minimal UI.
 *
 * Toggle: Ctrl+Shift+F
 * Exit: Escape or click the subtle exit button
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Underline } from '@tiptap/extension-underline'
import { Link } from '@tiptap/extension-link'
import { useAppStore } from '@notepro/shared'
import { wordCount, extractTags } from '@notepro/shared'
import type { Note } from '@notepro/shared'

interface Props {
  note: Note
  onClose: () => void
}

export default function FocusMode({ note, onClose }: Props) {
  const updateNote = useAppStore((s) => s.updateNote)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [count, setCount] = useState(() => wordCount(note.content))

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: '静心书写…' }),
      Highlight,
      Typography,
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
      Link.configure({ openOnClick: false }),
    ],
    content: (() => { try { return note.content ? JSON.parse(note.content) : '' } catch { return '' } })(),
    autofocus: 'end',
    onUpdate: ({ editor: ed }) => {
      setSaveStatus('saving')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        const content = JSON.stringify(ed.getJSON())
        const tags = extractTags(content)
        updateNote(note.id, { content, tags })
        setCount(wordCount(content))
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      }, 600)
    },
  })

  // Escape to exit (flush save first)
  const handleClose = useCallback(() => {
    // Flush any pending save before closing
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = undefined
    }
    if (editor) {
      const content = JSON.stringify(editor.getJSON())
      const tags = extractTags(content)
      updateNote(note.id, { content, tags })
    }
    onClose()
  }, [editor, note.id, updateNote, onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleClose])

  // Cleanup — also flush save on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        background: 'var(--bg-primary)',
        display: 'flex', flexDirection: 'column',
        animation: 'focusModeIn 300ms ease-out',
      }}
      role="dialog"
      aria-label="专注模式"
    >
      {/* Minimal header — just title and exit */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px',
        opacity: 0.6,
        transition: 'opacity 0.3s',
      }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
      >
        <span style={{
          fontSize: 14, fontWeight: 500,
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-serif)',
          letterSpacing: 1,
        }}>
          {note.title || '无标题'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{
            fontSize: 11, color: 'var(--text-faint)',
            fontFamily: 'var(--font-num)',
          }}>
            {count} 字
            {saveStatus === 'saving' && ' · 保存中…'}
            {saveStatus === 'saved' && ' · ✓'}
          </span>
          <button
            onClick={handleClose}
            title="退出专注模式 (Esc)"
            style={{
              border: 'none', background: 'var(--bg-secondary)',
              color: 'var(--text-faint)',
              padding: '6px 14px', borderRadius: 6,
              fontSize: 12, cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; e.currentTarget.style.background = 'var(--bg-secondary)' }}
          >
            退出专注
          </button>
        </div>
      </div>

      {/* Editor area — full width, centered, larger font */}
      <div style={{
        flex: 1, overflow: 'auto',
        display: 'flex', justifyContent: 'center',
        padding: '0 32px 80px',
      }}>
        <div className="focus-mode-editor" style={{ width: '100%', maxWidth: 720 }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Subtle bottom hint */}
      <div style={{
        position: 'fixed', bottom: 16, left: '50%',
        transform: 'translateX(-50%)',
        fontSize: 10, color: 'var(--text-faint)',
        fontFamily: 'var(--font-num)',
        opacity: 0.3,
      }}>
        Esc 退出 · 专注模式
      </div>

      <style>{`
        @keyframes focusModeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .focus-mode-editor .tiptap {
          outline: none;
          font-family: var(--font-serif);
          font-size: 18px;
          line-height: 2;
          color: var(--text-primary);
          caret-color: var(--accent);
          min-height: 60vh;
        }
        .focus-mode-editor .tiptap p {
          margin-bottom: 0.6em;
        }
        .focus-mode-editor .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--text-faint);
          pointer-events: none;
          height: 0;
          font-family: var(--font-sans);
          font-weight: 300;
          font-size: 18px;
        }
        .focus-mode-editor .tiptap h1 {
          font-size: 28px; font-weight: 700;
          font-family: var(--font-serif);
          margin: 1.4em 0 0.5em;
          letter-spacing: 1px;
        }
        .focus-mode-editor .tiptap h2 {
          font-size: 22px; font-weight: 600;
          font-family: var(--font-serif);
          margin: 1.2em 0 0.4em;
        }
        .focus-mode-editor .tiptap h3 {
          font-size: 18px; font-weight: 600;
          font-family: var(--font-sans);
          margin: 1em 0 0.3em;
          color: var(--text-secondary);
        }
        .focus-mode-editor .tiptap blockquote {
          border-left: 2px solid var(--accent);
          padding-left: 20px;
          color: var(--text-tertiary);
          font-style: italic;
          margin: 1em 0;
        }
        .focus-mode-editor .tiptap code {
          font-family: var(--font-mono);
          font-size: 0.85em;
          background: var(--bg-secondary);
          border-radius: 4px;
          padding: 2px 5px;
        }
        .focus-mode-editor .tiptap pre {
          background: var(--bg-secondary);
          border-radius: 8px;
          padding: 20px;
          margin: 1em 0;
          font-family: var(--font-mono);
          font-size: 14px;
          line-height: 1.7;
          overflow-x: auto;
        }
        .focus-mode-editor .tiptap ul,
        .focus-mode-editor .tiptap ol {
          padding-left: 24px;
          margin: 0.5em 0;
        }
        .focus-mode-editor .tiptap mark {
          background: rgba(200, 168, 75, 0.25);
          border-radius: 2px;
          padding: 0 3px;
        }
      `}</style>
    </div>
  )
}
