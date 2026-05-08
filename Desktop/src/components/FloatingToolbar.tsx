import { useEffect, useState, useRef } from 'react'
import type { Editor } from '@tiptap/core'

interface Props {
  editor: Editor
  onLinkClick: () => void
}

export default function FloatingToolbar({ editor, onLinkClick }: Props) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const update = () => {
      const { from, to } = editor.state.selection
      if (from === to || !editor.isFocused) {
        setShow(false)
        return
      }
      // Get position of selection
      try {
        const start = editor.view.coordsAtPos(from)
        const end = editor.view.coordsAtPos(to)
        const top = start.top - 44
        const left = (start.left + end.left) / 2
        setPos({ top, left: Math.max(60, left) })
        setShow(true)
      } catch {
        setShow(false)
      }
    }

    const handleBlur = () => setShow(false)

    editor.on('selectionUpdate', update)
    editor.on('blur', handleBlur)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('blur', handleBlur)
    }
  }, [editor])

  if (!show) return null

  const btn = (label: string, action: () => void, active: boolean) => (
    <button
      onMouseDown={e => { e.preventDefault(); action() }}
      style={{
        width: 30, height: 30, border: 'none', borderRadius: 5,
        background: active ? 'var(--accent-bg)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontFamily: 'var(--font-serif)', transition: 'all 0.1s',
      }}
    >{label}</button>
  )

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', top: pos.top, left: pos.left,
        transform: 'translateX(-50%)',
        zIndex: 100,
        display: 'flex', alignItems: 'center', gap: 1, padding: '4px 6px',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
        borderRadius: 8, boxShadow: 'var(--shadow-lg)',
        animation: 'fadeIn 100ms ease-out',
      }}
    >
      {btn('B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
      {btn('I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
      {btn('U', () => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'))}
      {btn('S', () => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'))}
      <div style={{ width: 1, height: 16, background: 'var(--border-light)', margin: '0 3px' }} />
      {btn('🔗', onLinkClick, editor.isActive('link'))}
      {btn('✦', () => editor.chain().focus().toggleHighlight().run(), editor.isActive('highlight'))}
    </div>
  )
}
