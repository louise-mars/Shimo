import { useEffect, useCallback, useState, useRef } from 'react'
import { StoreProvider, useStore } from './store'
import LeftSidebar from './components/LeftSidebar'
import NoteList from './components/NoteList'
import NoteEditor from './components/NoteEditor'
import TagGraph from './components/TagGraph'
import ShortcutsPanel from './components/ShortcutsPanel'
import ImportWizard from './components/ImportWizard'
import WeeklyReport from './components/WeeklyReport'
import DailyReview from './components/DailyReview'
import AskAI from './components/AskAI'
import SettingsPanel from './components/SettingsPanel'
import TemplatePicker from './components/TemplatePicker'
import AppLock, { isLockEnabled, hasPinSet } from './components/AppLock'
import ErrorBoundary from './components/ErrorBoundary'
import { useSync } from './lib/useSync'
import { initSentry } from './lib/sentry'
import './styles/theme.css'
import './styles/desktop.css'

// Initialize Sentry for error tracking
initSentry()

function Layout() {
  const { state, dispatch } = useStore()
  const [showGraph, setShowGraph] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showDailyReview, setShowDailyReview] = useState(false)
  const [showAskAI, setShowAskAI] = useState(false)
  const [reviewReminder, setReviewReminder] = useState('')

  const onMerge = useCallback((notes: any[]) => {
    dispatch({ type: 'MERGE_SYNC', notes })
  }, [dispatch])

  const { user, syncStatus, syncError, isConfigured, signOut, triggerSync } = useSync(
    state.notes, [], (notes) => onMerge(notes)
  )

  // 快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 'n') {
        e.preventDefault()
        dispatch({ type: 'CREATE_NOTE' })
      }
      if (mod && e.key === 'd') {
        e.preventDefault()
        dispatch({ type: 'TOGGLE_THEME' })
      }
      if (e.key === '?' || (mod && e.key === '/')) {
        // Don't trigger when typing in editor or input
        const tag = (e.target as HTMLElement)?.tagName
        const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.closest('.tiptap')
        if (isEditing && !mod) return
        e.preventDefault()
        setShowShortcuts(true)
      }
      if (mod && e.key === 't') {
        e.preventDefault()
        setShowTemplates(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dispatch])

  // 桌面版今日回顾提醒（每天 21:00 检查一次）
  useEffect(() => {
    const check = () => {
      const now = new Date()
      if (now.getHours() >= 21) {
        const todayKey = `shimo-desktop-review-${now.toDateString()}`
        if (!sessionStorage.getItem(todayKey)) {
          const todayNotes = state.notes.filter(n => {
            if (n.deletedAt) return false
            const d = new Date(n.updatedAt)
            return d.toDateString() === now.toDateString()
          })
          if (todayNotes.length > 0) {
            setReviewReminder(`今天记录了 ${todayNotes.length} 条笔记，回顾一下？`)
            sessionStorage.setItem(todayKey, '1')
          }
        }
      }
    }
    check()
    const timer = setInterval(check, 60000) // 每分钟检查
    return () => clearInterval(timer)
  }, [state.notes])

  const [listWidth, setListWidth] = useState(260)
  const isDragging = useRef(false)

  const handleDragStart = useCallback(() => {
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const handleMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const sidebarWidth = 220
      const newWidth = Math.max(200, Math.min(400, e.clientX - sidebarWidth))
      setListWidth(newWidth)
    }
    const handleUp = () => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [])

  return (
    <div className="desktop-app">
      <LeftSidebar
        user={user}
        syncStatus={syncStatus}
        syncError={syncError}
        isConfigured={isConfigured}
        onSignOut={signOut}
        onSync={triggerSync}
        onShowGraph={() => setShowGraph(true)}
        onImport={() => setShowImport(true)}
        onShowReport={() => setShowReport(true)}
        onShowSettings={() => setShowSettings(true)}
        onShowDailyReview={() => setShowDailyReview(true)}
        onShowAskAI={() => setShowAskAI(true)}
      />
      <NoteList width={listWidth} />
      {/* 拖拽调整宽度 */}
      <div
        onMouseDown={handleDragStart}
        style={{
          width: 4, cursor: 'col-resize', flexShrink: 0,
          background: 'transparent', position: 'relative', zIndex: 10,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-light)')}
        onMouseLeave={e => { if (!isDragging.current) e.currentTarget.style.background = 'transparent' }}
      />
      <NoteEditor />
      {showGraph && <TagGraph onClose={() => setShowGraph(false)} />}
      {showShortcuts && <ShortcutsPanel onClose={() => setShowShortcuts(false)} />}
      {showImport && <ImportWizard onClose={() => setShowImport(false)} />}
      {showReport && <WeeklyReport onClose={() => setShowReport(false)} />}
      {showSettings && <SettingsPanel
        onClose={() => setShowSettings(false)}
        user={user}
        syncStatus={syncStatus}
        syncError={syncError}
        onSync={triggerSync}
        onSignOut={signOut}
      />}
      {showTemplates && <TemplatePicker onClose={() => setShowTemplates(false)} />}
      {showDailyReview && <DailyReview onClose={() => setShowDailyReview(false)} />}
      {showAskAI && <AskAI onClose={() => setShowAskAI(false)} />}

      {/* 今日回顾提醒 */}
      {reviewReminder && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 900,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
          borderRadius: 12, padding: '14px 18px', boxShadow: 'var(--shadow-lg)',
          display: 'flex', alignItems: 'center', gap: 12, maxWidth: 320,
          animation: 'fadeIn 300ms ease-out',
        }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', flex: 1 }}>
            {reviewReminder}
          </span>
          <button onClick={() => { setShowDailyReview(true); setReviewReminder('') }} style={{
            padding: '6px 12px', background: 'var(--accent)', color: 'white',
            border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer',
            fontFamily: 'var(--font-sans)', flexShrink: 0,
          }}>查看</button>
          <button onClick={() => setReviewReminder('')} style={{
            border: 'none', background: 'none', color: 'var(--text-faint)',
            fontSize: 16, cursor: 'pointer',
          }}>✕</button>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [locked, setLocked] = useState(() => isLockEnabled() && hasPinSet())

  const handleUnlock = () => setLocked(false)

  return (
    <ErrorBoundary>
      {locked ? (
        <AppLock onUnlock={handleUnlock} />
      ) : (
        <StoreProvider>
          <Layout />
        </StoreProvider>
      )}
    </ErrorBoundary>
  )
}
