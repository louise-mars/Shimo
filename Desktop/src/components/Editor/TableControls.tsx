/**
 * TableControls — floating toolbar that appears when cursor is inside a table.
 * Provides quick actions: add row/column, delete row/column, toggle header, delete table.
 * Positioned above the table.
 */

import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'

interface Props {
  editor: Editor
}

export default function TableControls({ editor }: Props) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    const update = () => {
      if (!editor.isActive('table')) {
        setShow(false)
        return
      }
      try {
        const { from } = editor.state.selection
        const coords = editor.view.coordsAtPos(from)
        // Position above the current cell
        setPos({ top: coords.top - 42, left: coords.left })
        setShow(true)
      } catch {
        setShow(false)
      }
    }

    editor.on('selectionUpdate', update)
    editor.on('update', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('update', update)
    }
  }, [editor])

  if (!show) return null

  const btn = (label: string, title: string, action: () => void, danger = false) => (
    <button
      onMouseDown={e => { e.preventDefault(); action() }}
      title={title}
      style={{
        border: 'none', borderRadius: 4,
        padding: '4px 8px', fontSize: 11,
        background: 'transparent',
        color: danger ? 'var(--danger)' : 'var(--text-secondary)',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        transition: 'all 0.1s',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? 'var(--error-bg)' : 'var(--bg-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {label}
    </button>
  )

  return (
    <div
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 100,
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '4px 6px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-light)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-lg)',
        animation: 'fadeIn 100ms ease-out',
      }}
    >
      {btn('+行↓', '在下方添加行', () => editor.chain().focus().addRowAfter().run())}
      {btn('+行↑', '在上方添加行', () => editor.chain().focus().addRowBefore().run())}
      <div style={{ width: 1, height: 14, background: 'var(--border-light)', margin: '0 2px' }} />
      {btn('+列→', '在右侧添加列', () => editor.chain().focus().addColumnAfter().run())}
      {btn('+列←', '在左侧添加列', () => editor.chain().focus().addColumnBefore().run())}
      <div style={{ width: 1, height: 14, background: 'var(--border-light)', margin: '0 2px' }} />
      {btn('删行', '删除当前行', () => editor.chain().focus().deleteRow().run(), true)}
      {btn('删列', '删除当前列', () => editor.chain().focus().deleteColumn().run(), true)}
      <div style={{ width: 1, height: 14, background: 'var(--border-light)', margin: '0 2px' }} />
      {btn('表头', '切换表头行', () => editor.chain().focus().toggleHeaderRow().run())}
      {btn('删表', '删除整个表格', () => editor.chain().focus().deleteTable().run(), true)}
    </div>
  )
}
