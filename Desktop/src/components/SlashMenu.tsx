import { useState, useEffect, useRef, useCallback } from 'react'
import type { Editor } from '@tiptap/core'
import { saveImage } from '@notepro/shared'

interface CommandItem {
  title: string
  desc: string
  icon: string
  action: (editor: Editor) => void
}

/**
 * Slash command palette commands.
 * Required by Requirement 21.2: heading 1-3, bullet list, numbered list,
 * task list, blockquote, code block, horizontal rule, image.
 * Additional commands (table, inline code, center align) are included for convenience.
 */
const commands: CommandItem[] = [
  { title: '标题 1', desc: '大标题', icon: 'H1', action: e => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { title: '标题 2', desc: '中标题', icon: 'H2', action: e => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { title: '标题 3', desc: '小标题', icon: 'H3', action: e => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { title: '无序列表', desc: '项目符号', icon: '•', action: e => e.chain().focus().toggleBulletList().run() },
  { title: '有序列表', desc: '数字编号', icon: '1.', action: e => e.chain().focus().toggleOrderedList().run() },
  { title: '待办列表', desc: '勾选任务', icon: '☑', action: e => e.chain().focus().toggleTaskList().run() },
  { title: '引用', desc: '引用段落', icon: '"', action: e => e.chain().focus().toggleBlockquote().run() },
  { title: '代码块', desc: '代码高亮', icon: '<>', action: e => e.chain().focus().toggleCodeBlock().run() },
  { title: '分割线', desc: '水平分隔', icon: '──', action: e => e.chain().focus().setHorizontalRule().run() },
  {
    title: '图片',
    desc: '插入图片',
    icon: '🖼',
    action: e => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = async () => {
          const src = await saveImage(reader.result as string)
          e.chain().focus().setImage({ src }).run()
        }
        reader.readAsDataURL(file)
      }
      input.click()
    },
  },
  { title: '表格', desc: '插入3×3表格', icon: '▦', action: e => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: '行内代码', desc: '代码片段', icon: '`', action: e => e.chain().focus().toggleCode().run() },
  { title: '居中对齐', desc: '文字居中', icon: '⫿', action: e => (e.commands as any).setTextAlign('center') },
]

interface Props {
  editor: Editor
  onClose: () => void
}

/**
 * SlashMenu — command palette triggered by `/` at line start or after space.
 * Displays a filterable dropdown of block-type insertion commands.
 *
 * Requirement 21.1: Triggered on `/` at beginning of line or after space (handled by NoteEditor).
 * Requirement 21.2: Offers heading 1-3, bullet/numbered/task list, blockquote, code block, hr, image.
 * Requirement 21.3: Selecting a command inserts the block type and closes the menu.
 */
export default function SlashMenu({ editor, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLDivElement>(null)

  const filtered = commands.filter(c =>
    c.title.toLowerCase().includes(query.toLowerCase()) ||
    c.desc.toLowerCase().includes(query.toLowerCase())
  )

  // Position the menu at the cursor
  useEffect(() => {
    try {
      const { from } = editor.state.selection
      const coords = editor.view.coordsAtPos(from)
      setPos({ top: coords.bottom + 6, left: coords.left })
    } catch { /* ignore positioning errors */ }
  }, [editor])

  // Execute a command: delete the `/query` text, insert block, close menu
  const execute = useCallback((item: CommandItem) => {
    const { from } = editor.state.selection
    // Delete the slash and any typed query characters
    const deleteFrom = from - query.length - 1
    editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run()
    item.action(editor)
    onClose()
  }, [editor, query, onClose])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setSelected(i => (i + 1) % Math.max(filtered.length, 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setSelected(i => (i - 1 + filtered.length) % Math.max(filtered.length, 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        if (filtered[selected]) execute(filtered[selected])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [filtered, selected, onClose, execute])

  // Track the query text after `/`
  useEffect(() => {
    const update = () => {
      try {
        const { from } = editor.state.selection
        const text = editor.state.doc.textBetween(Math.max(0, from - 30), from, '\n')
        const idx = text.lastIndexOf('/')
        if (idx === -1) { onClose(); return }
        setQuery(text.slice(idx + 1))
        setSelected(0)
      } catch { /* ignore */ }
    }
    editor.on('update', update)
    return () => { editor.off('update', update) }
  }, [editor, onClose])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  if (filtered.length === 0) return null

  return (
    <div
      ref={ref}
      className="slash-menu"
      role="listbox"
      aria-label="命令菜单"
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 200 }}
    >
      {filtered.map((item, i) => (
        <div
          key={item.title}
          role="option"
          aria-selected={i === selected}
          className={`slash-menu-item ${i === selected ? 'selected' : ''}`}
          onClick={() => execute(item)}
          onMouseEnter={() => setSelected(i)}
        >
          <div className="slash-icon">{item.icon}</div>
          <div className="slash-text">
            <span className="slash-title">{item.title}</span>
            <span className="slash-desc">{item.desc}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
