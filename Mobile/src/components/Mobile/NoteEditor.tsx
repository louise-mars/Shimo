import { useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { useStore } from '../../store'
import { useKeyboard } from '../../lib/useKeyboard'
import { extractTags, extractPlainText } from '@notepro/shared'
import FallingPetals from './FallingPetals'
import CalendarEventCard from './CalendarEventCard'
import BottomVoiceBar from './BottomVoiceBar'
import CognitiveNudge from './CognitiveNudge'
import AmbienceControl from './AmbienceControl'
import { parseDateTimeFromText } from '../../lib/dateParser'
import { findRelatedNotes } from '../../lib/relations'
import SlashCommandMenu from '../CommandPalette/SlashMenu'
import FormatBar from './FormatBar'
import type { ParsedEvent } from '../../lib/dateParser'
import type { RelatedNote } from '../../lib/relations'

// #标签 高亮扩展
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
  if (h >= 17 && h < 20) return { placeholder: '暮色渐浓，心绪沉淀…', petals: true  }
  return                         { placeholder: '夜深人静，与自己对话…', petals: true }
}

interface Props {
  onBack: () => void
  onShowGraph?: () => void
}

export default function NoteEditor({ onBack, onShowGraph }: Props) {
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
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        const content = JSON.stringify(ed.getJSON())
        const tags = extractTags(content)
        dispatch({ type: 'UPDATE_NOTE', noteId: note.id, updates: { content, tags } })
        detectCalendarEvents(content, note.title)
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

  const updateTitle = (title: string) => {
    if (!note) return
    dispatch({ type: 'UPDATE_NOTE', noteId: note.id, updates: { title } })
    detectCalendarEvents(note.content, title)
  }

  if (!note) return (
    <div className="editor-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--text-faint)', fontSize: 13, fontFamily: 'var(--font-sans)' }}>加载中…</div>
    </div>
  )

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

      {/* 字数统计 */}
      <div style={{
        padding: '4px 20px', fontSize: 11, color: 'var(--text-faint)',
        fontFamily: 'var(--font-num)', display: 'flex', justifyContent: 'space-between',
        borderTop: '1px solid var(--border-light)',
      }}>
        <span>{note ? extractTags(note.content).length + ' 标签' : ''}</span>
        <span>{note ? new Date(note.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
      </div>

      {/* 格式快捷栏 — 点击展开 */}
      {editor && showFormatBar && <FormatBar editor={editor} />}
      <button
        onClick={() => setShowFormatBar(v => !v)}
        style={{
          width: '100%', padding: '6px 0', border: 'none',
          background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-light)',
          color: 'var(--text-faint)', fontSize: 11, cursor: 'pointer',
          fontFamily: 'var(--font-sans)', flexShrink: 0,
        }}
      >
        {showFormatBar ? '▾ 收起格式' : '▸ 格式'}
      </button>

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
