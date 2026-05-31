import { createContext, useContext, useReducer, useEffect, useRef, useState, useMemo, type ReactNode } from 'react'
import type { StoreState, StoreAction } from '@notepro/shared'
import {
  storeReducer,
  INITIAL_STATE,
  migrateNotes,
  makeWelcomeNote,
  idbGet,
  idbSet,
  migrateFromLocalStorage,
} from '@notepro/shared'

const STORAGE_KEY = 'shimo-state'
const WELCOME_KEY = 'shimo-welcome-shown'

const StoreContext = createContext<{
  state: StoreState
  dispatch: React.Dispatch<StoreAction>
  loaded: boolean
} | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(storeReducer, INITIAL_STATE)
  const [loaded, setLoaded] = useState(false)

  // Load from IndexedDB on mount (with localStorage migration)
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
          // 首次使用：创建欢迎笔记
          localStorage.setItem(WELCOME_KEY, '1')
          dispatch({ type: 'IMPORT_NOTES', notes: [makeWelcomeNote('mobile')] })
        }
      } catch (err) {
        console.error('Failed to load state:', err)
      }
      setLoaded(true)
    })()
  }, [])

  // Persist to IndexedDB with 1s debounce (only after initial load, skip if only transient state changed)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastPersistedRef = useRef('')
  useEffect(() => {
    if (!loaded) return
    // Track max updatedAt across ALL notes so any edit triggers a save
    const maxUpdated = state.notes.reduce((max, n) => Math.max(max, n.updatedAt), 0)
    const persistKey = JSON.stringify({ n: state.notes.length, t: state.theme, af: state.activeFolderId, mu: maxUpdated })
    if (persistKey === lastPersistedRef.current) return
    lastPersistedRef.current = persistKey

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const { notes, folders, theme, activeFolderId, editorMode } = state
      idbSet(STORAGE_KEY, { notes, folders, theme, activeFolderId, editorMode }).catch(err => {
        console.error('Failed to save state:', err)
      })
    }, 500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [state, loaded])

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme)
  }, [state.theme])

  const contextValue = useMemo(() => ({ state, dispatch, loaded }), [state, loaded])

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
