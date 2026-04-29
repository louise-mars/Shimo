import { createContext, useContext, useReducer, useEffect, useRef, type ReactNode } from 'react'
import { v4 as uuid } from 'uuid'
import type { Note, ThemeMode } from '@notepro/shared'
import { idbGet, idbSet, migrateFromLocalStorage } from '@notepro/shared'

interface State {
  notes: Note[]
  activeNoteId: string | null
  activeTag: string | null   // 当前选中的标签过滤
  theme: ThemeMode
  searchQuery: string
}

type Action =
  | { type: 'CREATE_NOTE' }
  | { type: 'UPDATE_NOTE'; noteId: string; updates: Partial<Note> }
  | { type: 'DELETE_NOTE'; noteId: string }
  | { type: 'RESTORE_NOTE'; noteId: string }
  | { type: 'PERMANENT_DELETE'; noteId: string }
  | { type: 'EMPTY_TRASH' }
  | { type: 'SET_ACTIVE_NOTE'; noteId: string | null }
  | { type: 'SET_ACTIVE_TAG'; tag: string | null }
  | { type: 'TOGGLE_PIN'; noteId: string }
  | { type: 'TOGGLE_FAVORITE'; noteId: string }
  | { type: 'TOGGLE_THEME' }
  | { type: 'SET_SEARCH'; query: string }
  | { type: 'IMPORT_NOTES'; notes: Note[] }
  | { type: 'MERGE_SYNC'; notes: Note[] }
  | { type: 'LOAD_STATE'; state: Partial<State> }
  | { type: 'RENAME_TAG'; oldTag: string; newTag: string }

const STORAGE_KEY = 'shimo-desktop-state'
const WELCOME_KEY = 'shimo-welcome-shown'

const WELCOME_CONTENT = JSON.stringify({
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: '拾墨是你的思维捕捉工具。在碎片中，建立秩序。' }] },
    { type: 'paragraph', content: [] },
    { type: 'paragraph', content: [{ type: 'text', text: '试试这些：' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '· 直接开始打字，内容会自动保存' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '· 输入 #标签 自动识别并归类' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '· 输入 / 唤出命令菜单（标题、列表、代码块…）' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '· Ctrl+N 新建笔记，Ctrl+T 选择模板' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '· Ctrl+/ 查看所有快捷键' }] },
    { type: 'paragraph', content: [] },
    { type: 'paragraph', content: [{ type: 'text', text: '准备好了？删除这条笔记，开始你的记录。' }] },
  ]
})

const makeWelcomeNote = (): Note => ({
  id: uuid(), title: '欢迎来到拾墨',
  content: WELCOME_CONTENT,
  tags: ['欢迎', '教程'], folderId: null,
  pinned: false, favorited: false,
  locked: false, hidden: false, deletedAt: null,
  createdAt: Date.now(), updatedAt: Date.now(),
})

const makeNote = (): Note => ({
  id: uuid(), title: '', content: '',
  tags: [], folderId: null,
  pinned: false, favorited: false,
  locked: false, hidden: false, deletedAt: null,
  createdAt: Date.now(), updatedAt: Date.now(),
})

const initialState: State = {
  notes: [],
  activeNoteId: null,
  activeTag: null,
  theme: 'light',
  searchQuery: '',
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'CREATE_NOTE': {
      const note = makeNote()
      return { ...state, notes: [note, ...state.notes], activeNoteId: note.id }
    }
    case 'UPDATE_NOTE':
      return {
        ...state,
        notes: state.notes.map(n =>
          n.id === action.noteId ? { ...n, ...action.updates, updatedAt: Date.now() } : n
        ),
      }
    case 'DELETE_NOTE': {
      // Soft delete — move to trash
      return {
        ...state,
        notes: state.notes.map(n =>
          n.id === action.noteId ? { ...n, deletedAt: Date.now() } : n
        ),
        activeNoteId: state.activeNoteId === action.noteId
          ? null : state.activeNoteId,
      }
    }
    case 'RESTORE_NOTE':
      return {
        ...state,
        notes: state.notes.map(n =>
          n.id === action.noteId ? { ...n, deletedAt: null } : n
        ),
      }
    case 'PERMANENT_DELETE': {
      const notes = state.notes.filter(n => n.id !== action.noteId)
      return { ...state, notes }
    }
    case 'EMPTY_TRASH':
      return {
        ...state,
        notes: state.notes.filter(n => !n.deletedAt),
      }
    case 'SET_ACTIVE_NOTE':
      return { ...state, activeNoteId: action.noteId }
    case 'SET_ACTIVE_TAG':
      return { ...state, activeTag: action.tag, activeNoteId: null }
    case 'TOGGLE_PIN':
      return {
        ...state,
        notes: state.notes.map(n =>
          n.id === action.noteId ? { ...n, pinned: !n.pinned } : n
        ),
      }
    case 'TOGGLE_FAVORITE':
      return {
        ...state,
        notes: state.notes.map(n =>
          n.id === action.noteId ? { ...n, favorited: !n.favorited } : n
        ),
      }
    case 'TOGGLE_THEME':
      return { ...state, theme: state.theme === 'light' ? 'dark' : 'light' }
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.query }
    case 'IMPORT_NOTES':
      return {
        ...state,
        notes: [...action.notes, ...state.notes],
        activeNoteId: action.notes[0]?.id ?? state.activeNoteId,
      }
    case 'MERGE_SYNC':
      return {
        ...state, notes: action.notes,
        activeNoteId: action.notes.find(n => n.id === state.activeNoteId)
          ? state.activeNoteId : (action.notes[0]?.id ?? null),
      }
    case 'LOAD_STATE':
      return { ...state, ...action.state }
    case 'RENAME_TAG':
      return {
        ...state,
        notes: state.notes.map(n => ({
          ...n,
          tags: n.tags.map(t => t === action.oldTag ? action.newTag : t),
        })),
        activeTag: state.activeTag === action.oldTag ? action.newTag : state.activeTag,
      }
    default:
      return state
  }
}

const StoreContext = createContext<{ state: State; dispatch: React.Dispatch<Action> } | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Load from IndexedDB (with localStorage migration)
  useEffect(() => {
    (async () => {
      try {
        // Try IndexedDB first
        let data = await idbGet<Partial<State>>(STORAGE_KEY)

        // Migrate from localStorage if IndexedDB is empty
        if (!data) {
          data = await migrateFromLocalStorage(STORAGE_KEY) as Partial<State> | null
        }

        if (data) {
          // Migrate: add missing fields for old notes
          if (data.notes) {
            data.notes = data.notes.map((n: Note) => ({
              ...n,
              locked: n.locked ?? false,
              hidden: n.hidden ?? false,
              deletedAt: n.deletedAt ?? null,
            }))
          }
          dispatch({ type: 'LOAD_STATE', state: data })
        }
      } catch (err) {
        console.error('Failed to load state:', err)
      }

      // Welcome note for first-time users
      if (!localStorage.getItem(WELCOME_KEY)) {
        localStorage.setItem(WELCOME_KEY, '1')
        const welcome = makeWelcomeNote()
        dispatch({ type: 'IMPORT_NOTES', notes: [welcome] })
      }
    })()
  }, [])

  // Auto-cleanup: permanently delete notes in trash for 30+ days (run once on mount)
  const cleanupDone = useRef(false)
  useEffect(() => {
    if (cleanupDone.current) return
    cleanupDone.current = true
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    const expired = state.notes.filter(n => n.deletedAt && n.deletedAt < cutoff)
    expired.forEach(n => dispatch({ type: 'PERMANENT_DELETE', noteId: n.id }))
  }, [state.notes])

  // Persist to IndexedDB with 1s debounce
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const { notes, theme, activeTag } = state
      idbSet(STORAGE_KEY, { notes, theme, activeTag }).catch(err => {
        console.error('Failed to save state:', err)
      })
    }, 1000)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [state])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme)
  }, [state.theme])

  return (
    <StoreContext.Provider value={{ state, dispatch }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
