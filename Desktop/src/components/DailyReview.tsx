import { useMemo } from 'react'
import { useStore } from '../store'
import { getPreview, extractText } from '@notepro/shared'

interface Props {
  onClose: () => void
}

export default function DailyReview({ onClose }: Props) {
  const { state, dispatch } = useStore()

  const todayNotes = useMemo(() => {
    const today = new Date().toDateString()
    return state.notes
      .filter(n => !n.deletedAt && new Date(n.updatedAt).toDateString() === today)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [state.notes])

  const totalWords = useMemo(() => {
    return todayNotes.reduce((acc, n) => acc + extractText(n.content).replace(/\s+/g, '').length, 0)
  }, [todayNotes])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    todayNotes.forEach(n => n.tags.forEach(t => set.add(t)))
    return Array.from(set)
  }, [todayNotes])

  // 随机回顾一条旧笔记
  const randomOld = useMemo(() => {
    const old = state.notes.filter(n => !n.deletedAt && !n.hidden && new Date(n.updatedAt).toDateString() !== new Date().toDateString())
    return old.length > 0 ? old[Math.floor(Math.random() * old.length)] : null
  }, [state.notes])

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 460, maxHeight: '80vh', background: 'var(--bg-elevated)',
        borderRadius: 14, border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        animation: 'fadeIn 150ms ease-out',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px', borderBottom: '1px solid var(--border-light)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}>
              今日回顾
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-num)', marginTop: 4 }}>
              {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, color: 'var(--text-faint)', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 24px 24px', overflow: 'auto', flex: 1 }}>
          {/* Stats */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <div style={{ flex: 1, padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-num)' }}>{todayNotes.length}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>笔记</div>
            </div>
            <div style={{ flex: 1, padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-num)' }}>{totalWords}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>字</div>
            </div>
            <div style={{ flex: 1, padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-num)' }}>{allTags.length}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>标签</div>
            </div>
          </div>

          {/* Today's notes */}
          {todayNotes.length > 0 ? (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-num)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                今天的记录
              </div>
              {todayNotes.map(note => (
                <div
                  key={note.id}
                  onClick={() => { dispatch({ type: 'SET_ACTIVE_NOTE', noteId: note.id }); onClose() }}
                  style={{
                    padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
                    marginBottom: 4, transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)', marginBottom: 2 }}>
                    {note.title || getPreview(note.content, 40) || '无标题'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-num)' }}>
                    {new Date(note.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    {note.tags.length > 0 && ` · ${note.tags.slice(0, 3).map(t => '#' + t).join(' ')}`}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-faint)', fontSize: 13 }}>
              今天还没有记录，开始写点什么吧
            </div>
          )}

          {/* Random old note */}
          {randomOld && (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-num)', letterSpacing: 1, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 }}>
                ◈ 随机回忆
              </div>
              <div
                onClick={() => { dispatch({ type: 'SET_ACTIVE_NOTE', noteId: randomOld.id }); onClose() }}
                style={{
                  padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                  background: 'var(--bg-secondary)', borderLeft: '3px solid var(--accent)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)', marginBottom: 4 }}>
                  {randomOld.title || getPreview(randomOld.content, 50) || '无标题'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-num)' }}>
                  {new Date(randomOld.createdAt).toLocaleDateString('zh-CN')}
                </div>
              </div>
            </>
          )}

          {/* New note button */}
          <button
            onClick={() => { dispatch({ type: 'CREATE_NOTE' }); onClose() }}
            style={{
              width: '100%', marginTop: 20, padding: '10px 0',
              background: 'var(--accent)', color: 'white',
              border: 'none', borderRadius: 8, fontSize: 13,
              fontFamily: 'var(--font-sans)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <span>✦</span> 继续记录
          </button>
        </div>
      </div>
    </div>
  )
}