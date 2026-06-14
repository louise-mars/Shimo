import { useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import { FontFamily } from '@tiptap/extension-font-family'
import { Link } from '@tiptap/extension-link'
import { Underline } from '@tiptap/extension-underline'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { useStore } from '../store'
import { findRelatedNotes, getNudgeText } from '../lib/relations'
import { extractTags, wordCount } from '@notepro/shared'
import { noteToMarkdown } from '@notepro/shared'
import { exportAsPDF } from '../lib/exportData'
import { downloadStyledHTML } from '../lib/exportStyled'
import { maybeSnapshot } from '@notepro/shared'
import { computeDebounceMs, SmartSerializer } from '@notepro/shared'
import { createImageStore, compressImage, shouldCompress } from '@notepro/shared'
import type { IImageStore, TipTapDocument } from '@notepro/shared'
import FallingPetals from './FallingPetals'
import TagSuggestion from './TagSuggestion'
import ConfirmDialog from './ConfirmDialog'
import SlashMenu from './SlashMenu'
import FloatingToolbar from './FloatingToolbar'
import VoiceInput from './VoiceInput'
import NoteHistory from './NoteHistory'
import WikiLinkHighlight from './Editor/WikiLink'
import BacklinksPanel from './Editor/BacklinksPanel'
import WikiLinkSuggestion from './Editor/WikiLinkSuggestion'
import NoteEmbedExtension from './Editor/NoteEmbed'
import NoteEmbedSuggestion from './Editor/NoteEmbedSuggestion'
import TableControls from './Editor/TableControls'
import { verifyPin, setPinHash, hasPinConfigured, clearPin, getAttempts, recordFailedAttempt, resetAttempts } from '../lib/pinSecurity'

// #标签 高亮 (optimized: only recompute when doc changes)
const TagHighlight = Extension.create({
  name: 'tagHighlight',
  addProseMirrorPlugins() {
    const key = new PluginKey('tagHighlight')
    return [new Plugin({
      key,
      state: {
        init(_, state) { return buildTagDecos(state) },
        apply(tr, oldDecos, _oldState, newState) {
          // Only recompute if document changed
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

// TextAlign extension (left/center/right)
const TextAlign = Extension.create({
  name: 'textAlign',
  addOptions() { return { types: ['heading', 'paragraph'] } },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        textAlign: {
          default: 'left',
          parseHTML: element => element.style.textAlign || 'left',
          renderHTML: attributes => {
            if (attributes.textAlign === 'left') return {}
            return { style: `text-align: ${attributes.textAlign}` }
          },
        },
      },
    }]
  },
  addCommands() {
    return {
      setTextAlign: (alignment: string) => ({ commands }: { commands: any }) => {
        return this.options.types.every((type: string) =>
          commands.updateAttributes(type, { textAlign: alignment })
        )
      },
    } as any
  },
})

// FontSize extension via TextStyle mark
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] } },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: element => element.style.fontSize?.replace(/['"]+/g, '') || null,
          renderHTML: attributes => {
            if (!attributes.fontSize) return {}
            return { style: `font-size: ${attributes.fontSize}` }
          },
        },
      },
    }]
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }) => {
        return chain().setMark('textStyle', { fontSize: size }).run()
      },
      unsetFontSize: () => ({ chain }) => {
        return chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
      },
    }
  },
})

export default function NoteEditor() {
  const { state, dispatch } = useStore()
  const note = state.notes.find(n => n.id === state.activeNoteId)
  const titleRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const smartSerializer = useRef(new SmartSerializer())
  const imageStoreRef = useRef<IImageStore | null>(null)
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
  const [deletedNoteId, setDeletedNoteId] = useState<string | null>(null)
  const [slashOpen, setSlashOpen] = useState(false)
  const [immersive, setImmersive] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [wikiLinkOpen, setWikiLinkOpen] = useState(false)
  const [embedSuggestionOpen, setEmbedSuggestionOpen] = useState(false)
  const [linkInputOpen, setLinkInputOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [imgResizeTarget, setImgResizeTarget] = useState<HTMLImageElement | null>(null)
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
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      TextAlign,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'editor-link' } }),
      Underline,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TagHighlight,
      WikiLinkHighlight.configure({
        onNavigate: (title: string) => {
          // Find note by title and navigate to it
          const target = notesRef.current.find(n => !n.deletedAt && n.title.toLowerCase() === title.toLowerCase())
          if (target) {
            dispatch({ type: 'SET_ACTIVE_NOTE', noteId: target.id })
          }
        },
      }),
      NoteEmbedExtension,
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
        // Detect [[ for wiki link suggestion
        if (from >= 2) {
          const lastTwo = ed.state.doc.textBetween(Math.max(0, from - 2), from)
          if (lastTwo === '[[' && !wikiLinkOpen) setWikiLinkOpen(true)
        }
        // Close wiki link if ]] typed
        if (wikiLinkOpen && from >= 2) {
          const lastTwo = ed.state.doc.textBetween(Math.max(0, from - 2), from)
          if (lastTwo === ']]') setWikiLinkOpen(false)
        }
        // Detect ![[ for note embed suggestion
        if (from >= 3) {
          const lastThree = ed.state.doc.textBetween(Math.max(0, from - 3), from)
          if (lastThree === '![[' && !embedSuggestionOpen) setEmbedSuggestionOpen(true)
        }
        // Close embed suggestion if ]] typed
        if (embedSuggestionOpen && from >= 2) {
          const lastTwo = ed.state.doc.textBetween(Math.max(0, from - 2), from)
          if (lastTwo === ']]') setEmbedSuggestionOpen(false)
        }
      } catch { /* ignore */ }
      setSaveStatus('saving')
      // Reset immersive timer on typing
      if (immersiveTimer.current) clearTimeout(immersiveTimer.current)
      setImmersive(false)
      immersiveTimer.current = setTimeout(() => setImmersive(true), 15000)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      // Adaptive debounce using shared computeDebounceMs
      const doc = ed.getJSON() as TipTapDocument
      const serializer = smartSerializer.current
      const result = serializer.serializeDocument(doc)
      const debounce = computeDebounceMs(result.json)
      saveTimer.current = setTimeout(() => {
        const content = result.json
        const tags = extractTags(content)
        dispatch({ type: 'UPDATE_NOTE', noteId: note.id, updates: { content, tags } })
        updateRelated(note.id)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
        // Auto-snapshot (runs in background, non-blocking)
        const textLen = ed.getText().length
        maybeSnapshot(note.id, note.title, content, textLen).catch(() => {})
      }, debounce)
    },
  })

  // 切换笔记时更新内容
  useEffect(() => {
    if (!editor) return
    if (!note) { editor.commands.clearContent(); return }
    // Reset serializer cache when switching notes
    smartSerializer.current.reset()
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
      // Ctrl+K: 插入/编辑链接
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && editor) {
        e.preventDefault()
        setLinkInputOpen(true)
        setLinkUrl(editor.getAttributes('link').href || 'https://')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [note, dispatch])

  // Listen for AI text insertion events
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<string>).detail
      if (editor && text) {
        editor.chain().focus().insertContent(text).run()
      }
    }
    window.addEventListener('shimo-insert-text', handler)
    return () => window.removeEventListener('shimo-insert-text', handler)
  }, [editor])

  // Immersive mode: reset timer on any mouse movement (15s idle → immersive)
  useEffect(() => {
    const handleMouseMove = () => {
      if (immersiveTimer.current) clearTimeout(immersiveTimer.current)
      if (immersive) setImmersive(false)
      immersiveTimer.current = setTimeout(() => setImmersive(true), 15000)
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [immersive])

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
        animation: 'fadeIn 400ms ease-out',
      }}>
        {/* Ink wash mountain SVG illustration */}
        <svg width="200" height="120" viewBox="0 0 200 120" fill="none" style={{ opacity: 0.12 }}>
          {/* Mountains */}
          <path d="M0 120 L30 60 L55 85 L80 40 L105 70 L130 30 L155 65 L180 45 L200 80 L200 120 Z" fill="currentColor" opacity="0.3" />
          <path d="M0 120 L20 80 L50 95 L75 70 L100 90 L130 55 L160 85 L200 65 L200 120 Z" fill="currentColor" opacity="0.5" />
          <path d="M0 120 L40 100 L70 105 L100 95 L140 100 L170 95 L200 105 L200 120 Z" fill="currentColor" opacity="0.7" />
          {/* Moon */}
          <circle cx="155" cy="25" r="12" fill="currentColor" opacity="0.15" />
          {/* Birds */}
          <path d="M60 20 Q65 15 70 20" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.3" />
          <path d="M75 15 Q80 10 85 15" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.25" />
          <path d="M50 28 Q54 24 58 28" stroke="currentColor" strokeWidth="0.8" fill="none" opacity="0.2" />
        </svg>
        <div style={{
          fontSize: 20, opacity: 0.15,
          fontFamily: 'var(--font-serif)',
          letterSpacing: 8,
        }}>
          拾墨
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
        <div style={{
          display: 'flex', gap: 12,
          fontSize: 11, color: 'var(--text-faint)',
          fontFamily: 'var(--font-num)',
        }}>
          <span><kbd style={{ padding: '1px 5px', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 4, fontSize: 10 }}>Ctrl+N</kbd> 新建</span>
          <span><kbd style={{ padding: '1px 5px', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 4, fontSize: 10 }}>Ctrl+K</kbd> 命令</span>
        </div>
      </div>
    )
  }

  // 加密笔记需要输入 PIN 才能查看
  if (needsUnlock) {
    const hasPin = hasPinConfigured()
    const { lockedUntil } = getAttempts()
    const isLocked = lockedUntil > Date.now()

    const handleUnlock = async () => {
      // 重新检查锁定状态（避免闭包中的 isLocked 过期）
      const currentAttempts = getAttempts()
      if (currentAttempts.lockedUntil > Date.now()) return
      if (!pinInput || pinInput.length < 4) return
      
      try {
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
      } catch (err) {
        console.error('PIN verification failed:', err)
        setPinError(true)
        setPinInput('')
      }
    }

    const handleSetPinAndUnlock = async (newPin: string) => {
      if (!newPin || newPin.length < 4) return
      try {
        await setPinHash(newPin)
        setLockedNoteId(note.id)
        setPinInput('')
        setPinError(false)
      } catch (err) {
        console.error('Failed to set PIN:', err)
        setPinError(true)
      }
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
              width: 34, height: 34, border: 'none', borderRadius: 7,
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
              width: 34, height: 34, border: 'none', borderRadius: 7,
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
              width: 34, height: 34, border: 'none', borderRadius: 7,
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
              const newLocked = !note.locked
              dispatch({ type: 'UPDATE_NOTE', noteId: note.id, updates: { locked: newLocked } })
              // 如果重新加密，清除已解锁状态，下次打开需要重新输入 PIN
              if (newLocked && lockedNoteId === note.id) {
                setLockedNoteId(null)
              }
            }}
            title={note.locked ? '取消加密' : '加密笔记'}
            style={{
              width: 34, height: 34, border: 'none', borderRadius: 7,
              background: 'transparent',
              color: note.locked ? 'var(--accent)' : 'var(--text-faint)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
              width: 34, height: 34, border: 'none', borderRadius: 7,
              background: 'transparent',
              color: note.hidden ? 'var(--accent)' : 'var(--text-faint)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
              width: 34, height: 34, border: 'none', borderRadius: 7,
              background: 'transparent', color: 'var(--text-faint)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          {/* 版本历史 */}
          <button
            onClick={() => setShowHistory(true)}
            title="版本历史"
            aria-label="版本历史"
            style={{
              width: 34, height: 34, border: 'none', borderRadius: 7,
              background: 'transparent', color: 'var(--text-faint)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
          {/* 导出 PDF */}
          <button
            onClick={() => exportAsPDF(note)}
            title="导出 PDF"
            aria-label="导出 PDF"
            style={{
              width: 34, height: 34, border: 'none', borderRadius: 7,
              background: 'transparent', color: 'var(--text-faint)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </button>
          {/* 导出精美 HTML */}
          <button
            onClick={() => downloadStyledHTML(note)}
            title="导出精美 HTML"
            aria-label="导出精美 HTML"
            style={{
              width: 34, height: 34, border: 'none', borderRadius: 7,
              background: 'transparent', color: 'var(--text-faint)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          {/* 分享 */}
          <button
            onClick={() => {
              const text = noteToMarkdown(note)
              const title = note.title || '拾墨笔记'
              if (navigator.share) {
                navigator.share({ title, text }).catch(() => {})
              } else {
                navigator.clipboard.writeText(text).then(() => setSaveStatus('saved')).catch(() => {})
              }
            }}
            title="分享笔记"
            aria-label="分享笔记"
            style={{
              width: 34, height: 34, border: 'none', borderRadius: 7,
              background: 'transparent', color: 'var(--text-faint)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>
          {/* 删除 */}
          <button
            onClick={deleteNote}
            title="删除笔记"
            aria-label="删除笔记"
            style={{
              width: 34, height: 34, border: 'none', borderRadius: 7,
              background: 'transparent', color: 'var(--text-faint)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', marginLeft: 4,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--error-bg)'; e.currentTarget.style.color = 'var(--danger)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-faint)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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

      {/* 格式工具栏 */}
      {editor && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 1,
          padding: '4px 20px', borderBottom: '1px solid var(--border-light)',
          flexShrink: 0, flexWrap: 'wrap',
        }}>
          {/* 撤销/重做 */}
          <button onClick={() => editor.chain().focus().undo().run()} title="撤销 (Ctrl+Z)"
            disabled={!editor.can().undo()}
            style={{
              width: 32, height: 30, border: 'none', borderRadius: 5,
              background: 'transparent', color: editor.can().undo() ? 'var(--text-secondary)' : 'var(--text-faint)',
              cursor: editor.can().undo() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, opacity: editor.can().undo() ? 1 : 0.3, transition: 'all 0.1s',
            }}>↩</button>
          <button onClick={() => editor.chain().focus().redo().run()} title="重做 (Ctrl+Shift+Z)"
            disabled={!editor.can().redo()}
            style={{
              width: 32, height: 30, border: 'none', borderRadius: 5,
              background: 'transparent', color: editor.can().redo() ? 'var(--text-secondary)' : 'var(--text-faint)',
              cursor: editor.can().redo() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, opacity: editor.can().redo() ? 1 : 0.3, transition: 'all 0.1s',
            }}>↪</button>

          <div style={{ width: 1, height: 18, background: 'var(--border-light)', margin: '0 6px', flexShrink: 0 }} />

          {/* 文字格式 */}
          {[
            { label: 'B', title: '加粗 (Ctrl+B)', action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold'), style: { fontWeight: 700 } },
            { label: 'I', title: '斜体 (Ctrl+I)', action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic'), style: { fontStyle: 'italic' } },
            { label: 'U', title: '下划线 (Ctrl+U)', action: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive('underline'), style: { textDecoration: 'underline' } },
            { label: 'S', title: '删除线', action: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive('strike'), style: { textDecoration: 'line-through' } },
            { label: '🔗', title: '插入链接 (Ctrl+K)', action: () => {
              setLinkInputOpen(true)
              setLinkUrl(editor.getAttributes('link').href || 'https://')
            }, active: editor.isActive('link'), style: { fontSize: 12 } },
            { label: 'T', title: '清除格式（纯文本）', action: () => editor.chain().focus().clearNodes().unsetAllMarks().run(), active: false, style: { color: 'var(--text-faint)' } },
          ].map((btn, i) => (
            <button key={i} onClick={btn.action} title={btn.title} style={{
              width: 32, height: 30, border: 'none', borderRadius: 5,
              background: btn.active ? 'var(--accent-bg)' : 'transparent',
              color: btn.active ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontFamily: 'var(--font-serif)', transition: 'all 0.1s',
              ...btn.style,
            }}>{btn.label}</button>
          ))}

          <div style={{ width: 1, height: 18, background: 'var(--border-light)', margin: '0 6px', flexShrink: 0 }} />

          {/* 标题 */}
          {[
            { label: 'H1', level: 1 },
            { label: 'H2', level: 2 },
            { label: 'H3', level: 3 },
          ].map(h => (
            <button key={h.level} onClick={() => editor.chain().focus().toggleHeading({ level: h.level as 1|2|3 }).run()}
              title={`标题 ${h.level}`}
              style={{
                width: 32, height: 30, border: 'none', borderRadius: 5,
                background: editor.isActive('heading', { level: h.level }) ? 'var(--accent-bg)' : 'transparent',
                color: editor.isActive('heading', { level: h.level }) ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-num)', transition: 'all 0.1s',
              }}>{h.label}</button>
          ))}

          <div style={{ width: 1, height: 18, background: 'var(--border-light)', margin: '0 6px', flexShrink: 0 }} />

          {/* 列表 */}
          {[
            { label: '•', title: '无序列表', action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive('bulletList') },
            { label: '1.', title: '有序列表', action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive('orderedList') },
            { label: '☑', title: '任务列表', action: () => editor.chain().focus().toggleTaskList().run(), active: editor.isActive('taskList') },
            { label: '→', title: '增加缩进 (Tab)', action: () => editor.chain().focus().sinkListItem('listItem').run(), active: false },
            { label: '←', title: '减少缩进 (Shift+Tab)', action: () => editor.chain().focus().liftListItem('listItem').run(), active: false },
          ].map((btn, i) => (
            <button key={i} onClick={btn.action} title={btn.title} style={{
              width: 32, height: 30, border: 'none', borderRadius: 5,
              background: btn.active ? 'var(--accent-bg)' : 'transparent',
              color: btn.active ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, transition: 'all 0.1s',
            }}>{btn.label}</button>
          ))}

          <div style={{ width: 1, height: 18, background: 'var(--border-light)', margin: '0 6px', flexShrink: 0 }} />

          {/* 块级 */}
          {[
            { label: '❝', title: '引用', action: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive('blockquote') },
            { label: '⟨⟩', title: '代码块', action: () => editor.chain().focus().toggleCodeBlock().run(), active: editor.isActive('codeBlock') },
            { label: '—', title: '分割线', action: () => editor.chain().focus().setHorizontalRule().run(), active: false },
          ].map((btn, i) => (
            <button key={i} onClick={btn.action} title={btn.title} style={{
              width: 32, height: 30, border: 'none', borderRadius: 5,
              background: btn.active ? 'var(--accent-bg)' : 'transparent',
              color: btn.active ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, transition: 'all 0.1s',
            }}>{btn.label}</button>
          ))}

          <div style={{ width: 1, height: 18, background: 'var(--border-light)', margin: '0 6px', flexShrink: 0 }} />

          {/* 高亮 */}
          <button onClick={() => editor.chain().focus().toggleHighlight().run()}
            title="高亮"
            style={{
              width: 32, height: 30, border: 'none', borderRadius: 5,
              background: editor.isActive('highlight') ? 'rgba(200, 168, 75, 0.2)' : 'transparent',
              color: editor.isActive('highlight') ? 'var(--warning)' : 'var(--text-secondary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, transition: 'all 0.1s',
            }}>✦</button>

          {/* 行内代码 */}
          <button onClick={() => editor.chain().focus().toggleCode().run()}
            title="行内代码 (Ctrl+E)"
            style={{
              width: 32, height: 30, border: 'none', borderRadius: 5,
              background: editor.isActive('code') ? 'var(--accent-bg)' : 'transparent',
              color: editor.isActive('code') ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontFamily: 'monospace', transition: 'all 0.1s',
            }}>{`<>`}</button>

          <div style={{ width: 1, height: 18, background: 'var(--border-light)', margin: '0 6px', flexShrink: 0 }} />

          {/* 对齐 */}
          {[
            { label: '≡', title: '左对齐', align: 'left' },
            { label: '≡', title: '居中', align: 'center' },
            { label: '≡', title: '右对齐', align: 'right' },
          ].map(a => (
            <button key={a.align} onClick={() => (editor.commands as any).setTextAlign(a.align)}
              title={a.title}
              style={{
                width: 28, height: 30, border: 'none', borderRadius: 5,
                background: editor.getAttributes('paragraph').textAlign === a.align || editor.getAttributes('heading').textAlign === a.align ? 'var(--accent-bg)' : 'transparent',
                color: editor.getAttributes('paragraph').textAlign === a.align || editor.getAttributes('heading').textAlign === a.align ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, transition: 'all 0.1s',
                textAlign: a.align as any,
              }}>{a.align === 'left' ? '⫷' : a.align === 'center' ? '⫿' : '⫸'}</button>
          ))}

          <div style={{ width: 1, height: 18, background: 'var(--border-light)', margin: '0 6px', flexShrink: 0 }} />

          {/* 插入表格 */}
          <button onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            title="插入表格"
            style={{
              width: 32, height: 30, border: 'none', borderRadius: 5,
              background: editor.isActive('table') ? 'var(--accent-bg)' : 'transparent',
              color: editor.isActive('table') ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, transition: 'all 0.1s',
            }}>▦</button>

          {/* 插入图片 */}
          <button onClick={() => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = 'image/*'
            input.onchange = async () => {
              const file = input.files?.[0]
              if (!file) return
              const store = imageStoreRef.current || (imageStoreRef.current = createImageStore())
              let blob: Blob = file
              if (shouldCompress(blob)) {
                blob = await compressImage(blob)
              }
              const ext = file.name.split('.').pop() || 'png'
              const assetUri = await store.save(blob, ext)
              if (note) await store.addRef(assetUri, note.id)
              editor.chain().focus().setImage({ src: assetUri }).run()
            }
            input.click()
          }}
            title="插入图片"
            style={{
              width: 32, height: 30, border: 'none', borderRadius: 5,
              background: 'transparent', color: 'var(--text-secondary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, transition: 'all 0.1s',
            }}>🖼</button>

          {/* 语音输入 */}
          <VoiceInput
            onText={(text) => {
              if (editor) editor.chain().focus().insertContent(text).run()
            }}
          />

          <div style={{ width: 1, height: 18, background: 'var(--border-light)', margin: '0 6px', flexShrink: 0 }} />

          {/* 文字颜色 */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <label title="文字颜色" style={{
              width: 32, height: 30, borderRadius: 5, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', transition: 'all 0.1s',
              fontSize: 14, color: 'var(--text-secondary)',
            }}>
              A
              <input
                type="color"
                value={editor.getAttributes('textStyle').color || '#1A1208'}
                onChange={e => editor.chain().focus().setColor(e.target.value).run()}
                style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden' }}
              />
              <span style={{
                position: 'absolute', bottom: 3, left: 8, right: 8, height: 3,
                borderRadius: 1,
                background: editor.getAttributes('textStyle').color || 'var(--text-primary)',
              }} />
            </label>
          </div>

          {/* 字体/大小选择 */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <select
              value={editor.getAttributes('textStyle').fontSize || ''}
              onChange={e => {
                const v = e.target.value
                if (v) (editor.commands as any).setFontSize(v)
                else (editor.commands as any).unsetFontSize()
              }}
              title="字号"
              style={{
                padding: '4px 8px', fontSize: 11, border: '1px solid var(--border-light)',
                borderRadius: 5, background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                fontFamily: 'var(--font-num)', cursor: 'pointer', outline: 'none',
                width: 60,
              }}
            >
              <option value="">默认</option>
              <option value="12px">12</option>
              <option value="14px">14</option>
              <option value="16px">16</option>
              <option value="18px">18</option>
              <option value="20px">20</option>
              <option value="24px">24</option>
              <option value="28px">28</option>
              <option value="32px">32</option>
            </select>

            <select
              value={editor.getAttributes('textStyle').fontFamily || ''}
              onChange={e => {
                const v = e.target.value
                if (v) editor.chain().focus().setFontFamily(v).run()
                else editor.chain().focus().unsetFontFamily().run()
              }}
              title="字体"
              style={{
                padding: '4px 8px', fontSize: 11, border: '1px solid var(--border-light)',
                borderRadius: 5, background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                fontFamily: 'var(--font-sans)', cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="">默认字体</option>
              <option value="Noto Serif SC" style={{ fontFamily: 'Noto Serif SC' }}>宋体</option>
              <option value="Noto Sans SC" style={{ fontFamily: 'Noto Sans SC' }}>黑体</option>
              <option value="Inter" style={{ fontFamily: 'Inter' }}>Inter</option>
              <option value="JetBrains Mono" style={{ fontFamily: 'JetBrains Mono' }}>等宽</option>
            </select>

            <select
              value={
                editor.isActive('heading', { level: 1 }) ? 'h1' :
                editor.isActive('heading', { level: 2 }) ? 'h2' :
                editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'
              }
              onChange={e => {
                const v = e.target.value
                if (v === 'p') editor.chain().focus().setParagraph().run()
                else editor.chain().focus().toggleHeading({ level: parseInt(v[1]) as 1|2|3 }).run()
              }}
              title="段落样式"
              style={{
                padding: '4px 8px', fontSize: 11, border: '1px solid var(--border-light)',
                borderRadius: 5, background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                fontFamily: 'var(--font-num)', cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="p">正文</option>
              <option value="h1">大标题</option>
              <option value="h2">中标题</option>
              <option value="h3">小标题</option>
            </select>
          </div>
        </div>
      )}

      {/* 链接输入框 */}
      {linkInputOpen && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 20px', borderBottom: '1px solid var(--border-light)',
          background: 'var(--bg-elevated)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-faint)', flexShrink: 0 }}>🔗</span>
          <input
            autoFocus
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (linkUrl.trim()) editor?.chain().focus().setLink({ href: linkUrl.trim() }).run()
                setLinkInputOpen(false)
                setLinkUrl('')
              }
              if (e.key === 'Escape') { setLinkInputOpen(false); setLinkUrl('') }
            }}
            placeholder="输入链接地址，回车确认"
            style={{
              flex: 1, padding: '6px 10px', fontSize: 13,
              border: '1px solid var(--border-medium)', borderRadius: 6,
              background: 'var(--bg-primary)', color: 'var(--text-primary)',
              outline: 'none', fontFamily: 'var(--font-num)',
            }}
          />
          <button onClick={() => {
            if (linkUrl.trim()) editor?.chain().focus().setLink({ href: linkUrl.trim() }).run()
            setLinkInputOpen(false); setLinkUrl('')
          }} style={{
            padding: '5px 12px', fontSize: 12, border: 'none', borderRadius: 5,
            background: 'var(--accent)', color: 'white', cursor: 'pointer',
          }}>确定</button>
          {editor?.isActive('link') && (
            <button onClick={() => {
              editor?.chain().focus().unsetLink().run()
              setLinkInputOpen(false); setLinkUrl('')
            }} style={{
              padding: '5px 12px', fontSize: 12, border: '1px solid var(--border-light)', borderRadius: 5,
              background: 'none', color: 'var(--danger)', cursor: 'pointer',
            }}>移除</button>
          )}
          <button onClick={() => { setLinkInputOpen(false); setLinkUrl('') }} style={{
            border: 'none', background: 'none', color: 'var(--text-faint)', fontSize: 14, cursor: 'pointer',
          }}>✕</button>
        </div>
      )}

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
        onClick={e => {
          const img = (e.target as HTMLElement).closest('img') as HTMLImageElement | null
          if (img) { setImgResizeTarget(img); e.stopPropagation() }
          else setImgResizeTarget(null)
        }}
        onDrop={e => {
          if (!editor) return
          const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
          if (!files.length) return
          e.preventDefault()
          const store = imageStoreRef.current || (imageStoreRef.current = createImageStore())
          files.forEach(async f => {
            let blob: Blob = f
            if (shouldCompress(blob)) {
              blob = await compressImage(blob)
            }
            const ext = f.name.split('.').pop() || 'png'
            const assetUri = await store.save(blob, ext)
            if (note) await store.addRef(assetUri, note.id)
            editor.chain().focus().setImage({ src: assetUri }).run()
          })
        }}
        onDragOver={e => e.preventDefault()}
        onPaste={e => {
          if (!editor) return
          const items = Array.from(e.clipboardData.items).filter(i => i.type.startsWith('image/'))
          if (!items.length) return
          e.preventDefault()
          const store = imageStoreRef.current || (imageStoreRef.current = createImageStore())
          items.forEach(i => {
            const f = i.getAsFile()
            if (!f) return
            ;(async () => {
              let blob: Blob = f
              if (shouldCompress(blob)) {
                blob = await compressImage(blob)
              }
              const ext = f.type.split('/')[1] || 'png'
              const assetUri = await store.save(blob, ext)
              if (note) await store.addRef(assetUri, note.id)
              editor.chain().focus().setImage({ src: assetUri }).run()
            })()
          })
        }}
      >
        <EditorContent editor={editor} className="editor-content" />

        {/* 浮动格式栏 — 选中文字时出现 */}
        {editor && <FloatingToolbar editor={editor} onLinkClick={() => { setLinkInputOpen(true); setLinkUrl(editor.getAttributes('link').href || 'https://') }} />}

        {/* 表格控制栏 — 光标在表格中时出现 */}
        {editor && <TableControls editor={editor} />}

        {/* 图片尺寸选择 */}
        {imgResizeTarget && (
          <div style={{
            position: 'absolute',
            top: imgResizeTarget.offsetTop + imgResizeTarget.offsetHeight + 4,
            left: imgResizeTarget.offsetLeft,
            zIndex: 50,
            display: 'flex', gap: 4, padding: '6px 8px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
            borderRadius: 8, boxShadow: 'var(--shadow-md)',
          }}>
            {[
              { label: '小', cls: 'img-small', width: '200px' },
              { label: '中', cls: 'img-medium', width: '400px' },
              { label: '大', cls: 'img-full', width: '100%' },
            ].map(s => (
              <button key={s.label} onClick={() => {
                imgResizeTarget.className = s.cls
                imgResizeTarget.style.maxWidth = s.width
                setImgResizeTarget(null)
              }} style={{
                padding: '4px 12px', fontSize: 12, border: '1px solid var(--border-light)',
                borderRadius: 5, background: 'var(--bg-primary)', color: 'var(--text-secondary)',
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}>{s.label}</button>
            ))}
            <button onClick={() => setImgResizeTarget(null)} style={{
              padding: '4px 8px', fontSize: 12, border: 'none',
              background: 'none', color: 'var(--text-faint)', cursor: 'pointer',
            }}>✕</button>
          </div>
        )}

        {/* Slash 命令菜单 */}
        {slashOpen && editor && (
          <SlashMenu editor={editor} onClose={() => setSlashOpen(false)} />
        )}

        {/* WikiLink 建议 */}
        {wikiLinkOpen && editor && (
          <WikiLinkSuggestion editor={editor} onClose={() => setWikiLinkOpen(false)} />
        )}

        {/* Note Embed 建议 */}
        {embedSuggestionOpen && editor && (
          <NoteEmbedSuggestion editor={editor} onClose={() => setEmbedSuggestionOpen(false)} />
        )}
      </div>

      {/* Backlinks — 引用当前笔记的其他笔记 */}
      {note.title && (
        <BacklinksPanel noteId={note.id} noteTitle={note.title} />
      )}

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
            const id = note.id
            dispatch({ type: 'DELETE_NOTE', noteId: id })
            setConfirmDelete(false)
            setDeletedNoteId(id)
            setTimeout(() => setDeletedNoteId(null), 5000)
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {/* 撤销删除 toast */}
      {deletedNoteId && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 16px', background: 'var(--ink)', color: 'var(--bg-primary)',
          borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-sans)',
          display: 'flex', alignItems: 'center', gap: 12, zIndex: 500,
          boxShadow: 'var(--shadow-lg)', animation: 'fadeIn 150ms ease-out',
        }}>
          <span>已删除</span>
          <button onClick={() => { dispatch({ type: 'RESTORE_NOTE', noteId: deletedNoteId }); setDeletedNoteId(null) }} style={{
            border: 'none', background: 'var(--accent)', color: 'white',
            padding: '4px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
          }}>撤销</button>
        </div>
      )}

      {/* 版本历史面板 */}
      {showHistory && note && (
        <NoteHistory
          note={note}
          onRestore={(content) => {
            dispatch({ type: 'UPDATE_NOTE', noteId: note.id, updates: { content } })
            if (editor) {
              try { editor.commands.setContent(JSON.parse(content)) } catch { /* ignore */ }
            }
          }}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  )
}

