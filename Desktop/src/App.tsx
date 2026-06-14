import { useEffect, useCallback, useState, useRef, lazy, Suspense } from 'react'
import { StoreProvider, useStore } from './store'
import { useAppStore } from '@notepro/shared'
import LeftSidebar from './components/LeftSidebar'
import NoteList from './components/NoteList'
const NoteEditor = lazy(() => import('./components/NoteEditor'))
import CommandPalette from './components/CommandPalette'
import TagGraph from './components/TagGraph'
import ShortcutsPanel from './components/ShortcutsPanel'
import ImportWizard from './components/ImportWizard'
import WeeklyReport from './components/WeeklyReport'
import DailyReview from './components/DailyReview'
import AskAI from './components/AskAI'
import SettingsPanel from './components/SettingsPanel'
import TemplatePicker, { shouldShowTemplatePicker } from './components/TemplatePicker'
import FocusMode from './components/FocusMode'
import ThemePicker, { applyPalette } from './components/ThemePicker'
import KanbanView from './components/KanbanView'
import SearchPanel from './components/SearchPanel'
import ImageGallery from './components/ImageGallery'
import AppLock, { isLockEnabled, hasPinSet, useInactivityLock } from './components/AppLock'
import { AppErrorBoundary, PanelErrorBoundary, ComponentErrorBoundary } from './components/ErrorBoundary'
import WelcomeTip, { shouldShowTip } from './components/WelcomeTip'
import { useSync } from './lib/useSync'
import { initSentry } from './lib/sentry'
import './styles/theme.css'
import './styles/desktop.css'

// Initialize Sentry for error tracking
initSentry()

// Apply saved color palette on startup
applyPalette()

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
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showFocusMode, setShowFocusMode] = useState(false)
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [showKanban, setShowKanban] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showImageGallery, setShowImageGallery] = useState(false)
  const [reviewReminder, setReviewReminder] = useState('')
  const [showWelcomeTip, setShowWelcomeTip] = useState(shouldShowTip)

  // Panel visibility and width from Zustand store
  const sidebarVisible = useAppStore((s) => s.sidebarVisible)
  const noteListVisible = useAppStore((s) => s.noteListVisible)
  const noteListWidth = useAppStore((s) => s.noteListWidth)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const toggleNoteList = useAppStore((s) => s.toggleNoteList)
  const setNoteListWidth = useAppStore((s) => s.setNoteListWidth)

  const onMerge = useCallback((notes: any[]) => {
    dispatch({ type: 'MERGE_SYNC', notes, folders: [] })
  }, [dispatch])

  const { user, syncStatus, syncError, isConfigured, signOut, triggerSync, conflicts, dismissConflicts } = useSync(
    state.notes, [], (notes) => onMerge(notes)
  )

  // Re-apply color palette when switching from dark to light mode
  const theme = useAppStore((s) => s.theme)
  useEffect(() => {
    if (theme !== 'dark') applyPalette()
  }, [theme])

  // 快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 'n') {
        e.preventDefault()
        // Show template picker for new users (total notes <= 3)
        if (shouldShowTemplatePicker()) {
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
        toggleSidebar()
      }
      // Ctrl+Shift+F: 专注模式
      if (mod && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        if (state.activeNoteId) setShowFocusMode(true)
      }
      // Ctrl+F: 高级搜索（非编辑器内）
      if (mod && !e.shiftKey && e.key === 'f') {
        const tag = (e.target as HTMLElement)?.tagName
        const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.closest('.tiptap')
        if (!isEditing) {
          e.preventDefault()
          setShowSearch(true)
        }
      }
      // Ctrl+\: 折叠/展开笔记列表
      if (mod && e.key === '\\') {
        e.preventDefault()
        toggleNoteList()
      }
      // Ctrl+K: 打开命令面板
      if (mod && e.key === 'k') {
        // Only open command palette if NOT in the editor (editor handles Ctrl+K for links)
        const tag = (e.target as HTMLElement)?.tagName
        const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.closest('.tiptap')
        if (!isEditing) {
          e.preventDefault()
          setShowCommandPalette(true)
        }
      }
      // Escape: 关闭面板或取消选中笔记
      if (e.key === 'Escape') {
        // Close any open modal first
        if (showFocusMode) { setShowFocusMode(false); return }
        if (showThemePicker) { setShowThemePicker(false); return }
        if (showKanban) { setShowKanban(false); return }
        if (showSearch) { setShowSearch(false); return }
        if (showImageGallery) { setShowImageGallery(false); return }
        if (showCommandPalette) { setShowCommandPalette(false); return }
        if (showGraph) { setShowGraph(false); return }
        if (showShortcuts) { setShowShortcuts(false); return }
        if (showImport) { setShowImport(false); return }
        if (showReport) { setShowReport(false); return }
        if (showSettings) { setShowSettings(false); return }
        if (showTemplates) { setShowTemplates(false); return }
        if (showDailyReview) { setShowDailyReview(false); return }
        if (showAskAI) { setShowAskAI(false); return }
        // If no modal is open, deselect active note
        if (state.activeNoteId) {
          dispatch({ type: 'SET_ACTIVE_NOTE', noteId: null })
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dispatch, toggleSidebar, toggleNoteList, showFocusMode, showThemePicker, showKanban, showSearch, showImageGallery, showCommandPalette, showGraph, showShortcuts, showImport, showReport, showSettings, showTemplates, showDailyReview, showAskAI, state.activeNoteId])

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

  const isDragging = useRef(false)

  const handleDragStart = useCallback(() => {
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const handleMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const sidebarWidth = sidebarVisible ? 220 : 0
      const newWidth = Math.max(200, Math.min(400, e.clientX - sidebarWidth))
      setNoteListWidth(newWidth)
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
  }, [sidebarVisible, setNoteListWidth])

  return (
    <div className="desktop-app">
      {/* 侧边栏 — 可折叠 */}
      {sidebarVisible && (
        <PanelErrorBoundary panelName="侧边栏">
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
            onCollapse={toggleSidebar}
          />
        </PanelErrorBoundary>
      )}

      {/* 笔记列表 — 可折叠 */}
      {noteListVisible && (
        <PanelErrorBoundary panelName="笔记列表">
          <NoteList width={noteListWidth} onCollapse={toggleNoteList} />
          <div
            className="resize-handle"
            onMouseDown={handleDragStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="调整列表宽度"
            aria-valuenow={noteListWidth}
            aria-valuemin={200}
            aria-valuemax={400}
          />
        </PanelErrorBoundary>
      )}

      {/* 编辑器 */}
      <PanelErrorBoundary panelName="编辑器">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {/* 展开按钮 — 只在有面板被折叠时显示 */}
          {(!sidebarVisible || !noteListVisible) && (
            <div style={{
              position: 'absolute', top: 10, left: 10, zIndex: 20,
              display: 'flex', gap: 4,
            }}>
              {!sidebarVisible && (
                <button
                  onClick={toggleSidebar}
                  title="显示侧边栏 (Ctrl+B)"
                  aria-label="显示侧边栏"
                  className="panel-expand-btn"
                >☰</button>
              )}
              {!noteListVisible && (
                <button
                  onClick={toggleNoteList}
                  title="显示列表 (Ctrl+\)"
                  aria-label="显示笔记列表"
                  className="panel-expand-btn"
                >▷</button>
              )}
            </div>
          )}
          <Suspense fallback={<div className="editor-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-serif)', fontSize: 20, opacity: 0.3 }}>墨</span></div>}>
            <NoteEditor />
          </Suspense>
        </div>
      </PanelErrorBoundary>
      {showGraph && <ComponentErrorBoundary componentName="知识图谱"><TagGraph onClose={() => setShowGraph(false)} /></ComponentErrorBoundary>}
      {showCommandPalette && <CommandPalette
        onClose={() => setShowCommandPalette(false)}
        onShowGraph={() => setShowGraph(true)}
        onShowReport={() => setShowReport(true)}
        onShowSettings={() => setShowSettings(true)}
        onShowDailyReview={() => setShowDailyReview(true)}
        onShowAskAI={() => setShowAskAI(true)}
        onShowImport={() => setShowImport(true)}
        onShowTemplates={() => setShowTemplates(true)}
        onShowFocusMode={() => { if (state.activeNoteId) setShowFocusMode(true) }}
        onShowThemePicker={() => setShowThemePicker(true)}
        onShowKanban={() => setShowKanban(true)}
        onShowSearch={() => setShowSearch(true)}
        onShowImageGallery={() => setShowImageGallery(true)}
      />}
      {showFocusMode && state.activeNoteId && (() => {
        const focusNote = state.notes.find(n => n.id === state.activeNoteId)
        return focusNote ? <FocusMode note={focusNote} onClose={() => setShowFocusMode(false)} /> : null
      })()}
      {showThemePicker && <ThemePicker onClose={() => setShowThemePicker(false)} />}
      {showKanban && <KanbanView onClose={() => setShowKanban(false)} />}
      {showSearch && <SearchPanel onClose={() => setShowSearch(false)} />}
      {showImageGallery && <ImageGallery onClose={() => setShowImageGallery(false)} />}
      {showShortcuts && <ShortcutsPanel onClose={() => setShowShortcuts(false)} />}
      {showImport && <ComponentErrorBoundary componentName="导入向导"><ImportWizard onClose={() => setShowImport(false)} /></ComponentErrorBoundary>}
      {showReport && <ComponentErrorBoundary componentName="周报"><WeeklyReport onClose={() => setShowReport(false)} /></ComponentErrorBoundary>}
      {showSettings && <SettingsPanel
        onClose={() => setShowSettings(false)}
        user={user}
        syncStatus={syncStatus}
        syncError={syncError}
        onSync={triggerSync}
        onSignOut={signOut}
      />}
      {showTemplates && <TemplatePicker onClose={() => setShowTemplates(false)} />}
      {showDailyReview && <ComponentErrorBoundary componentName="每日回顾"><DailyReview onClose={() => setShowDailyReview(false)} /></ComponentErrorBoundary>}
      {showAskAI && <ComponentErrorBoundary componentName="AI 助手"><AskAI
        onClose={() => setShowAskAI(false)}
        onInsertToEditor={(text) => {
          // Dispatch a custom event that NoteEditor can listen to
          window.dispatchEvent(new CustomEvent('shimo-insert-text', { detail: text }))
        }}
      /></ComponentErrorBoundary>}

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

      {/* 同步冲突提示 */}
      {conflicts.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 900, background: 'var(--bg-elevated)', border: '1px solid var(--warning)',
          borderRadius: 12, padding: '12px 18px', boxShadow: 'var(--shadow-lg)',
          display: 'flex', alignItems: 'center', gap: 12, maxWidth: 420,
          animation: 'fadeIn 300ms ease-out',
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', flex: 1 }}>
            同步发现 {conflicts.length} 条笔记存在冲突，已保留最新版本。
            {conflicts.slice(0, 2).map(c => (
              <span key={c.local.id} style={{ display: 'block', fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                · {c.local.title || '无标题'}
              </span>
            ))}
          </span>
          <button onClick={dismissConflicts} style={{
            border: 'none', background: 'none', color: 'var(--text-faint)',
            fontSize: 16, cursor: 'pointer', flexShrink: 0,
          }}>✕</button>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [locked, setLocked] = useState(() => isLockEnabled() && hasPinSet())

  const handleUnlock = () => setLocked(false)
  const handleLock = useCallback(() => setLocked(true), [])

  // Auto-lock after 5 minutes of inactivity
  useInactivityLock(handleLock)

  return (
    <AppErrorBoundary>
      {locked ? (
        <AppLock onUnlock={handleUnlock} />
      ) : (
        <StoreProvider>
          <Layout />
        </StoreProvider>
      )}
    </AppErrorBoundary>
  )
}
