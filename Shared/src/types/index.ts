/**
 * Core data model interfaces for Shimo (拾墨)
 *
 * All IDs are UUIDs (string type).
 * All timestamps are numbers (Unix milliseconds).
 * Note.content stores TipTap JSON as a stringified JSON blob.
 * Soft-delete pattern: deletedAt is null when active, timestamp when trashed.
 */

// ─── Note ────────────────────────────────────────────────────────────────────

export interface Note {
  id: string
  title: string
  content: string // Stringified TipTap JSON
  tags: string[]
  folderId: string | null
  pinned: boolean
  favorited: boolean
  locked: boolean // 需要密码才能查看
  hidden: boolean // 在列表中隐藏
  deletedAt: number | null // 软删除时间戳，null = 未删除
  createdAt: number
  updatedAt: number
  conflictSourceId?: string // Links conflict copy back to the original note
}

// ─── Folder ──────────────────────────────────────────────────────────────────

export interface Folder {
  id: string
  name: string
  emoji: string
  parentId: string | null // For nesting (max 3 levels)
  order: number // Sort order within parent
  createdAt: number
  updatedAt: number
}

// ─── Note Snapshot (History) ─────────────────────────────────────────────────

export interface NoteSnapshot {
  noteId: string
  title: string
  content: string // TipTap JSON string at time of snapshot
  createdAt: number
  wordCount: number
}

// ─── Theme ───────────────────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark' | 'system'

// ─── TipTap JSON Structure ───────────────────────────────────────────────────

export interface TipTapMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface TipTapNode {
  type: string
  text?: string
  content?: TipTapNode[]
  attrs?: Record<string, unknown>
  marks?: TipTapMark[]
}

// ─── Legacy / Compat Types ───────────────────────────────────────────────────

export type NoteListView = 'card' | 'list'
export type EditorMode = 'simple' | 'advanced'

// ─── Sync Queue ──────────────────────────────────────────────────────────────

export interface SyncQueueOperation {
  type: 'delete_note' | 'delete_folder'
  payload: { id: string }
  timestamp: number
}
