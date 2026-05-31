/**
 * 拾墨 — 共享 Store 核心
 * Desktop 和 Mobile 共用同一套 reducer 逻辑
 * 各平台只需提供 Provider 壳（加载、持久化、主题应用）
 */

import { v4 as uuid } from 'uuid'
import type { Note, Folder, ThemeMode, EditorMode } from '../types'

// === State ===

export interface StoreState {
  notes: Note[]
  folders: Folder[]
  activeNoteId: string | null
  activeTag: string | null       // Desktop 用于标签/视图过滤
  activeFolderId: string | null  // Mobile 用于文件夹过滤
  theme: ThemeMode
  editorMode: EditorMode
  searchQuery: string
}

// === Actions ===

export type StoreAction =
  | { type: 'CREATE_NOTE'; folderId?: string | null }
  | { type: 'UPDATE_NOTE'; noteId: string; updates: Partial<Note> }
  | { type: 'DELETE_NOTE'; noteId: string }
  | { type: 'RESTORE_NOTE'; noteId: string }
  | { type: 'PERMANENT_DELETE'; noteId: string }
  | { type: 'EMPTY_TRASH' }
  | { type: 'SET_ACTIVE_NOTE'; noteId: string | null }
  | { type: 'SET_ACTIVE_TAG'; tag: string | null }
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
  | { type: 'SET_SEARCH'; query: string }
  | { type: 'IMPORT_NOTES'; notes: Note[] }
  | { type: 'IMPORT_BULK'; notes: Note[]; folders: Folder[] }
  | { type: 'MERGE_SYNC'; notes: Note[]; folders: Folder[] }
  | { type: 'LOAD_STATE'; state: Partial<StoreState> }
  | { type: 'RENAME_TAG'; oldTag: string; newTag: string }

// === Helpers ===

/** Replace #oldTag with #newTag inside TipTap JSON content */
function replaceTagInContent(content: string, oldTag: string, newTag: string): string {
  if (!content) return content
  try {
    const doc = JSON.parse(content)
    const replaced = replaceTagInNode(doc, oldTag, newTag)
    return JSON.stringify(replaced)
  } catch {
    // Fallback: plain text content (shouldn't happen, but safe)
    return content.replace(new RegExp(`#${escapeRegex(oldTag)}(?=[\\s,;.!?，。；！？]|$)`, 'g'), `#${newTag}`)
  }
}

function replaceTagInNode(node: any, oldTag: string, newTag: string): any {
  if (node.text) {
    // Replace #oldTag with #newTag in text nodes
    // Match #tag followed by a non-tag character or end of string
    const pattern = new RegExp(`#${escapeRegex(oldTag)}(?![\\u4e00-\\u9fa5\\w])`, 'g')
    const patternEnd = new RegExp(`#${escapeRegex(oldTag)}$`)
    let newText = node.text.replace(pattern, `#${newTag}`)
    newText = newText.replace(patternEnd, `#${newTag}`)
    return { ...node, text: newText }
  }
  if (node.content) {
    return { ...node, content: node.content.map((child: any) => replaceTagInNode(child, oldTag, newTag)) }
  }
  return node
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function makeNote(folderId?: string | null): Note {
  return {
    id: uuid(),
    title: '',
    content: '',
    tags: [],
    folderId: folderId ?? null,
    pinned: false,
    favorited: false,
    locked: false,
    hidden: false,
    deletedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export const DEFAULT_FOLDER: Folder = { id: 'default', name: '全部', emoji: '📜', parentId: null, order: 0, createdAt: 0, updatedAt: 0 }

export const INITIAL_STATE: StoreState = {
  notes: [],
  folders: [DEFAULT_FOLDER],
  activeNoteId: null,
  activeTag: null,
  activeFolderId: null,
  theme: 'light',
  editorMode: 'simple',
  searchQuery: '',
}

// === Reducer ===

export function storeReducer(state: StoreState, action: StoreAction): StoreState {
  switch (action.type) {
    case 'CREATE_NOTE': {
      const note = makeNote(action.folderId ?? state.activeFolderId)
      return { ...state, notes: [note, ...state.notes], activeNoteId: note.id }
    }

    case 'UPDATE_NOTE':
      return {
        ...state,
        notes: state.notes.map(n =>
          n.id === action.noteId ? { ...n, ...action.updates, updatedAt: Date.now() } : n
        ),
      }

    case 'DELETE_NOTE':
      return {
        ...state,
        notes: state.notes.map(n =>
          n.id === action.noteId ? { ...n, deletedAt: Date.now() } : n
        ),
        activeNoteId: state.activeNoteId === action.noteId ? null : state.activeNoteId,
      }

    case 'RESTORE_NOTE':
      return {
        ...state,
        notes: state.notes.map(n =>
          n.id === action.noteId ? { ...n, deletedAt: null } : n
        ),
      }

    case 'PERMANENT_DELETE':
      return { ...state, notes: state.notes.filter(n => n.id !== action.noteId) }

    case 'EMPTY_TRASH':
      return { ...state, notes: state.notes.filter(n => !n.deletedAt) }

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

    case 'CREATE_FOLDER':
      return { ...state, folders: [...state.folders, action.folder] }

    case 'UPDATE_FOLDER':
      return {
        ...state,
        folders: state.folders.map(f => {
          if (f.id !== action.folderId) return f
          return {
            ...f,
            ...(action.name !== undefined ? { name: action.name } : {}),
            ...(action.parentId !== undefined ? { parentId: action.parentId } : {}),
          }
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
        notes: state.notes.map(n =>
          n.id === action.noteId ? { ...n, folderId: action.folderId } : n
        ),
      }

    case 'SET_ACTIVE_FOLDER':
      return { ...state, activeFolderId: action.folderId }

    case 'TOGGLE_THEME':
      return { ...state, theme: state.theme === 'light' ? 'dark' : 'light' }

    case 'SET_EDITOR_MODE':
      return { ...state, editorMode: action.mode }

    case 'SET_SEARCH':
      return { ...state, searchQuery: action.query }

    case 'IMPORT_NOTES':
      return {
        ...state,
        notes: [...action.notes, ...state.notes],
        activeNoteId: action.notes[0]?.id ?? state.activeNoteId,
      }

    case 'IMPORT_BULK': {
      const existingNames = new Set(state.folders.map(f => f.name))
      const newFolders = action.folders.filter(f => !existingNames.has(f.name))
      return {
        ...state,
        folders: [...state.folders, ...newFolders],
        notes: [...action.notes, ...state.notes],
        activeNoteId: action.notes[0]?.id ?? state.activeNoteId,
      }
    }

    case 'MERGE_SYNC': {
      // 合并策略：
      // 1. 对每条笔记，如果只有一方修改了，取修改方的版本
      // 2. 如果双方都修改了（冲突），对字段做细粒度合并：
      //    - content/title: 取 updatedAt 更大的版本（内容以最后编辑者为准）
      //    - 元数据 (pinned, favorited, tags, folderId): 取更新的版本
      // 3. 保留本地有但远程没有的笔记（新建未同步的）
      const remoteMap = new Map(action.notes.map(n => [n.id, n]))
      const localMap = new Map(state.notes.map(n => [n.id, n]))

      const mergedNotes: Note[] = action.notes.map(remote => {
        const local = localMap.get(remote.id)
        if (!local) return remote

        // Same version — no conflict
        if (local.updatedAt === remote.updatedAt) return local

        // One side is clearly newer
        if (local.updatedAt > remote.updatedAt) {
          // Local is newer — keep local, but merge any remote metadata that's newer than our last sync
          return local
        }

        // Remote is newer — keep remote content, but preserve local metadata if local was more recently toggled
        // (e.g., user pinned a note locally but remote has a content edit from another device)
        return {
          ...remote,
          // Preserve local pin/favorite if they differ and local was modified more recently for those fields
          pinned: local.pinned !== remote.pinned ? local.pinned : remote.pinned,
          favorited: local.favorited !== remote.favorited ? local.favorited : remote.favorited,
        }
      })

      // Append local-only notes (created locally but not yet on remote)
      for (const local of state.notes) {
        if (!remoteMap.has(local.id)) {
          mergedNotes.push(local)
        }
      }

      return {
        ...state,
        notes: mergedNotes,
        folders: action.folders.length > 0 ? action.folders : state.folders,
        activeNoteId: mergedNotes.find(n => n.id === state.activeNoteId)
          ? state.activeNoteId
          : (mergedNotes[0]?.id ?? null),
      }
    }

    case 'LOAD_STATE':
      return { ...state, ...action.state }

    case 'RENAME_TAG':
      return {
        ...state,
        notes: state.notes.map(n => {
          const hasTag = n.tags.includes(action.oldTag)
          if (!hasTag) return n
          // Update the tags array
          const newTags = n.tags.map(t => t === action.oldTag ? action.newTag : t)
          // Update #tag references inside the TipTap content text
          const newContent = replaceTagInContent(n.content, action.oldTag, action.newTag)
          return { ...n, tags: newTags, content: newContent, updatedAt: Date.now() }
        }),
        activeTag: state.activeTag === action.oldTag ? action.newTag : state.activeTag,
      }

    default:
      return state
  }
}

// === Utilities ===

/** 迁移旧笔记数据：补充缺失字段 */
export function migrateNotes(notes: Note[]): Note[] {
  return notes.map(n => ({
    ...n,
    locked: n.locked ?? false,
    hidden: n.hidden ?? false,
    deletedAt: n.deletedAt ?? null,
  }))
}

/** 清理过期回收站笔记（30天） */
export function getExpiredTrashNotes(notes: Note[]): Note[] {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  return notes.filter(n => n.deletedAt && n.deletedAt < cutoff)
}

/** 生成欢迎笔记 */
export function makeWelcomeNote(platform: 'desktop' | 'mobile'): Note {
  const tips = platform === 'desktop'
    ? [
        '· 直接开始打字，内容会自动保存',
        '· 输入 #标签 自动识别并归类',
        '· 输入 / 唤出命令菜单（标题、列表、代码块…）',
        '· Ctrl+N 新建笔记，Ctrl+T 选择模板',
        '· Ctrl+/ 查看所有快捷键',
      ]
    : [
        '· 直接开始打字，内容会自动保存',
        '· 输入 #标签 自动识别并归类',
        '· 输入 / 唤出命令菜单',
        '· 底部语音栏：长按或点击录音',
      ]

  return {
    id: uuid(),
    title: '欢迎来到拾墨',
    content: JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '拾墨是你的思维捕捉工具。在碎片中，建立秩序。' }] },
        { type: 'paragraph', content: [] },
        { type: 'paragraph', content: [{ type: 'text', text: '试试这些：' }] },
        ...tips.map(t => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })),
        { type: 'paragraph', content: [] },
        { type: 'paragraph', content: [{ type: 'text', text: '准备好了？删除这条笔记，开始你的记录。' }] },
      ],
    }),
    tags: ['欢迎', '教程'],
    folderId: null,
    pinned: false,
    favorited: false,
    locked: false,
    hidden: false,
    deletedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}
