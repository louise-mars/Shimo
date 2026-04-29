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
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isSyncingRef = useRef(false)

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

  // Full sync function
  const triggerSync = useCallback(async () => {
    if (!user || isSyncingRef.current) return
    isSyncingRef.current = true
    setSyncStatus('syncing')
    try {
      const merged = await fullSync(notes, folders, user)
      onMerge(merged.notes, merged.folders)
      setSyncStatus('synced')
    } catch {
      setSyncStatus('error')
    } finally {
      isSyncingRef.current = false
    }
  }, [user, notes, folders, onMerge])

  // Auto-sync on login
  useEffect(() => {
    if (user) triggerSync()
    else setSyncStatus('offline')
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced sync on data changes (push changes after 10s of inactivity)
  useEffect(() => {
    if (!user) return
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      triggerSync()
    }, 10000)
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current) }
  }, [notes, folders]) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscription
  useEffect(() => {
    if (!user) return
    const unsubscribe = subscribeToChanges(
      user,
      (note: Note) => {
        // Remote note changed — merge into local
        onMerge(
          notes.map(n => n.id === note.id ? (note.updatedAt > n.updatedAt ? note : n) : n)
            .concat(notes.find(n => n.id === note.id) ? [] : [note]),
          folders,
        )
      },
      (noteId: string) => {
        onMerge(notes.filter(n => n.id !== noteId), folders)
      },
    )
    return unsubscribe
  }, [user, notes, folders, onMerge]) // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
    setSyncStatus('offline')
  }, [])

  return { user, syncStatus, isConfigured, signOut, triggerSync }
}
