import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { extractText } from '@notepro/shared'

type Period = 'week' | 'month'

interface Props {
  onClose: () => void
}

export default function WeeklyReport({ onClose }: Props) {
  const { state } = useStore()
  const [period, setPeriod] = useState<Period>('week')

  const report = useMemo(() => {
    const now = Date.now()
    const cutoff = period === 'week' ? now - 7 * 86400000 : now - 30 * 86400000
    const notes = state.notes.filter(n => n.updatedAt >= cutoff)

    // Stats
    const totalNotes = notes.length
    const totalWords = notes.reduce((acc, n) => {
      return acc + extractText(n.content).replace(/\s+/g, '').length
    }, 0)

    // Tag frequency
    const tagMap = new Map<string, number>()
    notes.forEach(n => n.tags.forEach(t => tagMap.set(t, (tagMap.get(t) || 0) + 1)))
    const topTags = Array.from(tagMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    // Daily distribution
    const dailyMap = new Map<string, number>()
    notes.forEach(n => {
      const day = new Date(n.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
      dailyMap.set(day, (dailyMap.get(day) || 0) + 1)
    })
    const dailyData = Array.from(dailyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))

    // Most active day
    const maxDay = dailyData.reduce((max, d) => d[1] > max[1] ? d : max, ['', 0])

    return { totalNotes, totalWords, topTags, dailyData, maxDay }
  }, [state.notes, period])

  const periodLabel = period === 'week' ? '本周' : '本月'
  const maxBarWidth = Math.max(...report.dailyData.map(d => d[1]), 1)

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <div style={{
        width: 480, background: 'var(--bg-elevated)', borderRadius: 14,
        border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden', animation: 'fadeIn 150ms ease-out',
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-light)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)' }}>
              {periodLabel}报告
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['week', 'month'] as Period[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)} style={{
                  padding: '3px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
                  border: '1px solid var(--border-light)',
                  background: period === p ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: period === p ? 'white' : 'var(--text-tertiary)',
                }}>
                  {p === 'week' ? '周' : '月'}
                </button>
              ))}
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, color: 'var(--text-faint)', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflow: 'auto', flex: 1 }}>
          {/* Stats cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div style={{ padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-num)' }}>{report.totalNotes}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>笔记数</div>
            </div>
            <div style={{ padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-num)' }}>{report.totalWords}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>总字数</div>
            </div>
            <div style={{ padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-num)' }}>{report.topTags.length}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>标签数</div>
            </div>
          </div>

          {/* Daily chart */}
          {report.dailyData.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>每日记录</div>
              {report.dailyData.map(([day, count]) => (
                <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-num)', width: 40, flexShrink: 0 }}>{day}</span>
                  <div style={{
                    height: 16, borderRadius: 3,
                    background: 'var(--accent)',
                    width: `${(count / maxBarWidth) * 100}%`,
                    minWidth: 4,
                    transition: 'width 0.3s ease',
                  }} />
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-num)' }}>{count}</span>
                </div>
              ))}
              {report.maxDay[0] && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
                  最活跃的一天：{report.maxDay[0]}（{report.maxDay[1]} 条）
                </div>
              )}
            </div>
          )}

          {/* Top tags */}
          {report.topTags.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>热门标签</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {report.topTags.map(([tag, count]) => (
                  <span key={tag} style={{
                    padding: '4px 10px', borderRadius: 4,
                    background: 'var(--bg-secondary)', fontSize: 12,
                    color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)',
                  }}>
                    #{tag} <span style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-num)' }}>×{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {report.totalNotes === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-faint)' }}>
              {periodLabel}暂无记录
            </div>
          )}
        </div>
      </div>
    </div>
  )
}