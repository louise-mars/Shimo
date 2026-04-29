import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, fullSync, subscribeToChanges, embedNote, isEmbeddingAvailable } from '@notepro/shared'
import type { User, Session } from '@supabase/supabase-js'
import type { Note, Folder } from '@notepro/shared'

export type SyncStatus = 'offline' | 'syncing' | 'synced' | 'error'

export function useSync(
  notes: Note[],
  _folders: Folder[],
  onMerge: (notes: Note[]) => void,
) {
  const [user, setUser] = useState<User | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline')
  const [syncError, setSyncError] = useState('')
  const isConfigured = !!supabase
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const syncingRef = useRef(false)
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

  const triggerSync = useCallback(async () => {
    if (!user || syncingRef.current) return
    syncingRef.current = true
    setSyncStatus('syncing')
    try {
      const merged = await fullSync(notes, [], user)
      onMerge(merged.notes)
      setSyncStatus('synced')
      setSyncError('')

      // Background: embed recently changed notes
      if (isEmbeddingAvailable()) {
        const recent = notes.filter(n => !n.deletedAt && Date.now() - n.updatedAt < 60000)
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
    } finally {
      syncingRef.current = false
    }
  }, [user, notes, onMerge])

  useEffect(() => {
    if (user) triggerSync()
    else setSyncStatus('offline')
  }, [user]) // eslint-disable-line

  useEffect(() => {
    if (!user) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(triggerSync, 10000) // 10s debounce
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [notes]) // eslint-disable-line

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
  }, [user]) // only re-subscribe when user changes

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
    setSyncStatus('offline')
  }, [])

  return { user, syncStatus, syncError, isConfigured, signOut, triggerSync }
}
