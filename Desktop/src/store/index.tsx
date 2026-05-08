import { createContext, useContext, useReducer, useEffect, useRef, useState, useMemo, type ReactNode } from 'react'
import type { StoreState, StoreAction } from '@notepro/shared'
import {
  storeReducer,
  INITIAL_STATE,
  migrateNotes,
  makeWelcomeNote,
  getExpiredTrashNotes,
  idbGet,
  idbSet,
  migrateFromLocalStorage,
} from '@notepro/shared'

const STORAGE_KEY = 'shimo-desktop-state'
const WELCOME_KEY = 'shimo-welcome-shown'

const StoreContext = createContext<{
  state: StoreState
  dispatch: React.Dispatch<StoreAction>
  loaded: boolean
} | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(storeReducer, INITIAL_STATE)
  const [loading, setLoading] = useState(true)

  // Load from IndexedDB (with localStorage migration)
  useEffect(() => {
    (async () => {
      try {
        let data = await idbGet<Partial<StoreState>>(STORAGE_KEY)
        if (!data) {
          data = await migrateFromLocalStorage(STORAGE_KEY) as Partial<StoreState> | null
        }
        if (data) {
          if (data.notes) data.notes = migrateNotes(data.notes)
          dispatch({ type: 'LOAD_STATE', state: data })
        } else if (!localStorage.getItem(WELCOME_KEY)) {
          localStorage.setItem(WELCOME_KEY, '1')
          dispatch({ type: 'IMPORT_NOTES', notes: [makeWelcomeNote('desktop')] })
        }
      } catch (err) {
        console.error('Failed to load state:', err)
      }
      setLoading(false)
    })()
  }, [])

  // Auto-cleanup: permanently delete notes in trash for 30+ days (once after load)
  const cleanupDone = useRef(false)
  useEffect(() => {
    if (loading || cleanupDone.current) return
    cleanupDone.current = true
    const expired = getExpiredTrashNotes(state.notes)
    expired.forEach(n => dispatch({ type: 'PERMANENT_DELETE', noteId: n.id }))
  }, [loading]) // eslint-disable-line

  // Persist to IndexedDB with 1s debounce (only after load, only when persisted fields change)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastPersistedRef = useRef('')
  useEffect(() => {
    if (loading) return
    // Only persist if notes or theme or activeTag actually changed
    const persistKey = JSON.stringify({ n: state.notes.length, t: state.theme, at: state.activeTag, lu: state.notes[0]?.updatedAt })
    if (persistKey === lastPersistedRef.current) return
    lastPersistedRef.current = persistKey

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const { notes, theme, activeTag } = state
      idbSet(STORAGE_KEY, { notes, theme, activeTag }).catch(err => {
        console.error('Failed to save state:', err)
      })
    }, 1000)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [state, loading])

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme)
  }, [state.theme])

  const contextValue = useMemo(() => ({ state, dispatch, loaded: !loading }), [state, loading])

  return (
    <StoreContext.Provider value={contextValue}>
      {loading ? (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
          <div style={{ fontSize: 28, fontFamily: 'var(--font-serif)', color: 'var(--text-faint)', letterSpacing: 5, opacity: 0.4 }}>拾墨</div>
        </div>
      ) : children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
