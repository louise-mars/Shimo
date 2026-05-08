import { useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { FontFamily } from '@tiptap/extension-font-family'
import { Link } from '@tiptap/extension-link'
import { Underline } from '@tiptap/extension-underline'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { useStore } from '../../store'
import { useKeyboard } from '../../lib/useKeyboard'
import { extractTags, extractPlainText, noteToMarkdown, wordCount } from '@notepro/shared'
import FallingPetals from './FallingPetals'
import CalendarEventCard from './CalendarEventCard'
import BottomVoiceBar from './BottomVoiceBar'
import CognitiveNudge from './CognitiveNudge'
import AmbienceControl from './AmbienceControl'
import { parseDateTimeFromText } from '../../lib/dateParser'
import { findRelatedNotes } from '../../lib/relations'
import SlashCommandMenu from '../CommandPalette/SlashMenu'
import FormatBar from './FormatBar'
import { verifyPin, setPinHash, hasPinConfigured } from '../../lib/pinSecurity'
import type { ParsedEvent } from '../../lib/dateParser'
import type { RelatedNote } from '../../lib/relations'

// #标签 高亮扩展 (optimized: only recompute when doc changes)
const TagHighlight = Extension.create({
  name: 'tagHighlight',
  addProseMirrorPlugins() {
    const key = new PluginKey('tagHighlight')
    return [new Plugin({
      key,
      state: {
        init(_, state) { return buildTagDecos(state) },
        apply(tr, oldDecos, _oldState, newState) {
          if (!tr.docChanged) return oldDecos
          return buildTagDecos(newState)
        },
      },
      props: {
        decorations(state) { return key.getState(state) }
      }
    })]
  }
})

function buildTagDecos(state: any): DecorationSet {
  const decos: Decoration[] = []
  state.doc.descendants((node: any, pos: number) => {
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

function getAmbience() {
  const h = new Date().getHours()
  if (h >= 5  && h < 9)  return { placeholder: '晨光初照，写下此刻…', petals: false }
  if (h >= 9  && h < 17) return { placeholder: '记录此刻…',           petals: false }
  if (h >= 17 && h < 20) return { placeholder: '暮色渐浓，心绪沉淀…', petals: true  }
  return                         { placeholder: '夜深人静，与自己对话…', petals: true }
}

interface Props {
  onBack: () => void
  onShowGraph?: () => void
  onGoToSettings?: () => void
}

// 笔记未找到时：短暂显示后自动返回
function NoteNotFound({ onBack }: { onBack: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onBack, 600)
    return () => clearTimeout(timer)
  }, [onBack])

  return (
    <div className="editor-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--text-faint)', fontSize: 13, fontFamily: 'var(--font-sans)' }}>返回中…</div>
    </div>
  )
}

export default function NoteEditor({ onBack, onShowGraph, onGoToSettings }: Props) {
  const { state, dispatch } = useStore()
  const note = state.notes.find(n => n.id === state.activeNoteId)
  const keyboardHeight = useKeyboard()
  const titleRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const calendarTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const ambience = getAmbience()

  const [calendarEvents, setCalendarEvents] = useState<ParsedEvent[]>([])
  const [showCalendarCard, setShowCalendarCard] = useState(false)
  const [relatedNotes, setRelatedNotes] = useState<RelatedNote[]>([])
  const [slashOpen, setSlashOpen] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showFormatBar, setShowFormatBar] = useState(false)
  const [toast, setToast] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  // PIN 加密验证
  const [unlockedNoteId, setUnlockedNoteId] = useState<string | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')

  // 日历检测（停止输入 1.5 秒后触发）
  const detectCalendarEvents = useCallback((content: string, title: string) => {
    if (calendarTimer.current) clearTimeout(calendarTimer.current)
    calendarTimer.current = setTimeout(() => {
      const fullText = [title, extractPlainText(content)].filter(Boolean).join('\n')
      const events = parseDateTimeFromText(fullText)
      if (events.length > 0) {
        setCalendarEvents(events)
        setShowCalendarCard(true)
      }
      // 同时计算关联笔记
      if (note) {
        const related = findRelatedNotes(
          { ...note, title, content },
          state.notes,
          3
        )
        setRelatedNotes(related)
      }
    }, 1500)
  }, [note, state.notes])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: ambience.placeholder }),
      Image.configure({ inline: false, allowBase64: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextStyle,
      Color,
      FontFamily,
      Link.configure({ openOnClick: false }),
      Underline,
      TagHighlight,
    ],
    content: (() => { try { return note?.content ? JSON.parse(note.content) : '' } catch { return '' } })(),
    autofocus: !note?.title,
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
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        const content = JSON.stringify(ed.getJSON())
        const tags = extractTags(content)
        dispatch({ type: 'UPDATE_NOTE', noteId: note.id, updates: { content, tags } })
        detectCalendarEvents(content, note.title)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      }, 400)
    },
  })

  // 语音输入回调
  const handleVoiceText = useCallback((text: string) => {
    if (!editor || !note || !text.trim()) return
    editor.chain().focus().insertContent(text).run()
    const content = JSON.stringify(editor.getJSON())
    const tags = extractTags(content)
    dispatch({ type: 'UPDATE_NOTE', noteId: note.id, updates: { content, tags } })
    detectCalendarEvents(content, note.title)
  }, [editor, note, dispatch, detectCalendarEvents])

  // 切换笔记时：聚焦 + Widget 语音 + 内容设置
  useEffect(() => {
    if (!note) return
    // 聚焦标题
    if (!note.title) setTimeout(() => titleRef.current?.focus(), 100)
    // Widget 语音快捷方式
    if (sessionStorage.getItem('shimo-auto-voice')) {
      sessionStorage.removeItem('shimo-auto-voice')
      setTimeout(() => {
        const voiceBtn = document.querySelector('[data-voice-trigger]') as HTMLButtonElement
        voiceBtn?.click()
      }, 300)
    }
    // 设置编辑器内容
    if (editor) {
      try { editor.commands.setContent(note.content ? JSON.parse(note.content) : '') }
      catch { editor.commands.clearContent() }
    }
    setShowCalendarCard(false)
    // 计算关联笔记
    const timer = setTimeout(() => {
      const related = findRelatedNotes(note, state.notes, 3)
      setRelatedNotes(related)
    }, 1500)
    return () => clearTimeout(timer)
  }, [note?.id]) // eslint-disable-line

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (calendarTimer.current) clearTimeout(calendarTimer.current)
    }
  }, [])

  const updateTitle = (title: string) => {
    if (!note) return
    dispatch({ type: 'UPDATE_NOTE', noteId: note.id, updates: { title } })
    detectCalendarEvents(note.content, title)
  }

  if (!note) {
    // 笔记不存在（可能已被删除或数据未加载），自动返回
    // 使用 useEffect 避免在 render 中调用 onBack
    return (
      <NoteNotFound onBack={onBack} />
    )
  }

  // === PIN 加密验证 ===
  if (note.locked && unlockedNoteId !== note.id) {
    const hasPin = hasPinConfigured()

    const handleUnlock = async () => {
      if (!pinInput || pinInput.length < 4) return
      try {
        const ok = await verifyPin(pinInput)
        if (ok) {
          setUnlockedNoteId(note.id)
          setPinInput('')
          setPinError('')
        } else {
          setPinError('PIN 码错误')
          setPinInput('')
        }
      } catch {
        setPinError('验证失败')
        setPinInput('')
      }
    }

    const handleSetPin = async () => {
      if (!pinInput || pinInput.length < 4) return
      await setPinHash(pinInput)
      setUnlockedNoteId(note.id)
      setPinInput('')
      setPinError('')
    }

    return (
      <div className="editor-page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <button onClick={onBack} style={{
          position: 'absolute', top: 16, left: 16,
          border: 'none', background: 'none', color: 'var(--text-tertiary)',
          fontSize: 18, cursor: 'pointer',
        }}>←</button>

        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>

        <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-secondary)', fontFamily: 'var(--font-serif)' }}>
          此笔记已加密
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>
          {hasPin ? '输入 PIN 码解锁' : '设置 4 位 PIN 码'}
        </p>

        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pinInput}
          onChange={e => { setPinInput(e.target.value.replace(/\D/g, '')); setPinError('') }}
          onKeyDown={e => e.key === 'Enter' && (hasPin ? handleUnlock() : handleSetPin())}
          placeholder="PIN"
          autoFocus
          style={{
            width: 120, padding: '12px', fontSize: 24,
            textAlign: 'center', letterSpacing: 10,
            border: pinError ? '2px solid var(--danger)' : '1.5px solid var(--border-medium)',
            borderRadius: 10, background: 'var(--bg-elevated)',
            color: 'var(--text-primary)', outline: 'none',
          }}
        />

        {pinError && <p style={{ fontSize: 12, color: 'var(--danger)' }}>{pinError}</p>}

        <button
          onClick={hasPin ? handleUnlock : handleSetPin}
          disabled={pinInput.length < 4}
          style={{
            padding: '10px 32px', fontSize: 15, fontWeight: 500,
            border: 'none', borderRadius: 8, cursor: 'pointer',
            background: pinInput.length >= 4 ? 'var(--accent)' : 'var(--bg-secondary)',
            color: pinInput.length >= 4 ? 'white' : 'var(--text-faint)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {hasPin ? '解锁' : '设置并解锁'}
        </button>
      </div>
    )
  }

  return (
    <div className="editor-page" style={{ position: 'relative' }}>
      <FallingPetals active={ambience.petals} season="autumn" density={3} />

      {/* 顶部 */}
      <div className="editor-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <div style={{ flex: 1 }} />
        <AmbienceControl />
        {onShowGraph && (
          <button
            className="mobile-header-btn"
            onClick={onShowGraph}
            title="查看思维图"
            style={{ fontSize: 14 }}
          >
            ◎
          </button>
        )}
        <button className="more-btn" onClick={() => setShowMenu(true)}>⋯</button>
      </div>

      {/* ActionSheet 菜单 */}
      {showMenu && (
        <div onClick={() => setShowMenu(false)} style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.3)', display: 'flex',
          alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 400, background: 'var(--bg-elevated)',
            borderRadius: '14px 14px 0 0', padding: '8px 0 env(safe-area-inset-bottom)',
            animation: 'fadeUp 150ms ease-out',
          }}>
            {[
              { label: '↩ 撤销', action: () => { editor?.chain().focus().undo().run() } },
              { label: '↪ 重做', action: () => { editor?.chain().focus().redo().run() } },
              { label: '📤 分享', action: () => {
                const text = noteToMarkdown(note)
                if (navigator.share) navigator.share({ title: note.title || '拾墨笔记', text }).catch(() => {})
                else { navigator.clipboard.writeText(text); setToast('已复制') }
              }},
              { label: note.favorited ? '取消收藏' : '☆ 收藏', action: () => { dispatch({ type: 'TOGGLE_FAVORITE', noteId: note.id }); setToast(note.favorited ? '已取消收藏' : '已收藏') } },
              { label: note.pinned ? '取消置顶' : '📌 置顶', action: () => { dispatch({ type: 'TOGGLE_PIN', noteId: note.id }); setToast(note.pinned ? '已取消置顶' : '已置顶') } },
              { label: note.locked ? '🔓 取消加密' : '🔒 加密', action: () => { dispatch({ type: 'UPDATE_NOTE', noteId: note.id, updates: { locked: !note.locked } }); setToast(note.locked ? '已取消加密' : '已加密') } },
              { label: note.hidden ? '👁 取消隐藏' : '👁‍🗨 隐藏', action: () => { dispatch({ type: 'UPDATE_NOTE', noteId: note.id, updates: { hidden: !note.hidden } }); setToast(note.hidden ? '已取消隐藏' : '已隐藏') } },
              { label: '📝 新建笔记', action: () => { dispatch({ type: 'CREATE_NOTE' }) } },
            ].map((item, i) => (
              <button key={i} onClick={() => { item.action(); setShowMenu(false) }} style={{
                width: '100%', padding: '14px 20px', border: 'none',
                background: 'none', textAlign: 'left', fontSize: 15,
                color: 'var(--text-primary)', fontFamily: 'var(--font-sans)',
                cursor: 'pointer', borderBottom: '1px solid var(--border-light)',
              }}>{item.label}</button>
            ))}
            <div style={{ height: 8, background: 'var(--bg-secondary)' }} />
            <button onClick={() => { setShowMenu(false); setShowDeleteConfirm(true) }} style={{
              width: '100%', padding: '14px 20px', border: 'none',
              background: 'none', textAlign: 'left', fontSize: 15,
              color: 'var(--danger)', fontFamily: 'var(--font-sans)', cursor: 'pointer',
            }}>🗑 删除</button>
            <button onClick={() => setShowMenu(false)} style={{
              width: '100%', padding: '14px 20px', border: 'none',
              background: 'none', textAlign: 'center', fontSize: 15,
              color: 'var(--text-faint)', fontFamily: 'var(--font-sans)', cursor: 'pointer',
              borderTop: '1px solid var(--border-light)',
            }}>取消</button>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div onClick={() => setShowDeleteConfirm(false)} style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.4)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-elevated)', borderRadius: 12,
            padding: '24px 28px', minWidth: 280, textAlign: 'center',
          }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>确定删除？</p>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 20 }}>删除后可在设置中的回收站恢复</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={{
                flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border-light)',
                background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer',
              }}>取消</button>
              <button onClick={() => { dispatch({ type: 'DELETE_NOTE', noteId: note.id }); setShowDeleteConfirm(false); onBack() }} style={{
                flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                background: 'var(--danger)', color: 'white', fontSize: 14, cursor: 'pointer',
              }}>删除</button>
            </div>
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
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); editor?.commands.focus() } }}
      />

      <div className="editor-divider" />

      {/* 内容 */}
      <div className="editor-body" style={{
        paddingBottom: keyboardHeight > 0 ? keyboardHeight : undefined
      }}>
        <EditorContent editor={editor} />
        {/* Slash 命令菜单 */}
        {slashOpen && editor && (
          <SlashCommandMenu editor={editor} onClose={() => setSlashOpen(false)} />
        )}
      </div>

      {/* 状态栏 */}
      <div style={{
        padding: '0 16px', fontSize: 11, color: 'var(--text-faint)',
        fontFamily: 'var(--font-num)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: 32,
        borderTop: '1px solid var(--border-light)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{
            color: saveStatus === 'saving' ? 'var(--accent)' : saveStatus === 'saved' ? 'var(--success)' : 'var(--text-faint)',
            transition: 'color 0.2s',
          }}>
            {saveStatus === 'saving' ? '● 保存中' : saveStatus === 'saved' ? '✓ 已保存' : ''}
          </span>
          <span>{note ? wordCount(note.content) + ' 字' : ''}</span>
          <span>{note ? new Date(note.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
        </div>
        <button
          onClick={() => setShowFormatBar(v => !v)}
          style={{
            border: 'none', background: showFormatBar ? 'var(--accent-bg)' : 'transparent',
            color: showFormatBar ? 'var(--accent)' : 'var(--text-faint)',
            fontSize: 12, cursor: 'pointer', padding: '4px 10px', borderRadius: 5,
            fontFamily: 'var(--font-sans)', fontWeight: 500, transition: 'all 0.15s',
          }}
        >
          {showFormatBar ? '收起格式 ▾' : '格式 ▸'}
        </button>
      </div>

      {/* 格式快捷栏 */}
      {editor && showFormatBar && <FormatBar editor={editor} />}

      {/* Toast 反馈 */}
      {toast && (
        <div style={{
          position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
          padding: '8px 16px', background: 'var(--ink)', color: 'var(--bg-primary)',
          borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-sans)',
          zIndex: 300, animation: 'fadeIn 150ms ease-out',
        }} ref={el => { if (el) setTimeout(() => setToast(''), 1500) }}>
          {toast}
        </div>
      )}

      {/* 底部语音输入栏 */}
      <div style={{ marginBottom: keyboardHeight > 0 ? keyboardHeight : 0, transition: 'margin-bottom 0.25s ease' }}>
        <BottomVoiceBar
        onText={handleVoiceText}
        onGoToSettings={onGoToSettings}
        onStructured={(title, content, tags) => {
          if (!note) return
          // 如果笔记无标题，用 AI 提取的标题
          if (!note.title && title) {
            dispatch({ type: 'UPDATE_NOTE', noteId: note.id, updates: { title } })
          }
          // 插入结构化内容
          editor?.chain().focus().insertContent(content).run()
          const newContent = JSON.stringify(editor?.getJSON())
          dispatch({ type: 'UPDATE_NOTE', noteId: note.id, updates: { content: newContent, tags } })
          detectCalendarEvents(newContent, note.title || title)
        }}
      />
      </div>

      {/* 日历确认卡片 */}
      {showCalendarCard && calendarEvents.length > 0 && (
        <CalendarEventCard
          events={calendarEvents}
          onDismiss={() => setShowCalendarCard(false)}
        />
      )}

      {/* Cognitive Nudge — 关联笔记轻提示 */}
      {!showCalendarCard && relatedNotes.length > 0 && (
        <CognitiveNudge
          related={relatedNotes}
          onSelectNote={(noteId) => {
            dispatch({ type: 'SET_ACTIVE_NOTE', noteId })
          }}
        />
      )}
    </div>
  )
}
