import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { saveImage } from '@notepro/shared'
import type { Editor } from '@tiptap/core'

interface Props {
  editor: Editor
}

const COLORS = [
  { label: '默认', value: '' },
  { label: '红', value: '#B5341A' },
  { label: '橙', value: '#C87A2B' },
  { label: '绿', value: '#3D6B5E' },
  { label: '蓝', value: '#2B5EA6' },
  { label: '紫', value: '#6B3FA0' },
  { label: '灰', value: '#7A6248' },
]

const FONTS = [
  { label: '默认', value: '' },
  { label: '宋', value: 'Noto Serif SC' },
  { label: '黑', value: 'Noto Sans SC' },
  { label: '等宽', value: 'JetBrains Mono' },
]

async function insertImage(editor: Editor) {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
      })
      if (photo.dataUrl) {
        const src = await saveImage(photo.dataUrl)
        editor.chain().focus().setImage({ src }).run()
      }
    } else {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = async () => {
          const src = await saveImage(reader.result as string)
          editor.chain().focus().setImage({ src }).run()
        }
        reader.readAsDataURL(file)
      }
      input.click()
    }
  } catch (err) {
    console.warn('Failed to insert image:', err)
  }
}

export default function FormatBar({ editor }: Props) {
  const [showColors, setShowColors] = useState(false)
  const [showFonts, setShowFonts] = useState(false)
  const [showSizes, setShowSizes] = useState(false)
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  const btn = (label: string, action: () => void, active = false, extraStyle?: React.CSSProperties) => (
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
        position: 'relative',
        ...extraStyle,
      }}
    >
      {label}
    </button>
  )

  const currentColor = editor.getAttributes('textStyle').color || ''

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {/* 主工具栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '4px 12px',
        borderTop: '1px solid var(--border-light)',
        background: 'var(--bg-elevated)',
        overflowX: 'auto',
      }}>
        {/* 撤销/重做 */}
        {btn('↩', () => editor.chain().focus().undo().run(), false, { opacity: editor.can().undo() ? 1 : 0.3 })}
        {btn('↪', () => editor.chain().focus().redo().run(), false, { opacity: editor.can().redo() ? 1 : 0.3 })}

        <div style={{ width: 1, height: 20, background: 'var(--border-light)', margin: '0 3px', flexShrink: 0 }} />

        {btn('B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'), { fontWeight: 700 })}
        {btn('I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'), { fontStyle: 'italic' })}
        {btn('U', () => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'), { textDecoration: 'underline' })}
        {btn('S', () => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'), { textDecoration: 'line-through' })}
        {btn('🔗', () => {
          setShowLinkInput(true)
          setLinkUrl(editor.getAttributes('link').href || 'https://')
          setShowColors(false); setShowFonts(false)
        }, editor.isActive('link'), { fontSize: 12 })}
        {btn('T', () => editor.chain().focus().clearNodes().unsetAllMarks().run(), false, { color: 'var(--text-faint)', fontSize: 12 })}

        <div style={{ width: 1, height: 20, background: 'var(--border-light)', margin: '0 3px', flexShrink: 0 }} />

        {btn('H1', () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }))}
        {btn('H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }))}

        <div style={{ width: 1, height: 20, background: 'var(--border-light)', margin: '0 3px', flexShrink: 0 }} />

        {btn('•', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'))}
        {btn('1.', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
        {btn('☑', () => editor.chain().focus().toggleTaskList().run(), editor.isActive('taskList'))}
        {btn('→', () => editor.chain().focus().sinkListItem('listItem').run())}
        {btn('←', () => editor.chain().focus().liftListItem('listItem').run())}
        {btn('"', () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'))}
        {btn('✦', () => editor.chain().focus().toggleHighlight().run(), editor.isActive('highlight'))}
        {btn('`', () => editor.chain().focus().toggleCode().run(), editor.isActive('code'), { fontFamily: 'monospace', fontSize: 12 })}

        <div style={{ width: 1, height: 20, background: 'var(--border-light)', margin: '0 3px', flexShrink: 0 }} />

        {/* 对齐 */}
        {btn('⫷', () => (editor.commands as any).setTextAlign('left'), editor.getAttributes('paragraph').textAlign === 'left' || !editor.getAttributes('paragraph').textAlign)}
        {btn('⫿', () => (editor.commands as any).setTextAlign('center'), editor.getAttributes('paragraph').textAlign === 'center')}
        {btn('⫸', () => (editor.commands as any).setTextAlign('right'), editor.getAttributes('paragraph').textAlign === 'right')}

        <div style={{ width: 1, height: 20, background: 'var(--border-light)', margin: '0 3px', flexShrink: 0 }} />

        {/* 表格 */}
        {btn('▦', () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), editor.isActive('table'))}

        <div style={{ width: 1, height: 20, background: 'var(--border-light)', margin: '0 3px', flexShrink: 0 }} />

        {/* 颜色按钮 */}
        <button
          onMouseDown={e => { e.preventDefault(); setShowColors(v => !v); setShowFonts(false); setShowSizes(false) }}
          style={{
            minWidth: 36, height: 36, border: 'none', borderRadius: 6,
            background: showColors ? 'var(--accent-bg)' : 'transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 2, position: 'relative',
          }}
        >
          <span style={{ fontSize: 14, color: currentColor || 'var(--text-tertiary)' }}>A</span>
          <span style={{ width: 14, height: 3, borderRadius: 1, background: currentColor || 'var(--text-primary)' }} />
        </button>

        {/* 字体按钮 */}
        <button
          onMouseDown={e => { e.preventDefault(); setShowFonts(v => !v); setShowColors(false); setShowSizes(false) }}
          style={{
            minWidth: 36, height: 36, border: 'none', borderRadius: 6,
            background: showFonts ? 'var(--accent-bg)' : 'transparent',
            color: showFonts ? 'var(--accent)' : 'var(--text-tertiary)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontFamily: 'var(--font-serif)',
          }}
        >字</button>

        {/* 字号按钮 */}
        <button
          onMouseDown={e => { e.preventDefault(); setShowSizes(v => !v); setShowColors(false); setShowFonts(false) }}
          style={{
            minWidth: 36, height: 36, border: 'none', borderRadius: 6,
            background: showSizes ? 'var(--accent-bg)' : 'transparent',
            color: showSizes ? 'var(--accent)' : 'var(--text-tertiary)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontFamily: 'var(--font-num)',
          }}
        >大小</button>

        <div style={{ width: 1, height: 20, background: 'var(--border-light)', margin: '0 3px', flexShrink: 0 }} />

        {btn('🖼', () => insertImage(editor))}
      </div>

      {/* 颜色面板 */}
      {showColors && (
        <div style={{
          display: 'flex', gap: 6, padding: '8px 16px',
          borderTop: '1px solid var(--border-light)',
          background: 'var(--bg-elevated)',
        }}>
          {COLORS.map(c => (
            <button
              key={c.value}
              onMouseDown={e => {
                e.preventDefault()
                if (c.value) editor.chain().focus().setColor(c.value).run()
                else editor.chain().focus().unsetColor().run()
                setShowColors(false)
              }}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                border: currentColor === c.value ? '2px solid var(--accent)' : '1px solid var(--border-medium)',
                background: c.value || 'var(--bg-primary)',
                cursor: 'pointer', padding: 0,
              }}
              title={c.label}
            />
          ))}
        </div>
      )}

      {/* 字体面板 */}
      {showFonts && (
        <div style={{
          display: 'flex', gap: 6, padding: '8px 16px',
          borderTop: '1px solid var(--border-light)',
          background: 'var(--bg-elevated)',
        }}>
          {FONTS.map(f => (
            <button
              key={f.value}
              onMouseDown={e => {
                e.preventDefault()
                if (f.value) editor.chain().focus().setFontFamily(f.value).run()
                else editor.chain().focus().unsetFontFamily().run()
                setShowFonts(false)
              }}
              style={{
                padding: '6px 12px', borderRadius: 6,
                border: (editor.getAttributes('textStyle').fontFamily || '') === f.value
                  ? '1.5px solid var(--accent)' : '1px solid var(--border-light)',
                background: 'var(--bg-primary)',
                color: 'var(--text-secondary)',
                fontSize: 13, cursor: 'pointer',
                fontFamily: f.value || 'var(--font-sans)',
              }}
            >{f.label}</button>
          ))}
        </div>
      )}

      {/* 字号面板 */}
      {showSizes && (
        <div style={{
          display: 'flex', gap: 6, padding: '8px 16px',
          borderTop: '1px solid var(--border-light)',
          background: 'var(--bg-elevated)',
          flexWrap: 'wrap',
        }}>
          {[
            { label: '默认', value: '' },
            { label: '12', value: '12px' },
            { label: '14', value: '14px' },
            { label: '16', value: '16px' },
            { label: '18', value: '18px' },
            { label: '20', value: '20px' },
            { label: '24', value: '24px' },
            { label: '28', value: '28px' },
          ].map(s => (
            <button
              key={s.value}
              onMouseDown={e => {
                e.preventDefault()
                if (s.value) (editor.commands as any).setFontSize(s.value)
                else (editor.commands as any).unsetFontSize()
                setShowSizes(false)
              }}
              style={{
                padding: '6px 12px', borderRadius: 6,
                border: (editor.getAttributes('textStyle').fontSize || '') === s.value
                  ? '1.5px solid var(--accent)' : '1px solid var(--border-light)',
                background: 'var(--bg-primary)',
                color: 'var(--text-secondary)',
                fontSize: s.value ? parseInt(s.value) > 16 ? 14 : 13 : 13,
                cursor: 'pointer',
                fontFamily: 'var(--font-num)',
              }}
            >{s.label}</button>
          ))}
        </div>
      )}

      {/* 链接输入面板 */}
      {showLinkInput && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px',
          borderTop: '1px solid var(--border-light)',
          background: 'var(--bg-elevated)',
        }}>
          <input
            autoFocus
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (linkUrl.trim()) editor.chain().focus().setLink({ href: linkUrl.trim() }).run()
                setShowLinkInput(false); setLinkUrl('')
              }
            }}
            placeholder="输入链接地址"
            style={{
              flex: 1, padding: '8px 12px', fontSize: 14,
              border: '1px solid var(--border-medium)', borderRadius: 8,
              background: 'var(--bg-primary)', color: 'var(--text-primary)',
              outline: 'none', fontFamily: 'var(--font-num)',
            }}
          />
          <button onMouseDown={e => {
            e.preventDefault()
            if (linkUrl.trim()) editor.chain().focus().setLink({ href: linkUrl.trim() }).run()
            setShowLinkInput(false); setLinkUrl('')
          }} style={{
            padding: '8px 14px', fontSize: 13, border: 'none', borderRadius: 6,
            background: 'var(--accent)', color: 'white', cursor: 'pointer',
          }}>确定</button>
          <button onMouseDown={e => {
            e.preventDefault()
            setShowLinkInput(false); setLinkUrl('')
          }} style={{
            border: 'none', background: 'none', color: 'var(--text-faint)', fontSize: 16, cursor: 'pointer',
          }}>✕</button>
        </div>
      )}
    </div>
  )
}
