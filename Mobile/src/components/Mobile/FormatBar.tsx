import type { Editor } from '@tiptap/core'

interface Props {
  editor: Editor
}

export default function FormatBar({ editor }: Props) {
  const btn = (label: string, action: () => void, active = false) => (
    <button
      onMouseDown={e => { e.preventDefault(); action() }}
      style={{
        minWidth: 36, height: 36,
        border: 'none', borderRadius: 6,
        background: active ? 'var(--accent-bg)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-tertiary)',
        fontSize: 14, fontWeight: active ? 600 : 400,
        cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-sans)',
        transition: 'all 0.1s',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2,
      padding: '4px 12px',
      borderTop: '1px solid var(--border-light)',
      background: 'var(--bg-elevated)',
      overflowX: 'auto',
      flexShrink: 0,
    }}>
      {btn('B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
      {btn('I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
      {btn('S', () => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'))}
      <div style={{ width: 1, height: 20, background: 'var(--border-light)', margin: '0 4px', flexShrink: 0 }} />
      {btn('H1', () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }))}
      {btn('H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }))}
      <div style={{ width: 1, height: 20, background: 'var(--border-light)', margin: '0 4px', flexShrink: 0 }} />
      {btn('•', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'))}
      {btn('1.', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
      {btn('☑', () => editor.chain().focus().toggleTaskList().run(), editor.isActive('taskList'))}
      <div style={{ width: 1, height: 20, background: 'var(--border-light)', margin: '0 4px', flexShrink: 0 }} />
      {btn('"', () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'))}
      {btn('<>', () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive('codeBlock'))}
    </div>
  )
}