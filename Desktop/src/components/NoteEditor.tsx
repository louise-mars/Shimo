import { useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { useStore } from '../store'
import { findRelatedNotes, getNudgeText } from '../lib/relations'
import { extractTags, wordCount } from '@notepro/shared'
import { noteToMarkdown } from '@notepro/shared'
import { exportAsPDF } from '../lib/exportData'
import FallingPetals from './FallingPetals'
import TagSuggestion from './TagSuggestion'
import ConfirmDialog from './ConfirmDialog'
import SlashMenu from './SlashMenu'
import { verifyPin, setPinHash, hasPinConfigured, clearPin, getAttempts, recordFailedAttempt, resetAttempts } from '../lib/pinSecurity'

// #标签 高亮
const TagHighlight = Extension.create({
  name: 'tagHighlight',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('tagHighlight'),
      props: {
        decorations(state) {
          const decos: Decoration[] = []
          state.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return
            const re = /#[\u4e00-\u9fa5\w]+/g
            let m
            while ((m = re.exec(node.text)) !== null) {
              decos.push(Decoration.inline(
                pos + m.index, pos + m.index + m[0].length,
                { class: 'inline-tag' }
              ))
            }
          })
          return DecorationSet.create(state.doc, decos)
        }
      }
    })]
  }
})

function getAmbience() {
  const h = new Date().getHours()
  if (h >= 5  && h < 9)  return { placeholder: '晨光初照，写下此刻…', petals: false }
  if (h >= 9  && h < 17) return { placeholder: '记录此刻…',           petals: false }
  if (h >= 17 && h < 20) return { placeholder: '暮色渐浓，心绪沉淠…', petals: true  }
  return                         { placeholder: '夜深人静，与自己对话…', petals: true }
}

export default function NoteEditor() {
  const { state, dispatch } = useStore()
  const note = state.notes.find(n => n.id === state.activeNoteId)
  const titleRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [relatedNotes, setRelatedNotes] = useState<import('../lib/relations').RelatedNote[]>([])
  const [nudgeDismissed, setNudgeDismissed] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle')
  const [lockedNoteId, setLockedNoteId] = useState<string | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)
  const [, setPinLockUntil] = useState(() => {
    try {
      const data = JSON.parse(localStorage.getItem('shimo-pin-attempts') || '{}')
      return data.lockedUntil || 0
    } catch { return 0 }
  })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [slashOpen, setSlashOpen] = useState(false)
  const [immersive, setImmersive] = useState(false)
  const immersiveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const ambience = getAmbience()

  // 检测加密笔记是否需要验证
  const needsUnlock = note?.locked && lockedNoteId !== note.id

  // 停止输入1.5秒后计算关联
  const notesRef = useRef(state.notes)
  notesRef.current = state.notes

  const updateRelated = useCallback((noteId: string) => {
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current)
    nudgeTimer.current = setTimeout(() => {
      const current = notesRef.current.find(n => n.id === noteId)
      if (!current) return
      const related = findRelatedNotes(current, notesRef.current, 3)
      setRelatedNotes(related)
    }, 1500)
  }, []) // no dependencies — uses ref

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: ambience.placeholder }),
      Highlight,
      Typography,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false, allowBase64: true }),
      TagHighlight,
    ],
    content: '',
    onUpdate: ({ editor: ed }) => {
      if (!note) return
      // Detect slash command
      try {
        const { from } = ed.state.selection
        const ch = ed.state.doc.textBetween(Math.max(0, from - 1), from)
        if (ch === '/' && !slashOpen) {
          const prev = from > 1 ? ed.state.doc.textBetween(from - 2, from - 1) : ''
          if (prev === '' || prev === ' ' || prev === '\n' || from === 1) setSlashOpen(true)
        }
      } catch { /* ignore */ }
      setSaveStatus('saving')
      // Reset immersive timer
      if (immersiveTimer.current) clearTimeout(immersiveTimer.current)
      setImmersive(false)
      immersiveTimer.current = setTimeout(() => setImmersive(true), 15000)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        const content = JSON.stringify(ed.getJSON())
        const tags = extractTags(content)
        dispatch({ type: 'UPDATE_NOTE', noteId: note.id, updates: { content, tags } })
        updateRelated(note.id)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      }, 300)
    },
  })

  // 切换笔记时更新内容
  useEffect(() => {
    if (!editor) return
    if (!note) { editor.commands.clearContent(); return }
    try {
      editor.commands.setContent(note.content ? JSON.parse(note.content) : '')
    } catch { editor.commands.clearContent() }
    // 新笔记聚焦标题
    if (!note.title) setTimeout(() => titleRef.current?.focus(), 50)
    else setTimeout(() => editor.commands.focus('end'), 50)
    // 切换笔记时重置关联和提示
    setRelatedNotes([])
    setNudgeDismissed(null)
    setPinInput('')
    setPinError(false)
    updateRelated(note.id)
  }, [note?.id]) // eslint-disable-line

  // Esc 关闭编辑器
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && note) {
        dispatch({ type: 'SET_ACTIVE_NOTE', noteId: null })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [note, dispatch])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current)
      if (immersiveTimer.current) clearTimeout(immersiveTimer.current)
    }
  }, [])

  const updateTitle = (title: string) => {
    if (!note) return
    dispatch({ type: 'UPDATE_NOTE', noteId: note.id, updates: { title } })
  }

  const deleteNote = () => {
    if (!note) return
    setConfirmDelete(true)
  }

  const count = note ? wordCount(note.content) : 0

  if (!note) {
    return (
      <div className="editor-panel empty-editor" style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16, userSelect: 'none',
      }}>
        <div style={{
          fontSize: 48, opacity: 0.12,
          fontFamily: 'var(--font-serif)',
        }}>
          墨
        </div>
        <p style={{
          fontSize: 14, color: 'var(--text-faint)',
          fontFamily: 'var(--font-sans)',
        }}>
          选择一条笔记，或
        </p>
        <button
          onClick={() => dispatch({ type: 'CREATE_NOTE' })}
          style={{
            padding: '10px 24px',
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <span style={{ fontSize: 16 }}>✦</span>
          新建笔记
        </button>
        <span style={{
          fontSize: 11, color: 'var(--text-faint)',
          fontFamily: 'var(--font-num)',
        }}>
          快捷键 Ctrl+N
        </span>
      </div>
    )
  }

  // 加密笔记需要输入 PIN 才能查看
  if (needsUnlock) {
    const hasPin = hasPinConfigured()
    const { lockedUntil } = getAttempts()
    const isLocked = lockedUntil > Date.now()

    const handleUnlock = async () => {
      if (isLocked) return
      const ok = await verifyPin(pinInput)
      if (ok) {
        setLockedNoteId(note.id)
        setPinInput('')
        setPinError(false)
        resetAttempts()
      } else {
        const result = recordFailedAttempt()
        setPinLockUntil(result.lockedUntil)
        setPinError(true)
        setPinInput('')
      }
    }

    const handleSetPinAndUnlock = async (newPin: string) => {
      await setPinHash(newPin)
      setLockedNoteId(note.id)
      setPinInput('')
      setPinError(false)
    }

    // 没设置过 PIN：提示先设置
    if (!hasPin) {
      return (
        <div className="editor-panel" style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 12, userSelect: 'none',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 9.9-1" />
          </svg>
          <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-secondary)', fontFamily: 'var(--font-serif)' }}>
            此笔记已加密
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', maxWidth: 260, lineHeight: 1.6 }}>
            你还没有设置 PIN 码。请先设置一个 4 位数字 PIN，用于保护加密笔记。
          </p>
          <input
            type="password"
            maxLength={4}
            value={pinInput}
            onChange={e => { setPinInput(e.target.value.replace(/\D/g, '')); setPinError(false) }}
            onKeyDown={e => e.key === 'Enter' && pinInput.length >= 4 && handleSetPinAndUnlock(pinInput)}
            placeholder="设置 PIN"
            autoFocus
            style={{
              width: 100, padding: '10px', fontSize: 20,
              textAlign: 'center', letterSpacing: 8,
              border: '1px solid var(--border-medium)',
              borderRadius: 8, background: 'var(--bg-elevated)',
              color: 'var(--text-primary)', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              onClick={() => handleSetPinAndUnlock(pinInput)}
              disabled={pinInput.length < 4}
              style={{
                padding: '8px 20px', background: pinInput.length >= 4 ? 'var(--accent)' : 'var(--bg-secondary)',
                color: pinInput.length >= 4 ? 'white' : 'var(--text-faint)',
                border: 'none', borderRadius: 6, fontSize: 13, cursor: pinInput.length >= 4 ? 'pointer' : 'default',
              }}
            >
              设置并解锁
            </button>
            <button
              onClick={() => dispatch({ type: 'SET_ACTIVE_NOTE', noteId: null })}
              style={{
                padding: '8px 20px', background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)', border: '1px solid var(--border-light)',
                borderRadius: 6, fontSize: 13, cursor: 'pointer',
              }}
            >
              返回
            </button>
          </div>
        </div>
      )
    }

    // 已设置 PIN：要求输入
    return (
      <div className="editor-panel" style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 12, userSelect: 'none',
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-secondary)', fontFamily: 'var(--font-serif)' }}>
          此笔记已加密
        </p>
        <p style={{ fontSize: 12, color: isLocked ? 'var(--danger)' : 'var(--text-faint)' }}>
          {isLocked ? `请等待后重试` : '输入 PIN 码解锁查看'}
        </p>
        <input
          type="password"
          maxLength={4}
          value={pinInput}
          onChange={e => { setPinInput(e.target.value.replace(/\D/g, '')); setPinError(false) }}
          onKeyDown={e => e.key === 'Enter' && handleUnlock()}
          placeholder="PIN"
          autoFocus
          disabled={isLocked}
          style={{
            width: 100, padding: '10px', fontSize: 20,
            textAlign: 'center', letterSpacing: 8,
            border: pinError ? '2px solid var(--danger)' : '1px solid var(--border-medium)',
            borderRadius: 8, background: 'var(--bg-elevated)',
            color: 'var(--text-primary)', outline: 'none',
          }}
        />
        {pinError && (
          <span style={{ fontSize: 12, color: 'var(--danger)' }}>PIN 码错误</span>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={handleUnlock}
            disabled={pinInput.length < 4}
            style={{
              padding: '8px 20px', background: pinInput.length >= 4 ? 'var(--accent)' : 'var(--bg-secondary)',
              color: pinInput.length >= 4 ? 'white' : 'var(--text-faint)',
              border: 'none', borderRadius: 6, fontSize: 13, cursor: pinInput.length >= 4 ? 'pointer' : 'default',
            }}
          >
            解锁
          </button>
          <button
            onClick={() => dispatch({ type: 'SET_ACTIVE_NOTE', noteId: null })}
            style={{
              padding: '8px 20px', background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)', border: '1px solid var(--border-light)',
              borderRadius: 6, fontSize: 13, cursor: 'pointer',
            }}
          >
            返回
          </button>
        </div>
        <button
          onClick={() => {
            if (confirm('重置 PIN 码？重置后所有加密笔记将被解锁。')) {
              clearPin()
              // 解锁所有加密笔记
              state.notes.filter(n => n.locked).forEach(n => {
                dispatch({ type: 'UPDATE_NOTE', noteId: n.id, updates: { locked: false } })
              })
              setLockedNoteId(note.id)
            }
          }}
          style={{
            marginTop: 12, border: 'none', background: 'none',
            color: 'var(--text-faint)', fontSize: 11, cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          忘记 PIN？
        </button>
      </div>
    )
  }

  return (
    <div className="editor-panel" role="main" aria-label="笔记编辑器" style={{ position: 'relative' }}
      onClick={() => { if (immersive) setImmersive(false) }}
    >
      <FallingPetals active={ambience.petals || immersive} season="autumn" density={immersive ? 5 : 3} />

      {/* 沉浸模式淡出标题 */}
      {immersive && note.title && (
        <div style={{
          position: 'absolute', top: 16, left: 0, right: 0,
          textAlign: 'center', fontSize: 14, color: 'var(--text-faint)',
          fontFamily: 'var(--font-serif)', opacity: 0.3,
          pointerEvents: 'none', zIndex: 5,
        }}>
          {note.title}
        </div>
      )}

      {/* 顶部操作栏 — 沉浸模式隐藏 */}
      {!immersive && (
      <div className="editor-toolbar" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 16px', borderBottom: '1px solid var(--border-light)',
        minHeight: 44,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* 关闭按钮 */}
          <button
            onClick={() => dispatch({ type: 'SET_ACTIVE_NOTE', noteId: null })}
            title="关闭 (Esc)"
            style={{
              width: 28, height: 28, border: 'none', borderRadius: 6,
              background: 'transparent', color: 'var(--text-faint)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-faint)' }}
          >
            ←
          </button>
          {/* 保存状态 */}
          <span style={{
            fontSize: 11, fontFamily: 'var(--font-num)',
            padding: '3px 8px', borderRadius: 4,
            color: saveStatus === 'saving' ? 'var(--accent)' :
                   saveStatus === 'saved' ? 'var(--success)' : 'var(--text-faint)',
            background: saveStatus === 'saving' ? 'var(--accent-light)' :
                        saveStatus === 'saved' ? 'var(--success-bg)' : 'transparent',
            transition: 'all 0.3s ease',
          }}>
            {saveStatus === 'saving' ? '● 保存中' :
             saveStatus === 'saved' ? '✓ 已保存' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* 收藏 */}
          <button
            onClick={() => dispatch({ type: 'TOGGLE_FAVORITE', noteId: note.id })}
            title={note.favorited ? '取消收藏' : '收藏'}
            style={{
              width: 28, height: 28, border: 'none', borderRadius: 6,
              background: 'transparent',
              color: note.favorited ? 'var(--accent)' : 'var(--text-faint)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, transition: 'all 0.15s',
            }}
          >
            {note.favorited ? '★' : '☆'}
          </button>
          {/* 置顶 */}
          <button
            onClick={() => dispatch({ type: 'TOGGLE_PIN', noteId: note.id })}
            title={note.pinned ? '取消置顶' : '置顶'}
            style={{
              width: 28, height: 28, border: 'none', borderRadius: 6,
              background: 'transparent',
              color: note.pinned ? 'var(--accent)' : 'var(--text-faint)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, transition: 'all 0.15s',
            }}
          >
            📌
          </button>
          {/* 隐私锁 */}
          <button
            onClick={() => {
              dispatch({ type: 'UPDATE_NOTE', noteId: note.id, updates: { locked: !note.locked } })
            }}
            title={note.locked ? '取消加密' : '加密笔记'}
            style={{
              width: 28, height: 28, border: 'none', borderRadius: 6,
              background: 'transparent',
              color: note.locked ? 'var(--accent)' : 'var(--text-faint)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              {note.locked
                ? <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                : <path d="M7 11V7a5 5 0 0 1 9.9-1" />
              }
            </svg>
          </button>
          {/* 隐藏 */}
          <button
            onClick={() => {
              dispatch({ type: 'UPDATE_NOTE', noteId: note.id, updates: { hidden: !note.hidden } })
            }}
            title={note.hidden ? '取消隐藏' : '隐藏笔记'}
            style={{
              width: 28, height: 28, border: 'none', borderRadius: 6,
              background: 'transparent',
              color: note.hidden ? 'var(--accent)' : 'var(--text-faint)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {note.hidden ? <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </> : <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </>}
            </svg>
          </button>
          {/* 删除 - 需要二次确认 */}
          {/* 复制为 Markdown */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(noteToMarkdown(note))
                .then(() => setSaveStatus('saved'))
            }}
            title="复制为 Markdown"
            aria-label="复制为 Markdown"
            style={{
              width: 28, height: 28, border: 'none', borderRadius: 6,
              background: 'transparent', color: 'var(--text-faint)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          {/* 导出 PDF */}
          <button
            onClick={() => exportAsPDF(note)}
            title="导出 PDF"
            aria-label="导出 PDF"
            style={{
              width: 28, height: 28, border: 'none', borderRadius: 6,
              background: 'transparent', color: 'var(--text-faint)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </button>
          {/* 删除 */}
          <button
            onClick={deleteNote}
            title="删除笔记"
            aria-label="删除笔记"
            style={{
              width: 28, height: 28, border: 'none', borderRadius: 6,
              background: 'transparent', color: 'var(--text-faint)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', marginLeft: 4,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--error-bg)'; e.currentTarget.style.color = 'var(--danger)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-faint)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
      )}

      {/* 标题 */}
      <input
        ref={titleRef}
        className="editor-title"
        value={note.title}
        onChange={e => updateTitle(e.target.value)}
        placeholder="标题"
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); editor?.commands.focus() }
        }}
      />

      {/* 分割线 */}
      <div className="editor-divider" />

      {/* 标签建议 */}
      <div style={{ padding: '0 24px' }}>
        <TagSuggestion
          note={note}
          onAddTag={(tag) => {
            const newTags = [...new Set([...note.tags, tag])]
            dispatch({ type: 'UPDATE_NOTE', noteId: note.id, updates: { tags: newTags } })
          }}
        />
      </div>

      {/* 正文 */}
      <div className="editor-content-wrap"
        onDrop={e => {
          if (!editor) return
          const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
          if (!files.length) return
          e.preventDefault()
          files.forEach(f => {
            const r = new FileReader()
            r.onload = () => editor.chain().focus().setImage({ src: r.result as string }).run()
            r.readAsDataURL(f)
          })
        }}
        onDragOver={e => e.preventDefault()}
        onPaste={e => {
          if (!editor) return
          const items = Array.from(e.clipboardData.items).filter(i => i.type.startsWith('image/'))
          if (!items.length) return
          e.preventDefault()
          items.forEach(i => {
            const f = i.getAsFile()
            if (!f) return
            const r = new FileReader()
            r.onload = () => editor.chain().focus().setImage({ src: r.result as string }).run()
            r.readAsDataURL(f)
          })
        }}
      >
        <EditorContent editor={editor} className="editor-content" />
        {/* Slash 命令菜单 */}
        {slashOpen && editor && (
          <SlashMenu editor={editor} onClose={() => setSlashOpen(false)} />
        )}
      </div>

      {/* Cognitive Nudge — 关联笔记轻提示 */}
      {relatedNotes.length > 0 && nudgeDismissed !== note.id && (
        <div style={{
          padding: '8px 24px',
          borderTop: '1px solid var(--border-light)',
          display: 'flex', gap: 8, alignItems: 'center',
          background: 'var(--bg-primary)',
          animation: 'fadeIn 300ms ease-out',
        }}>
          <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-num)', flexShrink: 0, letterSpacing: 0.5 }}>
            ◈ 相关
          </span>
          <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
            {relatedNotes.map((r: import('../lib/relations').RelatedNote) => (
              <button
                key={r.note.id}
                onClick={() => dispatch({ type: 'SET_ACTIVE_NOTE', noteId: r.note.id })}
                style={{
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-secondary)',
                  borderRadius: 4, padding: '3px 8px',
                  fontSize: 11, color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-serif)', cursor: 'pointer',
                  maxWidth: 140, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}
                title={getNudgeText(r)}
              >
                {r.note.title || '无标题'}
              </button>
            ))}
          </div>
          <button
            onClick={() => setNudgeDismissed(note.id)}
            style={{ border: 'none', background: 'none', color: 'var(--text-faint)', fontSize: 14, cursor: 'pointer', flexShrink: 0 }}
          >
            ×
          </button>
        </div>
      )}

      {/* 第二次激发 - 追加按钮 */}
      <div style={{
        padding: '12px 24px',
        borderTop: '1px solid var(--border-light)',
        display: 'flex',
        justifyContent: 'center',
      }}>
        <button
          onClick={() => {
            dispatch({ type: 'CREATE_NOTE' })
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-light)',
            borderRadius: 6,
            color: 'var(--text-secondary)',
            fontSize: 12,
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.color = 'var(--accent)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border-light)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
        >
          <span style={{ fontSize: 14 }}>+</span>
          追加新笔记
        </button>
      </div>

      {/* 状态栏 */}
      <div className="editor-statusbar">
        <span>{count} 字</span>
        <span>
          {note.locked && '🔒 '}
          {note.hidden && '👁‍🗨 '}
          {new Date(note.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* 沉浸模式退出提示 */}
      {immersive && (
        <div style={{
          position: 'absolute', bottom: 16, left: 0, right: 0,
          textAlign: 'center', fontSize: 11, color: 'var(--text-faint)',
          opacity: 0.3, pointerEvents: 'none',
        }}>
          轻触退出沉浸模式
        </div>
      )}

      {/* 删除确认弹窗 */}
      {confirmDelete && (
        <ConfirmDialog
          title="确定删除这条笔记？"
          message="删除后可在回收站恢复，30天后永久清除。"
          confirmLabel="删除"
          danger
          onConfirm={() => {
            dispatch({ type: 'DELETE_NOTE', noteId: note.id })
            setConfirmDelete(false)
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}
