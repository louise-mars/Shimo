import { useEffect, useCallback, useState, useRef, lazy, Suspense } from 'react'
import { StoreProvider, useStore } from './store'
import LeftSidebar from './components/LeftSidebar'
import NoteList from './components/NoteList'
const NoteEditor = lazy(() => import('./components/NoteEditor'))
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
import WelcomeTip, { shouldShowTip } from './components/WelcomeTip'
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [listCollapsed, setListCollapsed] = useState(false)
  const [showWelcomeTip, setShowWelcomeTip] = useState(shouldShowTip)

  const onMerge = useCallback((notes: any[]) => {
    dispatch({ type: 'MERGE_SYNC', notes, folders: [], editingNoteId: state.activeNoteId })
  }, [dispatch, state.activeNoteId])

  const { user, syncStatus, syncError, isConfigured, signOut, triggerSync } = useSync(
    state.notes, [], (notes) => onMerge(notes)
  )

  // 快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 'n') {
        e.preventDefault()
        // 前 3 次新建时显示模板选择器
        const count = parseInt(localStorage.getItem('shimo-create-count') || '0')
        if (count < 3) {
          localStorage.setItem('shimo-create-count', String(count + 1))
          setShowTemplates(true)
        } else {
          dispatch({ type: 'CREATE_NOTE' })
        }
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
      // Ctrl+B: 折叠/展开侧边栏
      if (mod && e.key === 'b') {
        e.preventDefault()
        setSidebarCollapsed(v => !v)
      }
      // Ctrl+\: 折叠/展开笔记列表
      if (mod && e.key === '\\') {
        e.preventDefault()
        setListCollapsed(v => !v)
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
      {/* 侧边栏 — 可折叠 */}
      {!sidebarCollapsed && (
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
          onCollapse={() => setSidebarCollapsed(true)}
        />
      )}

      {/* 笔记列表 — 可折叠 */}
      {!listCollapsed && (
        <>
          <NoteList width={listWidth} onCollapse={() => setListCollapsed(true)} />
          <div
            onMouseDown={handleDragStart}
            style={{
              width: 4, cursor: 'col-resize', flexShrink: 0,
              background: 'transparent', position: 'relative', zIndex: 10,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-light)')}
            onMouseLeave={e => { if (!isDragging.current) e.currentTarget.style.background = 'transparent' }}
          />
        </>
      )}

      {/* 编辑器 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* 展开按钮 — 只在有面板被折叠时显示 */}
        {(sidebarCollapsed || listCollapsed) && (
          <div style={{
            position: 'absolute', top: 10, left: 10, zIndex: 20,
            display: 'flex', gap: 4,
          }}>
            {sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                title="显示侧边栏 (Ctrl+B)"
                style={{
                  width: 32, height: 32, border: 'none', borderRadius: 6,
                  background: 'var(--bg-secondary)', color: 'var(--text-faint)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, transition: 'all 0.15s', boxShadow: 'var(--shadow-sm)',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)' }}
              >☰</button>
            )}
            {listCollapsed && (
              <button
                onClick={() => setListCollapsed(false)}
                title="显示列表 (Ctrl+\)"
                style={{
                  width: 32, height: 32, border: 'none', borderRadius: 6,
                  background: 'var(--bg-secondary)', color: 'var(--text-faint)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, transition: 'all 0.15s', boxShadow: 'var(--shadow-sm)',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)' }}
              >▷</button>
            )}
          </div>
        )}
        <Suspense fallback={<div className="editor-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-serif)', fontSize: 20, opacity: 0.3 }}>墨</span></div>}>
          <NoteEditor />
        </Suspense>
      </div>
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
      {reviewReminder && !showWelcomeTip && (
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

      {/* 首次使用提示 */}
      {showWelcomeTip && <WelcomeTip onDismiss={() => setShowWelcomeTip(false)} />}
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
