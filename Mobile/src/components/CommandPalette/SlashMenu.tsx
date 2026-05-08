import { useState, useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/core'

interface CommandItem {
  title: string
  description: string
  icon: string
  action: (editor: Editor) => void
}

const commands: CommandItem[] = [
  { title: '标题 1', description: '大标题', icon: 'H1', action: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { title: '标题 2', description: '中标题', icon: 'H2', action: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { title: '标题 3', description: '小标题', icon: 'H3', action: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { title: '待办列表', description: '勾选任务', icon: '☑', action: (e) => e.chain().focus().toggleTaskList().run() },
  { title: '无序列表', description: '项目符号', icon: '•', action: (e) => e.chain().focus().toggleBulletList().run() },
  { title: '有序列表', description: '数字编号', icon: '1.', action: (e) => e.chain().focus().toggleOrderedList().run() },
  { title: '引用', description: '引用段落', icon: '"', action: (e) => e.chain().focus().toggleBlockquote().run() },
  { title: '代码块', description: '代码高亮', icon: '<>', action: (e) => e.chain().focus().toggleCodeBlock().run() },
  { title: '分割线', description: '水平分隔', icon: '──', action: (e) => e.chain().focus().setHorizontalRule().run() },
]

interface Props {
  editor: Editor
  onClose: () => void
}

export default function SlashCommandMenu({ editor, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const menuRef = useRef<HTMLDivElement>(null)

  const filtered = commands.filter(c =>
    c.title.toLowerCase().includes(query.toLowerCase()) ||
    c.description.toLowerCase().includes(query.toLowerCase())
  )

  // Position the menu at cursor
  useEffect(() => {
    try {
      const { from } = editor.state.selection
      const coords = editor.view.coordsAtPos(from)
      setPosition({ top: coords.bottom + 4, left: coords.left })
    } catch (err) {
      // Ignore positioning errors
    }
  }, [editor])

  const execute = (item: CommandItem) => {
    // Delete the "/" and any query text
    const { from } = editor.state.selection
    const deleteFrom = from - query.length - 1 // -1 for the "/"
    editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run()
    item.action(editor)
    onClose()
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setSelectedIndex(i => (i + 1) % Math.max(filtered.length, 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setSelectedIndex(i => (i - 1 + filtered.length) % Math.max(filtered.length, 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        if (filtered[selectedIndex]) execute(filtered[selectedIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [filtered, selectedIndex, onClose]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update query from editor content (watch what user types after "/")
  useEffect(() => {
    const updateQuery = () => {
      try {
        const { from } = editor.state.selection
        const textBefore = editor.state.doc.textBetween(
          Math.max(0, from - 20),
          from,
          '\n'
        )
        const slashIndex = textBefore.lastIndexOf('/')
        if (slashIndex === -1) {
          onClose()
          return
        }
        setQuery(textBefore.slice(slashIndex + 1))
        setSelectedIndex(0)
      } catch (err) {
        // Ignore parsing errors
      }
    }

    editor.on('update', updateQuery)
    return () => { editor.off('update', updateQuery) }
  }, [editor, onClose])

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  if (filtered.length === 0) return null

  return (
    <div
      ref={menuRef}
      className="slash-menu"
      style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 100 }}
    >
      {filtered.map((item, i) => (
        <div
          key={item.title}
          className={`slash-menu-item ${i === selectedIndex ? 'selected' : ''}`}
          onClick={() => execute(item)}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <div className="slash-icon">{item.icon}</div>
          <div className="slash-text">
            <span className="slash-title">{item.title}</span>
            <span className="slash-desc">{item.description}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
