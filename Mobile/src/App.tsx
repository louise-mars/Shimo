import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { StoreProvider, useStore } from './store'
import NoteList from './components/Mobile/NoteList'
import NoteEditor from './components/Mobile/NoteEditor'
import SearchPage from './components/Mobile/SearchPage'
import SettingsPage from './components/Mobile/SettingsPage'
import AuthModal from './components/Auth'
import Onboarding, { shouldShowOnboarding } from './components/Mobile/Onboarding'
import TemplatePicker from './components/Mobile/TemplatePicker'
import { useSync } from './lib/useSync'
import { setStatusBarStyle, setupAppListeners } from './lib/native'
import { setupNotificationChannel } from './lib/review'
import './styles/theme.css'
import './styles/mobile.css'

// 重型组件懒加载 — 不影响启动速度
const AISettings   = lazy(() => import('./components/Mobile/AISettings'))
const AskPage      = lazy(() => import('./components/Mobile/AskPage'))
const NoteGraphPage = lazy(() => import('./components/Mobile/NoteGraphPage'))

// === 视图状态机 ===
// 所有合法的视图状态和转换都在这里显式定义
type View = 'list' | 'editor' | 'search' | 'settings' | 'ai-settings' | 'ask' | 'graph'

/** 视图是否需要底部导航栏 */
function showBottomNav(view: View): boolean {
  return view !== 'editor'
}

/** 视图是否需要 FAB */
function showFab(view: View): boolean {
  return view === 'list'
}

function App() {
  const { state, dispatch, loaded } = useStore()
  const [view, setView] = useState<View>('list')
  const [authOpen, setAuthOpen] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding)
  const [showTemplates, setShowTemplates] = useState(false)

  // MERGE_SYNC 时传入当前正在编辑的 noteId，保护编辑中内容
  const onMerge = useCallback((notes: any[], folders: any[]) => {
    dispatch({ type: 'MERGE_SYNC', notes, folders, editingNoteId: state.activeNoteId })
  }, [dispatch, state.activeNoteId])

  const { user, syncStatus, isConfigured, signOut, triggerSync } = useSync(
    state.notes, state.folders, onMerge
  )

  useEffect(() => {
    setStatusBarStyle(state.theme === 'dark')
  }, [state.theme])

  useEffect(() => {
    return setupAppListeners(() => triggerSync(), () => {})
  }, [triggerSync])

  // 初始化通知渠道 + 延迟调度今日回顾（不阻塞启动）
  useEffect(() => {
    setupNotificationChannel()
    const t = setTimeout(async () => {
      const { scheduleReviewNotification } = await import('./lib/review')
      const todayNotes = state.notes.filter(n =>
        new Date(n.updatedAt).toDateString() === new Date().toDateString()
      )
      if (todayNotes.length === 0) return
      try {
        const { isAIConfigured, generateDailySummary } = await import('./lib/ai')
        if (isAIConfigured()) {
          const summary = await generateDailySummary(state.notes)
          scheduleReviewNotification(todayNotes.length, summary)
        } else {
          scheduleReviewNotification(todayNotes.length)
        }
      } catch {
        const { scheduleReviewNotification: sr } = await import('./lib/review')
        sr(todayNotes.length)
      }
    }, 5000)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line

  // 处理 Widget deep link（仅在数据加载完成后）
  useEffect(() => {
    if (!loaded) return
    const url = window.location.href
    if (url.includes('shimo://voice') || sessionStorage.getItem('shimo-widget-voice')) {
      sessionStorage.removeItem('shimo-widget-voice')
      dispatch({ type: 'CREATE_NOTE' })
      sessionStorage.setItem('shimo-auto-voice', '1')
    } else if (url.includes('shimo://new') || sessionStorage.getItem('shimo-widget-new')) {
      sessionStorage.removeItem('shimo-widget-new')
      dispatch({ type: 'CREATE_NOTE' })
    }
  }, [loaded]) // eslint-disable-line

  // === 状态机核心：数据状态 → 视图状态的双向同步 ===
  useEffect(() => {
    if (state.activeNoteId) {
      // 有活跃笔记 → 进编辑器
      if (view !== 'editor') setView('editor')
    } else if (view === 'editor') {
      // 活跃笔记消失（删除/清空）→ 回列表
      setView('list')
    }
  }, [state.activeNoteId]) // eslint-disable-line

  const openNewNote = () => {
    // 前 3 次新建笔记时显示模板选择器（帮助用户发现模板功能）
    const createCount = parseInt(localStorage.getItem('shimo-create-count') || '0')
    if (createCount < 3) {
      localStorage.setItem('shimo-create-count', String(createCount + 1))
      setShowTemplates(true)
    } else {
      dispatch({ type: 'CREATE_NOTE' })
    }
  }

  const closeEditor = () => {
    dispatch({ type: 'SET_ACTIVE_NOTE', noteId: null })
    // view 会通过上面的 useEffect 自动切回 list
  }

  // === 渲染 ===

  if (showOnboarding) {
    return <Onboarding onDone={() => setShowOnboarding(false)} />
  }

  if (view === 'editor') {
    return (
      <NoteEditor
        onBack={closeEditor}
        onShowGraph={() => setView('graph')}
        onGoToSettings={() => { closeEditor(); setTimeout(() => setView('settings'), 100) }}
      />
    )
  }

  return (
    <div className="app-shell">
      {/* 主内容 */}
      <div className="app-content">
        {view === 'list' && <NoteList onNewNote={openNewNote} onSelectNote={() => {}} onRefresh={triggerSync} />}
        {view === 'search' && <SearchPage onSelectNote={() => {}} />}
        {view === 'settings' && (
          <SettingsPage
            user={user} syncStatus={syncStatus}
            isConfigured={isConfigured}
            onSignIn={() => setAuthOpen(true)} onSignOut={signOut} onSync={triggerSync}
            onGoToAISettings={() => setView('ai-settings')}
            onGoToAsk={() => setView('ask')}
          />
        )}
        {view === 'ai-settings' && (
          <Suspense fallback={null}>
            <AISettings onBack={() => setView('settings')} />
          </Suspense>
        )}
        {view === 'ask' && (
          <Suspense fallback={null}>
            <AskPage onBack={() => setView('list')} onGoToAISettings={() => setView('ai-settings')} />
          </Suspense>
        )}
        {view === 'graph' && (
          <Suspense fallback={null}>
            <NoteGraphPage
              onSelectNote={() => {}}
              centerNoteId={state.activeNoteId || undefined}
            />
          </Suspense>
        )}
      </div>

      {/* 底部导航 */}
      {showBottomNav(view) && (
        <nav className="bottom-nav">
          <button className={`nav-item ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>
            <span className="nav-icon">📋</span>
            <span>笔记</span>
          </button>
          <button className={`nav-item ${view === 'search' ? 'active' : ''}`} onClick={() => setView('search')}>
            <span className="nav-icon">🔍</span>
            <span>搜索</span>
          </button>
          <button className={`nav-item ${view === 'graph' ? 'active' : ''}`} onClick={() => setView('graph')}>
            <span className="nav-icon">◎</span>
            <span>图谱</span>
          </button>
          <button className={`nav-item ${view === 'ask' ? 'active' : ''}`} onClick={() => setView('ask')}>
            <span className="nav-icon">✦</span>
            <span>问</span>
          </button>
          <button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')}>
            <span className="nav-icon">⚙</span>
            <span>设置</span>
          </button>
        </nav>
      )}

      {/* FAB — 点击新建，长按选模板 */}
      {showFab(view) && (
        <button
          className="fab"
          onClick={openNewNote}
          onContextMenu={e => { e.preventDefault(); setShowTemplates(true) }}
          aria-label="新建笔记（长按选模板）"
        >
          <span style={{ fontSize: 24, lineHeight: 1 }}>+</span>
        </button>
      )}

      {/* 模板选择器 */}
      {showTemplates && (
        <TemplatePicker
          onClose={() => setShowTemplates(false)}
          onCreated={() => setShowTemplates(false)}
        />
      )}

      {/* Auth 弹窗 */}
      {authOpen && (
        <AuthModal
          onClose={() => setAuthOpen(false)}
          onAuth={() => { triggerSync(); setAuthOpen(false) }}
        />
      )}
    </div>
  )
}

export default function Root() {
  return (
    <StoreProvider>
      <App />
    </StoreProvider>
  )
}
