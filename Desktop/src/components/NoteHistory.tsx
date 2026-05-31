import { useState, useEffect } from 'react'
import { getHistory, forceSnapshot, type NoteSnapshot } from '@notepro/shared'
import type { Note } from '@notepro/shared'

interface Props {
  note: Note
  onRestore: (content: string) => void
  onClose: () => void
}

export default function NoteHistory({ note, onRestore, onClose }: Props) {
  const [snapshots, setSnapshots] = useState<NoteSnapshot[]>([])
  const [selected, setSelected] = useState<NoteSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getHistory(note.id).then(s => {
      setSnapshots(s)
      setLoading(false)
    })
  }, [note.id])

  const handleRestore = async () => {
    if (!selected) return
    // Save current version as a snapshot before restoring
    await forceSnapshot(note.id, note.title, note.content, 0)
    onRestore(selected.content)
    onClose()
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = d.toDateString() === yesterday.toDateString()

    const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    if (isToday) return `今天 ${time}`
    if (isYesterday) return `昨天 ${time}`
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' ' + time
  }

  const getPreview = (content: string): string => {
    try {
      const doc = JSON.parse(content)
      const texts: string[] = []
      const walk = (node: any) => {
        if (node.text) texts.push(node.text)
        if (node.content) node.content.forEach(walk)
      }
      walk(doc)
      return texts.join('').slice(0, 120) || '(空)'
    } catch {
      return '(无法预览)'
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.4)',
    }} onClick={onClose}>
      <div style={{
        width: 560, maxHeight: '80vh', background: 'var(--bg-primary)',
        borderRadius: 14, boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}>
              版本历史
            </h3>
            <span style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-sans)' }}>
              {note.title || '无标题'} · {snapshots.length} 个版本
            </span>
          </div>
          <button onClick={onClose} style={{
            border: 'none', background: 'none', color: 'var(--text-faint)',
            fontSize: 20, cursor: 'pointer',
          }}>✕</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex' }}>
          {/* Snapshot list */}
          <div style={{
            width: 200, borderRight: '1px solid var(--border-light)',
            overflow: 'auto', flexShrink: 0,
          }}>
            {loading && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
                加载中…
              </div>
            )}
            {!loading && snapshots.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
                暂无历史版本
                <br /><br />
                <span style={{ fontSize: 11 }}>编辑 5 分钟后自动保存快照</span>
              </div>
            )}
            {snapshots.map((s, i) => (
              <div
                key={s.createdAt}
                onClick={() => setSelected(s)}
                style={{
                  padding: '10px 14px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border-light)',
                  background: selected?.createdAt === s.createdAt ? 'var(--accent-light)' : 'transparent',
                  transition: 'background 0.1s',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
                  {formatTime(s.createdAt)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2, fontFamily: 'var(--font-num)' }}>
                  {s.wordCount} 字
                  {i === 0 && <span style={{ marginLeft: 6, color: 'var(--accent)', fontSize: 10 }}>最新</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Preview */}
          <div style={{ flex: 1, padding: 20, overflow: 'auto' }}>
            {!selected ? (
              <div style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 13, marginTop: 40 }}>
                ← 选择一个版本预览
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 12, fontFamily: 'var(--font-num)' }}>
                  {new Date(selected.createdAt).toLocaleString('zh-CN')} · {selected.wordCount} 字
                </div>
                <div style={{
                  fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-sans)', whiteSpace: 'pre-wrap',
                  background: 'var(--bg-secondary)', borderRadius: 8, padding: 16,
                  maxHeight: 300, overflow: 'auto',
                }}>
                  {getPreview(selected.content)}
                  {selected.content.length > 120 && (
                    <span style={{ color: 'var(--text-faint)' }}>…</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border-light)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', border: '1px solid var(--border-light)',
            borderRadius: 6, background: 'var(--bg-primary)', color: 'var(--text-secondary)',
            fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}>取消</button>
          <button
            onClick={handleRestore}
            disabled={!selected}
            style={{
              padding: '8px 16px', border: 'none', borderRadius: 6,
              background: selected ? 'var(--accent)' : 'var(--bg-secondary)',
              color: selected ? 'white' : 'var(--text-faint)',
              fontSize: 13, cursor: selected ? 'pointer' : 'default',
              fontFamily: 'var(--font-sans)',
            }}
          >恢复此版本</button>
        </div>
      </div>
    </div>
  )
}
