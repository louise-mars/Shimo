import { useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import { useStore } from '../../store'
import { takePhoto, pickPhoto, shareNote, hapticLight } from '../../lib/native'
import { noteToMarkdown } from '@notepro/shared'
import FallingPetals from './FallingPetals'

// 根据月份判断季节
function getSeason(): 'spring' | 'autumn' {
  const month = new Date().getMonth() + 1
  return (month >= 3 && month <= 5) || month === 2 ? 'spring' : 'autumn'
}

// 根据时间判断氛围
function getTimeAmbience(): 'dawn' | 'day' | 'dusk' | 'night' {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 9) return 'dawn'
  if (hour >= 9 && hour < 17) return 'day'
  if (hour >= 17 && hour < 20) return 'dusk'
  return 'night'
}

const AMBIENCE_STYLES: Record<string, { bg: string; text: string; placeholder: string }> = {
  dawn:  { bg: 'linear-gradient(180deg, #FFF3E8 0%, #F7F0E6 100%)', text: '#2C1810', placeholder: '晨光初照，思绪如流水...' },
  day:   { bg: 'linear-gradient(180deg, #F7F3EC 0%, #F0EBE0 100%)', text: '#1A1208', placeholder: '落笔成文，记下此刻...' },
  dusk:  { bg: 'linear-gradient(180deg, #F5EDE0 0%, #EDE0D0 100%)', text: '#1A1208', placeholder: '暮色渐浓，心绪沉淀...' },
  night: { bg: 'linear-gradient(180deg, #1A1610 0%, #12100C 100%)', text: '#EDE4D0', placeholder: '夜深人静，与自己对话...' },
}

interface MobileEditorProps {
  onBack: () => void
}

export default function MobileEditor({ onBack }: MobileEditorProps) {
  const { state, dispatch } = useStore()
  const [showFormatBar, setShowFormatBar] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [immersive, setImmersive] = useState(false)
  const [showPetals, setShowPetals] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const immersiveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const season = getSeason()
  const ambience = getTimeAmbience()
  const ambienceStyle = AMBIENCE_STYLES[ambience]
  const isDark = ambience === 'night'

  const note = state.notes.find(n => n.id === state.activeNoteId)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: ambienceStyle.placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Typography,
    ],
    content: note?.content ? JSON.parse(note.content) : '',
    onUpdate: ({ editor }) => {
      if (!note) return
      dispatch({ type: 'UPDATE_NOTE', noteId: note.id, updates: { content: JSON.stringify(editor.getJSON()) } })
      // 停止输入 2.5 秒后进入沉浸模式
      if (immersiveTimerRef.current) clearTimeout(immersiveTimerRef.current)
      immersiveTimerRef.current = setTimeout(() => {
        setImmersive(true)
        setShowPetals(true)
      }, 2500)
    },
  })

  useEffect(() => {
    if (!note || !editor) return
    try {
      const content = note.content ? JSON.parse(note.content) : ''
      editor.commands.setContent(content)
    } catch {
      editor.commands.setContent('')
    }
  }, [note?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // 退出沉浸模式
  const exitImmersive = useCallback(() => {
    if (immersive) {
      setImmersive(false)
      setShowPetals(false)
      if (immersiveTimerRef.current) clearTimeout(immersiveTimerRef.current)
    }
  }, [immersive])

  const updateTitle = (title: string) => {
    if (!note) return
    dispatch({ type: 'UPDATE_NOTE', noteId: note.id, updates: { title } })
  }

  const handleShare = async () => {
    if (!note) return
    await hapticLight()
    await shareNote(note.title || '笔记', noteToMarkdown(note))
    setShowMoreMenu(false)
  }

  const insertImage = async (fromCamera: boolean) => {
    await hapticLight()
    const dataUrl = fromCamera ? await takePhoto() : await pickPhoto()
    if (dataUrl) editor?.chain().focus().setImage({ src: dataUrl }).run()
  }

  const formatButtons = [
    { icon: '𝐁', label: '粗体', action: () => editor?.chain().focus().toggleBold().run(), isActive: () => editor?.isActive('bold') ?? false },
    { icon: '𝐼', label: '斜体', action: () => editor?.chain().focus().toggleItalic().run(), isActive: () => editor?.isActive('italic') ?? false },
    { icon: 'H1', label: '标题', action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), isActive: () => editor?.isActive('heading', { level: 1 }) ?? false },
    { icon: 'H2', label: '小标', action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), isActive: () => editor?.isActive('heading', { level: 2 }) ?? false },
    { icon: '•', label: '列表', action: () => editor?.chain().focus().toggleBulletList().run(), isActive: () => editor?.isActive('bulletList') ?? false },
    { icon: '☑', label: '待办', action: () => editor?.chain().focus().toggleTaskList().run(), isActive: () => editor?.isActive('taskList') ?? false },
    { icon: '❝', label: '引用', action: () => editor?.chain().focus().toggleBlockquote().run(), isActive: () => editor?.isActive('blockquote') ?? false },
    { icon: '💡', label: '高亮', action: () => editor?.chain().focus().toggleHighlight().run(), isActive: () => editor?.isActive('highlight') ?? false },
    { icon: '📷', label: '拍照', action: () => insertImage(true), isActive: () => false },
    { icon: '🖼', label: '相册', action: () => insertImage(false), isActive: () => false },
  ]

  if (!note) {
    return (
      <div className="mobile-editor">
        <div className="mobile-editor-header">
          <button className="mobile-editor-back" onClick={onBack}>←</button>
          <div style={{ flex: 1, textAlign: 'center', color: 'var(--text-tertiary)', fontFamily: 'var(--font-serif)' }}>请选择一条笔记</div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="mobile-editor"
      style={immersive ? { background: ambienceStyle.bg } : undefined}
    >
      {/* 落花动画 */}
      <FallingPetals active={showPetals} season={season} density={4} />

      {/* 头部 — 沉浸模式下隐藏 */}
      {!immersive && (
        <div className="mobile-editor-header">
          <button className="mobile-editor-back" onClick={onBack}>←</button>
          <input
            ref={titleRef}
            className="mobile-editor-title"
            value={note.title}
            onChange={(e) => updateTitle(e.target.value)}
            placeholder="题目"
          />
          <div className="mobile-editor-actions">
            <button className="mobile-header-btn" onClick={() => { setShowFormatBar(v => !v); setShowMoreMenu(false) }}>Aa</button>
            <button className="mobile-header-btn" onClick={() => { setShowMoreMenu(v => !v); setShowFormatBar(false) }}>⋯</button>
          </div>
        </div>
      )}

      {/* 更多菜单 */}
      {showMoreMenu && (
        <div style={{
          position: 'absolute', top: 56, right: 8, zIndex: 200,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
          borderRadius: 8, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', minWidth: 160,
        }}>
          {[
            { icon: '🌸', label: immersive ? '退出沉浸' : '沉浸写作', action: () => { immersive ? exitImmersive() : (setImmersive(true), setShowPetals(true)); setShowMoreMenu(false) } },
            { icon: '📌', label: note.pinned ? '取消置顶' : '置顶', action: () => { dispatch({ type: 'TOGGLE_PIN', noteId: note.id }); setShowMoreMenu(false) } },
            { icon: '⭐', label: note.favorited ? '取消收藏' : '收藏', action: () => { dispatch({ type: 'TOGGLE_FAVORITE', noteId: note.id }); setShowMoreMenu(false) } },
            { icon: '📤', label: '分享', action: handleShare },
            { icon: '🗑️', label: '删除', action: () => { if (confirm('确定删除？')) { dispatch({ type: 'DELETE_NOTE', noteId: note.id }); onBack() } } },
          ].map(item => (
            <button key={item.label} onClick={item.action} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '12px 16px', border: 'none', background: 'none',
              color: item.label === '删除' ? 'var(--danger)' : 'var(--text-primary)',
              fontSize: 15, cursor: 'pointer', fontFamily: 'var(--font-serif)',
            }}>
              <span>{item.icon}</span><span>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 沉浸模式退出提示 */}
      {immersive && (
        <div
          onClick={exitImmersive}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 5, cursor: 'pointer',
          }}
        />
      )}

      {/* 沉浸模式顶部淡出标题 */}
      {immersive && note.title && (
        <div style={{
          position: 'absolute', top: 20, left: 0, right: 0,
          textAlign: 'center', zIndex: 15, pointerEvents: 'none',
          fontFamily: 'var(--font-serif)', fontSize: 14,
          color: isDark ? 'rgba(237,228,208,0.3)' : 'rgba(26,18,8,0.2)',
          letterSpacing: 4,
        }}>
          {note.title}
        </div>
      )}

      {/* 编辑器内容 */}
      <div
        className="mobile-editor-content"
        style={immersive ? {
          background: 'transparent',
          backgroundImage: 'none',
          zIndex: 15,
          position: 'relative',
        } : undefined}
        onClick={() => { setShowMoreMenu(false); if (immersive) exitImmersive() }}
      >
        <EditorContent
          editor={editor}
          style={immersive ? {
            '--immersive-color': ambienceStyle.text,
          } as React.CSSProperties : undefined}
        />
      </div>

      {/* 格式工具栏 — 沉浸模式下隐藏 */}
      {!immersive && showFormatBar && (
        <div className="mobile-format-toolbar">
          {formatButtons.map((btn, i) => (
            <button
              key={i}
              className={`mobile-format-btn ${btn.isActive() ? 'active' : ''}`}
              onClick={btn.action}
              title={btn.label}
            >
              {btn.icon}
            </button>
          ))}
        </div>
      )}

      {/* 沉浸模式底部退出提示 */}
      {immersive && (
        <div style={{
          position: 'absolute', bottom: 30, left: 0, right: 0,
          textAlign: 'center', zIndex: 15, pointerEvents: 'none',
          fontSize: 11, letterSpacing: 3,
          color: isDark ? 'rgba(237,228,208,0.2)' : 'rgba(26,18,8,0.15)',
          fontFamily: 'var(--font-serif)',
        }}>
          轻触退出
        </div>
      )}
    </div>
  )
}