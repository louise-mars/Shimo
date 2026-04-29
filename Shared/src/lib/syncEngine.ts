import { supabase, isSupabaseConfigured } from './supabase'
import type { Note, Folder } from '../types'
import type { User } from '@supabase/supabase-js'

const DEVICE_ID = (() => {
  let id = localStorage.getItem('shimo-device-id')
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('shimo-device-id', id) }
  return id
})()

const QUEUE_KEY = 'shimo-sync-queue'

interface SyncOp {
  type: 'upsert_note' | 'delete_note' | 'upsert_folder' | 'delete_folder'
  payload: Record<string, unknown>
  timestamp: number
}

// === Offline Queue ===

export function getQueue(): SyncOp[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}

export function saveQueue(queue: SyncOp[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

/**
 * Validate a sync operation before processing
 */
export function isValidOp(op: SyncOp): boolean {
  if (!op || typeof op !== 'object') return false
  if (!['upsert_note', 'delete_note', 'upsert_folder', 'delete_folder'].includes(op.type)) return false
  if (!op.payload || typeof op.payload !== 'object') return false
  if (typeof op.timestamp !== 'number' || op.timestamp <= 0) return false

  // Type-specific validation
  if (op.type === 'delete_note' || op.type === 'delete_folder') {
    if (!op.payload.id || typeof op.payload.id !== 'string') return false
  }
  if (op.type === 'upsert_note') {
    if (!op.payload.id || typeof op.payload.id !== 'string') return false
  }
  if (op.type === 'upsert_folder') {
    if (!op.payload.id || typeof op.payload.id !== 'string') return false
  }

  return true
}

export function enqueueOp(op: SyncOp) {
  if (!isValidOp(op)) {
    console.error('Invalid sync operation:', op)
    return
  }
  const queue = getQueue()
  queue.push(op)
  saveQueue(queue)
}

// === Data Conversion ===

function noteToRow(note: Note, userId: string) {
  return {
    id: note.id,
    user_id: userId,
    title: note.title,
    content: note.content,
    tags: note.tags,
    folder_id: note.folderId,
    pinned: note.pinned,
    favorited: note.favorited,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
    deleted: false,
  }
}

function rowToNote(row: Record<string, unknown>): Note {
  return {
    id: row.id as string,
    title: row.title as string,
    content: row.content as string,
    tags: (row.tags as string[]) || [],
    folderId: (row.folder_id as string) || null,
    pinned: row.pinned as boolean,
    favorited: row.favorited as boolean,
    locked: (row.locked as boolean) || false,
    hidden: (row.hidden as boolean) || false,
    deletedAt: (row.deleted_at as number) || null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  }
}

function folderToRow(folder: Folder, userId: string, sortOrder: number) {
  return {
    id: folder.id,
    user_id: userId,
    name: folder.name,
    emoji: folder.emoji,
    parent_id: folder.parentId,
    sort_order: sortOrder,
  }
}

function rowToFolder(row: Record<string, unknown>): Folder {
  return {
    id: row.id as string,
    name: row.name as string,
    emoji: row.emoji as string,
    parentId: (row.parent_id as string) || null,
  }
}

// === Sync Engine ===

export async function pushChanges(notes: Note[], folders: Folder[], user: User) {
  if (!supabase) return

  // Process offline queue first
  const queue = getQueue()
  const processedIds: string[] = []
  for (const op of queue) {
    if (!isValidOp(op)) {
      console.warn('Skipping invalid operation in queue:', op)
      continue
    }
    try {
      if (op.type === 'delete_note') {
        await supabase.from('notes').update({ deleted: true, updated_at: op.timestamp }).eq('id', op.payload.id).eq('user_id', user.id)
        processedIds.push(op.payload.id as string)
      } else if (op.type === 'delete_folder') {
        await supabase.from('folders').delete().eq('id', op.payload.id).eq('user_id', user.id)
        processedIds.push(op.payload.id as string)
      }
    } catch (err) {
      console.error('Failed to process queue operation:', op, err)
      // Keep invalid ops in queue for retry
    }
  }
  // Remove processed operations from queue
  const remainingQueue = queue.filter(op => !processedIds.includes(op.payload.id as string))
  saveQueue(remainingQueue)

  // Upsert all notes
  const noteRows = notes.map(n => noteToRow(n, user.id))
  if (noteRows.length > 0) {
    await supabase.from('notes').upsert(noteRows, { onConflict: 'id' })
  }

  // Upsert all folders (skip 'default')
  const folderRows = folders
    .filter(f => f.id !== 'default')
    .map((f, i) => folderToRow(f, user.id, i))
  if (folderRows.length > 0) {
    await supabase.from('folders').upsert(folderRows, { onConflict: 'id' })
  }

  // Update sync meta
  await supabase.from('sync_meta').upsert({
    user_id: user.id,
    device_id: DEVICE_ID,
    last_sync: Date.now(),
  })
}

export async function pullChanges(user: User): Promise<{ notes: Note[]; folders: Folder[] } | null> {
  if (!supabase) return null

  // Get last sync time for this device
  const { data: meta } = await supabase
    .from('sync_meta')
    .select('last_sync')
    .eq('user_id', user.id)
    .eq('device_id', DEVICE_ID)
    .single()

  const lastSync = (meta?.last_sync as number) || 0

  // Pull notes updated since last sync (from other devices)
  const { data: noteRows } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', user.id)
    .eq('deleted', false)
    .gt('updated_at', lastSync)

  // Pull all folders (simple — folders don't change often)
  const { data: folderRows } = await supabase
    .from('folders')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order')

  const notes = (noteRows || []).map(r => rowToNote(r as Record<string, unknown>))
  const folders = (folderRows || []).map(r => rowToFolder(r as Record<string, unknown>))

  return { notes, folders }
}

export async function fullSync(
  localNotes: Note[],
  localFolders: Folder[],
  user: User
): Promise<{ notes: Note[]; folders: Folder[]; conflicts: Array<{ local: Note; remote: Note }> }> {
  if (!supabase) return { notes: localNotes, folders: localFolders, conflicts: [] }

  // Pull remote changes FIRST (safer: don't push until we know remote state)
  const remote = await pullChanges(user)

  // Then push local changes
  await pushChanges(localNotes, localFolders, user)

  if (!remote) return { notes: localNotes, folders: localFolders, conflicts: [] }

  // Merge: Last-Write-Wins by updatedAt, track conflicts
  const conflicts: Array<{ local: Note; remote: Note }> = []
  const mergedNotesMap = new Map<string, Note>()
  for (const n of localNotes) mergedNotesMap.set(n.id, n)
  for (const n of remote.notes) {
    const local = mergedNotesMap.get(n.id)
    if (local && n.updatedAt !== local.updatedAt && n.content !== local.content) {
      // Both sides changed — conflict
      conflicts.push({ local, remote: n })
    }
    if (!local || n.updatedAt > local.updatedAt) {
      mergedNotesMap.set(n.id, n)
    }
  }

  // Merge folders: remote wins (simpler, folders change rarely)
  const mergedFolders: Folder[] = [
    { id: 'default', name: 'All Notes', emoji: '📒', parentId: null },
    ...remote.folders,
  ]
  // Add any local-only folders
  const remoteFolderIds = new Set(remote.folders.map(f => f.id))
  for (const f of localFolders) {
    if (f.id !== 'default' && !remoteFolderIds.has(f.id)) {
      mergedFolders.push(f)
    }
  }

  // Update sync meta
  await supabase.from('sync_meta').upsert({
    user_id: user.id,
    device_id: DEVICE_ID,
    last_sync: Date.now(),
  })

  return {
    notes: Array.from(mergedNotesMap.values()),
    folders: mergedFolders,
    conflicts,
  }
}

// === Realtime Subscription ===

export function subscribeToChanges(
  user: User,
  onNoteChange: (note: Note) => void,
  onNoteDelete: (noteId: string) => void,
) {
  if (!supabase) return () => {}

  const channel = supabase
    .channel('sync')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'notes',
      filter: `user_id=eq.${user.id}`,
    }, (payload) => {
      if (payload.eventType === 'DELETE') {
        onNoteDelete(payload.old.id as string)
      } else {
        const row = payload.new as Record<string, unknown>
        if (row.deleted) {
          onNoteDelete(row.id as string)
        } else {
          onNoteChange(rowToNote(row))
        }
      }
    })
    .subscribe()

  return () => { supabase!.removeChannel(channel) }
}