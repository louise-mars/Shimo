import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { StoreProvider, useStore } from './store'
import NoteList from './components/Mobile/NoteList'
import NoteEditor from './components/Mobile/NoteEditor'
import SearchPage from './components/Mobile/SearchPage'
import SettingsPage from './components/Mobile/SettingsPage'
import AuthModal from './components/Auth'
import { useSync } from './lib/useSync'
import { setStatusBarStyle, setupAppListeners } from './lib/native'
import { setupNotificationChannel } from './lib/review'
import './styles/theme.css'
import './styles/mobile.css'

// 重型组件懒加载 — 不影响启动速度
const AISettings   = lazy(() => import('./components/Mobile/AISettings'))
const AskPage      = lazy(() => import('./components/Mobile/AskPage'))
const NoteGraphPage = lazy(() => import('./components/Mobile/NoteGraphPage'))

type View = 'list' | 'editor' | 'search' | 'settings' | 'ai-settings' | 'ask' | 'graph'

function App() {
  const { state, dispatch } = useStore()
  const [view, setView] = useState<View>('list')
  const [authOpen, setAuthOpen] = useState(false)

  const onMerge = useCallback((notes: any[], folders: any[]) => {
    dispatch({ type: 'MERGE_SYNC', notes, folders })
  }, [dispatch])

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
    // 延迟5秒再调度，不影响启动速度
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

  // 处理 Widget deep link
  useEffect(() => {
    const url = window.location.href
    if (url.includes('shimo://voice') || sessionStorage.getItem('shimo-widget-voice')) {
      sessionStorage.removeItem('shimo-widget-voice')
      dispatch({ type: 'CREATE_NOTE' })
      // 等编辑器打开后自动触发语音
      sessionStorage.setItem('shimo-auto-voice', '1')
    } else if (url.includes('shimo://new') || sessionStorage.getItem('shimo-widget-new')) {
      sessionStorage.removeItem('shimo-widget-new')
      dispatch({ type: 'CREATE_NOTE' })
    }
  }, [])

  // 选中笔记 → 进编辑器（稍延确保 store 更新完成）
  useEffect(() => {
    if (state.activeNoteId) {
      setTimeout(() => setView('editor'), 0)
    }
  }, [state.activeNoteId])

  const openNewNote = () => {
    dispatch({ type: 'CREATE_NOTE' })
  }

  const closeEditor = () => {
    dispatch({ type: 'SET_ACTIVE_NOTE', noteId: null })
    setView('list')
  }

  if (view === 'editor') {
    return (
      <NoteEditor onBack={closeEditor} onShowGraph={() => setView('graph')} />
    )
  }

  return (
    <div className="app-shell">
      {/* 主内容 */}
      <div className="app-content">
        {view === 'list' && <NoteList onNewNote={openNewNote} onSelectNote={() => setView('editor')} onRefresh={triggerSync} />}
        {view === 'search'   && <SearchPage onSelectNote={() => setView('editor')} />}
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
              onSelectNote={() => setView('editor')}
              centerNoteId={state.activeNoteId || undefined}
            />
          </Suspense>
        )}
      </div>

      {/* 底部导航 */}
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

      {/* FAB */}
      {view === 'list' && (
        <button className="fab" onClick={openNewNote} aria-label="新建笔记">
          <span style={{ fontSize: 24, lineHeight: 1 }}>+</span>
        </button>
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
