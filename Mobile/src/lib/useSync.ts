import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, fullSync, subscribeToChanges } from '@notepro/shared'
import type { User } from '@supabase/supabase-js'
import type { Note, Folder } from '@notepro/shared'

export type SyncStatus = 'offline' | 'syncing' | 'synced' | 'error'

interface UseSyncReturn {
  user: User | null
  syncStatus: SyncStatus
  isConfigured: boolean
  signOut: () => Promise<void>
  triggerSync: () => Promise<void>
}

export function useSync(
  notes: Note[],
  folders: Folder[],
  onMerge: (notes: Note[], folders: Folder[]) => void,
): UseSyncReturn {
  const [user, setUser] = useState<User | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline')
  const isConfigured = !!supabase
  const syncingRef = useRef(false)

  // Refs to always access latest data without recreating callbacks
  const notesRef = useRef(notes)
  notesRef.current = notes
  const foldersRef = useRef(folders)
  foldersRef.current = folders
  const onMergeRef = useRef(onMerge)
  onMergeRef.current = onMerge

  // Listen for auth state changes
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Stable sync function that always uses latest data via refs
  const triggerSync = useCallback(async () => {
    if (!user || syncingRef.current) return
    syncingRef.current = true
    setSyncStatus('syncing')
    try {
      const merged = await fullSync(notesRef.current, foldersRef.current, user)
      onMergeRef.current(merged.notes, merged.folders)
      setSyncStatus('synced')
    } catch {
      setSyncStatus('error')
    } finally {
      syncingRef.current = false
    }
  }, [user]) // only depends on user — uses refs for data

  // Auto-sync on login
  useEffect(() => {
    if (user) triggerSync()
    else setSyncStatus('offline')
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced sync on data changes (push after 10s of inactivity)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    if (!user) return
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      triggerSync()
    }, 10000)
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current) }
  }, [notes, folders]) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscription — only re-subscribe when user changes
  useEffect(() => {
    if (!user) return
    const unsubscribe = subscribeToChanges(
      user,
      (note: Note) => {
        const currentNotes = notesRef.current
        onMergeRef.current(
          currentNotes.map(n => n.id === note.id ? (note.updatedAt > n.updatedAt ? note : n) : n)
            .concat(currentNotes.find(n => n.id === note.id) ? [] : [note]),
          foldersRef.current,
        )
      },
      (noteId: string) => {
        onMergeRef.current(
          notesRef.current.filter(n => n.id !== noteId),
          foldersRef.current,
        )
      },
    )
    return unsubscribe
  }, [user])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
    setSyncStatus('offline')
  }, [])

  return { user, syncStatus, isConfigured, signOut, triggerSync }
}
