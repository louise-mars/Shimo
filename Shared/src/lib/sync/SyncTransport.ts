/**
 * SyncTransport — Supabase I/O layer for the three-layer sync architecture.
 *
 * ISyncTransport defines the interface for all remote data operations.
 * SupabaseSyncTransport implements it using the Supabase JS SDK v2.
 *
 * Responsibilities:
 * - Pull notes/folders since a given timestamp
 * - Push local notes/folders to remote
 * - Delete entities remotely
 * - Subscribe to real-time changes via Supabase Realtime
 * - Update sync metadata (last sync timestamp, device info)
 *
 * Requirements: 10.1, 10.9, 10.10
 */

import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import type { Note, Folder } from '../../types'

// ─── Interface ───────────────────────────────────────────────────────────────

export interface ISyncTransport {
  /** Pull notes updated since the given timestamp (ms). */
  pullNotes(userId: string, since: number): Promise<Note[]>

  /** Pull all folders for the user. */
  pullFolders(userId: string): Promise<Folder[]>

  /** Upsert notes to remote. */
  pushNotes(notes: Note[], userId: string): Promise<void>

  /** Upsert folders to remote. */
  pushFolders(folders: Folder[], userId: string): Promise<void>

  /** Delete a single note from remote. */
  deleteNote(noteId: string, userId: string): Promise<void>

  /** Delete a single folder from remote. */
  deleteFolder(folderId: string, userId: string): Promise<void>

  /**
   * Subscribe to real-time changes for the user's notes.
   * Returns an unsubscribe function.
   */
  subscribe(
    userId: string,
    onNoteChange: (note: Note) => void,
    onNoteDelete: (noteId: string) => void
  ): () => void

  /** Update sync metadata (last sync time, device ID). */
  updateSyncMeta(userId: string, deviceId: string): Promise<void>
}

// ─── Supabase Implementation ─────────────────────────────────────────────────

/**
 * Maps Supabase row data to a Note object.
 * Supabase stores tags as a JSON array and timestamps as ISO strings or numbers.
 */
function rowToNote(row: Record<string, unknown>): Note {
  return {
    id: row.id as string,
    title: (row.title as string) ?? '',
    content: (row.content as string) ?? '',
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    folderId: (row.folder_id as string | null) ?? null,
    pinned: (row.pinned as boolean) ?? false,
    favorited: (row.favorited as boolean) ?? false,
    locked: (row.locked as boolean) ?? false,
    hidden: (row.hidden as boolean) ?? false,
    deletedAt: row.deleted_at != null ? Number(row.deleted_at) : null,
    createdAt: Number(row.created_at) || Date.now(),
    updatedAt: Number(row.updated_at) || Date.now(),
    conflictSourceId: (row.conflict_source_id as string) ?? undefined,
  }
}

/**
 * Maps a Note object to a Supabase row for upsert.
 */
function noteToRow(note: Note, userId: string): Record<string, unknown> {
  return {
    id: note.id,
    user_id: userId,
    title: note.title,
    content: note.content,
    tags: note.tags,
    folder_id: note.folderId,
    pinned: note.pinned,
    favorited: note.favorited,
    locked: note.locked,
    hidden: note.hidden,
    deleted_at: note.deletedAt,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
    conflict_source_id: note.conflictSourceId ?? null,
  }
}

/**
 * Maps Supabase row data to a Folder object.
 */
function rowToFolder(row: Record<string, unknown>): Folder {
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    emoji: (row.emoji as string) ?? '',
    parentId: (row.parent_id as string | null) ?? null,
    order: Number(row.order) ?? 0,
    createdAt: Number(row.created_at) || Date.now(),
    updatedAt: Number(row.updated_at) || Date.now(),
  }
}

/**
 * Maps a Folder object to a Supabase row for upsert.
 */
function folderToRow(folder: Folder, userId: string): Record<string, unknown> {
  return {
    id: folder.id,
    user_id: userId,
    name: folder.name,
    emoji: folder.emoji,
    parent_id: folder.parentId,
    order: folder.order,
    created_at: folder.createdAt,
    updated_at: folder.updatedAt,
  }
}

export class SupabaseSyncTransport implements ISyncTransport {
  private channel: RealtimeChannel | null = null

  constructor(private supabase: SupabaseClient) {}

  async pullNotes(userId: string, since: number): Promise<Note[]> {
    const { data, error } = await this.supabase
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .gte('updated_at', since)
      .order('updated_at', { ascending: false })

    if (error) {
      throw new Error(`pullNotes failed: ${error.message}`)
    }

    return (data ?? []).map(rowToNote)
  }

  async pullFolders(userId: string): Promise<Folder[]> {
    const { data, error } = await this.supabase
      .from('folders')
      .select('*')
      .eq('user_id', userId)
      .order('order', { ascending: true })

    if (error) {
      throw new Error(`pullFolders failed: ${error.message}`)
    }

    return (data ?? []).map(rowToFolder)
  }

  async pushNotes(notes: Note[], userId: string): Promise<void> {
    if (notes.length === 0) return

    const rows = notes.map((n) => noteToRow(n, userId))

    const { error } = await this.supabase
      .from('notes')
      .upsert(rows, { onConflict: 'id' })

    if (error) {
      throw new Error(`pushNotes failed: ${error.message}`)
    }
  }

  async pushFolders(folders: Folder[], userId: string): Promise<void> {
    if (folders.length === 0) return

    const rows = folders.map((f) => folderToRow(f, userId))

    const { error } = await this.supabase
      .from('folders')
      .upsert(rows, { onConflict: 'id' })

    if (error) {
      throw new Error(`pushFolders failed: ${error.message}`)
    }
  }

  async deleteNote(noteId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('notes')
      .delete()
      .eq('id', noteId)
      .eq('user_id', userId)

    if (error) {
      throw new Error(`deleteNote failed: ${error.message}`)
    }
  }

  async deleteFolder(folderId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('folders')
      .delete()
      .eq('id', folderId)
      .eq('user_id', userId)

    if (error) {
      throw new Error(`deleteFolder failed: ${error.message}`)
    }
  }

  subscribe(
    userId: string,
    onNoteChange: (note: Note) => void,
    onNoteDelete: (noteId: string) => void
  ): () => void {
    // Remove any existing subscription
    if (this.channel) {
      this.supabase.removeChannel(this.channel)
      this.channel = null
    }

    this.channel = this.supabase
      .channel(`sync:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notes',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onNoteChange(rowToNote(payload.new as Record<string, unknown>))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notes',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onNoteChange(rowToNote(payload.new as Record<string, unknown>))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notes',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const old = payload.old as Record<string, unknown>
          if (old && typeof old.id === 'string') {
            onNoteDelete(old.id)
          }
        }
      )
      .subscribe()

    // Return unsubscribe function
    return () => {
      if (this.channel) {
        this.supabase.removeChannel(this.channel)
        this.channel = null
      }
    }
  }

  async updateSyncMeta(userId: string, deviceId: string): Promise<void> {
    const { error } = await this.supabase
      .from('sync_meta')
      .upsert(
        {
          user_id: userId,
          device_id: deviceId,
          last_sync_at: Date.now(),
          updated_at: Date.now(),
        },
        { onConflict: 'user_id,device_id' }
      )

    if (error) {
      throw new Error(`updateSyncMeta failed: ${error.message}`)
    }
  }
}
