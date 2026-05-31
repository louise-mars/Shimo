import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, fullSync, subscribeToChanges, embedNote, isEmbeddingAvailable } from '@notepro/shared'
import type { User, Session } from '@supabase/supabase-js'
import type { Note, Folder } from '@notepro/shared'

export type SyncStatus = 'offline' | 'syncing' | 'synced' | 'error'

export interface SyncConflict {
  local: Note
  remote: Note
}

export function useSync(
  notes: Note[],
  _folders: Folder[],
  onMerge: (notes: Note[]) => void,
) {
  const [user, setUser] = useState<User | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline')
  const [syncError, setSyncError] = useState('')
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])
  const isConfigured = !!supabase
  const syncingRef = useRef(false)
  const retryCount = useRef(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Refs to always access latest data without recreating callbacks
  const notesRef = useRef(notes)
  notesRef.current = notes
  const onMergeRef = useRef(onMerge)
  onMergeRef.current = onMerge

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Stable sync function — uses refs for data
  const triggerSync = useCallback(async () => {
    if (!user || syncingRef.current) return
    syncingRef.current = true
    setSyncStatus('syncing')
    try {
      const currentNotes = notesRef.current
      const merged = await fullSync(currentNotes, [], user)
      onMergeRef.current(merged.notes)
      setSyncStatus('synced')
      setSyncError('')
      retryCount.current = 0

      // Surface conflicts to the UI
      if (merged.conflicts.length > 0) {
        setConflicts(merged.conflicts)
      }

      // Background: embed recently changed notes
      if (isEmbeddingAvailable()) {
        const recent = currentNotes.filter(n => !n.deletedAt && Date.now() - n.updatedAt < 60000)
        for (const note of recent.slice(0, 3)) {
          embedNote(note, user.id).catch(() => {})
        }
      }
    } catch (err: unknown) {
      setSyncStatus('error')
      const e = err as { status?: number; message?: string }
      if (e.message?.includes('network') || e.message?.includes('fetch')) setSyncError('网络连接失败')
      else if (e.status === 401) setSyncError('登录已过期')
      else if (e.status === 429) setSyncError('请求过于频繁')
      else setSyncError('同步失败，点击重试')

      // Exponential backoff retry (max 5 retries, max 2 min delay)
      if (retryCount.current < 5) {
        const delay = Math.min(120000, 5000 * Math.pow(2, retryCount.current))
        retryCount.current++
        retryTimer.current = setTimeout(triggerSync, delay)
      }
    } finally {
      syncingRef.current = false
    }
  }, [user]) // only depends on user

  useEffect(() => {
    if (user) triggerSync()
    else setSyncStatus('offline')
  }, [user]) // eslint-disable-line

  // Debounced sync on data changes
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    if (!user) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(triggerSync, 10000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [notes]) // eslint-disable-line

  // Cleanup retry timer
  useEffect(() => {
    return () => { if (retryTimer.current) clearTimeout(retryTimer.current) }
  }, [])

  // Realtime subscription — only re-subscribe when user changes
  useEffect(() => {
    if (!user) return
    return subscribeToChanges(
      user,
      (note: Note) => {
        const current = notesRef.current
        onMergeRef.current(
          current.map(n => n.id === note.id ? (note.updatedAt > n.updatedAt ? note : n) : n)
            .concat(current.find(n => n.id === note.id) ? [] : [note])
        )
      },
      (noteId: string) => onMergeRef.current(notesRef.current.filter(n => n.id !== noteId)),
    )
  }, [user])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
    setSyncStatus('offline')
  }, [])

  const dismissConflicts = useCallback(() => setConflicts([]), [])

  return { user, syncStatus, syncError, isConfigured, signOut, triggerSync, conflicts, dismissConflicts }
}
