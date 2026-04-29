export interface Note {
  id: string
  title: string
  content: string // TipTap JSON string
  tags: string[]
  folderId: string | null
  pinned: boolean
  favorited: boolean
  locked: boolean    // 需要密码才能查看
  hidden: boolean    // 在列表中隐藏
  deletedAt: number | null  // 软删除时间戳，null = 未删除
  createdAt: number
  updatedAt: number
}

export interface Folder {
  id: string
  name: string
  emoji: string
  parentId: string | null
}

export type ThemeMode = 'light' | 'dark'
export type NoteListView = 'card' | 'list'
export type EditorMode = 'simple' | 'advanced'

// TipTap JSON structure types
export interface TipTapNode {
  type: string
  text?: string
  content?: TipTapNode[]
  attrs?: Record<string, unknown>
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

// Sync queue operation types
export interface SyncQueueOperation {
  type: 'delete_note' | 'delete_folder'
  payload: { id: string }
  timestamp: number
}