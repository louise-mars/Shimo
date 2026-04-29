import { createContext, useContext, useReducer, useEffect, useRef, type ReactNode } from 'react'
import { v4 as uuid } from 'uuid'
import type { Note, Folder, ThemeMode, EditorMode } from '@notepro/shared'
import { idbGet, idbSet, migrateFromLocalStorage } from '@notepro/shared'

interface State {
  notes: Note[]
  folders: Folder[]
  activeNoteId: string | null
  activeFolderId: string | null
  theme: ThemeMode
  editorMode: EditorMode
  sidebarCollapsed: boolean
  searchQuery: string
}

type Action =
  | { type: 'CREATE_NOTE'; folderId?: string | null }
  | { type: 'UPDATE_NOTE'; noteId: string; updates: Partial<Note> }
  | { type: 'DELETE_NOTE'; noteId: string }
  | { type: 'RESTORE_NOTE'; noteId: string }
  | { type: 'PERMANENT_DELETE'; noteId: string }
  | { type: 'SET_ACTIVE_NOTE'; noteId: string | null }
  | { type: 'TOGGLE_PIN'; noteId: string }
  | { type: 'TOGGLE_FAVORITE'; noteId: string }
  | { type: 'CREATE_FOLDER'; folder: Folder }
  | { type: 'UPDATE_FOLDER'; folderId: string; name?: string; parentId?: string | null }
  | { type: 'DELETE_FOLDER'; folderId: string }
  | { type: 'SET_ACTIVE_FOLDER'; folderId: string | null }
  | { type: 'REORDER_FOLDERS'; ids: string[] }
  | { type: 'MOVE_NOTE_TO_FOLDER'; noteId: string; folderId: string | null }
  | { type: 'TOGGLE_THEME' }
  | { type: 'SET_EDITOR_MODE'; mode: EditorMode }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_SEARCH'; query: string }
  | { type: 'IMPORT_NOTES'; notes: Note[] }
  | { type: 'IMPORT_BULK'; notes: Note[]; folders: Folder[] }
  | { type: 'MERGE_SYNC'; notes: Note[]; folders: Folder[] }
  | { type: 'LOAD_STATE'; state: Partial<State> }
  | { type: 'RENAME_TAG'; oldTag: string; newTag: string }

const STORAGE_KEY = 'shimo-state'

const defaultNote: () => Note = () => ({
  id: uuid(),
  title: '',
  content: '',
  tags: [],
  folderId: null,
  pinned: false,
  favorited: false,
  locked: false,
  hidden: false,
  deletedAt: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
})

const initialState: State = {
  notes: [],
  folders: [
    { id: 'default', name: '全部', emoji: '📜', parentId: null },
  ],
  activeNoteId: null,
  activeFolderId: null,
  theme: 'light',
  editorMode: 'simple',
  sidebarCollapsed: false,
  searchQuery: '',
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'CREATE_NOTE': {
      const note = defaultNote()
      note.folderId = action.folderId ?? state.activeFolderId
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
      // Soft delete
      return {
        ...state,
        notes: state.notes.map(n => n.id === action.noteId ? { ...n, deletedAt: Date.now() } : n),
        activeNoteId: state.activeNoteId === action.noteId ? null : state.activeNoteId,
      }
    }
    case 'RESTORE_NOTE':
      return {
        ...state,
        notes: state.notes.map(n => n.id === action.noteId ? { ...n, deletedAt: null } : n),
      }
    case 'PERMANENT_DELETE': {
      const notes = state.notes.filter(n => n.id !== action.noteId)
      return { ...state, notes }
    }
    case 'SET_ACTIVE_NOTE':
      return { ...state, activeNoteId: action.noteId }
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
    case 'CREATE_FOLDER':
      return { ...state, folders: [...state.folders, action.folder] }
    case 'UPDATE_FOLDER':
      return {
        ...state,
        folders: state.folders.map(f => {
          if (f.id !== action.folderId) return f
          return { ...f, ...(action.name !== undefined ? { name: action.name } : {}), ...(action.parentId !== undefined ? { parentId: action.parentId } : {}) }
        }),
      }
    case 'DELETE_FOLDER':
      if (action.folderId === 'default') return state
      return {
        ...state,
        folders: state.folders.filter(f => f.id !== action.folderId && f.parentId !== action.folderId),
        notes: state.notes.map(n => n.folderId === action.folderId ? { ...n, folderId: null } : n),
        activeFolderId: state.activeFolderId === action.folderId ? null : state.activeFolderId,
      }
    case 'REORDER_FOLDERS':
      return {
        ...state,
        folders: [
          state.folders.find(f => f.id === 'default')!,
          ...action.ids.map(id => state.folders.find(f => f.id === id)!).filter(Boolean),
        ],
      }
    case 'MOVE_NOTE_TO_FOLDER':
      return {
        ...state,
        notes: state.notes.map(n => n.id === action.noteId ? { ...n, folderId: action.folderId } : n),
      }
    case 'SET_ACTIVE_FOLDER':
      return { ...state, activeFolderId: action.folderId }
    case 'TOGGLE_THEME':
      return { ...state, theme: state.theme === 'light' ? 'dark' : 'light' }
    case 'SET_EDITOR_MODE':
      return { ...state, editorMode: action.mode }
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed }
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.query }
    case 'IMPORT_NOTES':
      return {
        ...state,
        notes: [...action.notes, ...state.notes],
        activeNoteId: action.notes[0]?.id ?? state.activeNoteId,
      }
    case 'IMPORT_BULK': {
      // Merge folders (skip duplicates by name)
      const existingNames = new Set(state.folders.map(f => f.name))
      const newFolders = action.folders.filter(f => !existingNames.has(f.name))
      return {
        ...state,
        folders: [...state.folders, ...newFolders],
        notes: [...action.notes, ...state.notes],
        activeNoteId: action.notes[0]?.id ?? state.activeNoteId,
      }
    }
    case 'MERGE_SYNC':
      return {
        ...state,
        notes: action.notes,
        folders: action.folders,
        activeNoteId: action.notes.find(n => n.id === state.activeNoteId) ? state.activeNoteId : (action.notes[0]?.id ?? null),
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
      }
    default:
      return state
  }
}

const StoreContext = createContext<{ state: State; dispatch: React.Dispatch<Action> } | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Load from IndexedDB on mount (with localStorage migration)
  useEffect(() => {
    (async () => {
      try {
        let data = await idbGet<Partial<State>>(STORAGE_KEY)
        if (!data) {
          data = await migrateFromLocalStorage(STORAGE_KEY) as Partial<State> | null
        }
        if (data) {
          // Migrate: add missing fields
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
      if (!localStorage.getItem('shimo-welcome-shown')) {
        localStorage.setItem('shimo-welcome-shown', '1')
        const welcome: Note = {
          id: crypto.randomUUID(), title: '欢迎来到拾墨',
          content: JSON.stringify({ type: 'doc', content: [
            { type: 'paragraph', content: [{ type: 'text', text: '拾墨是你的思维捕捉工具。在碎片中，建立秩序。' }] },
            { type: 'paragraph', content: [] },
            { type: 'paragraph', content: [{ type: 'text', text: '试试这些：' }] },
            { type: 'paragraph', content: [{ type: 'text', text: '· 直接开始打字，内容会自动保存' }] },
            { type: 'paragraph', content: [{ type: 'text', text: '· 输入 #标签 自动识别并归类' }] },
            { type: 'paragraph', content: [{ type: 'text', text: '· 输入 / 唤出命令菜单' }] },
            { type: 'paragraph', content: [{ type: 'text', text: '· 底部语音栏：长按或点击录音' }] },
            { type: 'paragraph', content: [] },
            { type: 'paragraph', content: [{ type: 'text', text: '准备好了？删除这条笔记，开始你的记录。' }] },
          ]}),
          tags: ['欢迎', '教程'], folderId: null,
          pinned: false, favorited: false, locked: false, hidden: false, deletedAt: null,
          createdAt: Date.now(), updatedAt: Date.now(),
        }
        dispatch({ type: 'IMPORT_NOTES', notes: [welcome] })
      }
    })()
  }, [])

  // Persist to IndexedDB with 1s debounce
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const { notes, folders, theme, activeFolderId, editorMode } = state
      idbSet(STORAGE_KEY, { notes, folders, theme, activeFolderId, editorMode }).catch(err => {
        console.error('Failed to save state:', err)
      })
    }, 1000)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [state])

  // Apply theme to document
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
