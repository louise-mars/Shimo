import { useMemo, useState } from 'react'
import { useAppStore } from '@notepro/shared/dist/lib/store/createStore'
import { extractText } from '@notepro/shared'

type Period = 'week' | 'month'

interface Props {
  onClose: () => void
}

export default function WeeklyReport({ onClose }: Props) {
  const notes = useAppStore((s) => s.notes)
  const [period, setPeriod] = useState<Period>('week')

  const report = useMemo(() => {
    const now = Date.now()
    const days = period === 'week' ? 7 : 30
    const cutoff = now - days * 86400000
    const periodNotes = notes.filter(n => !n.deletedAt && n.updatedAt >= cutoff)

    // Aggregate stats
    const totalNotes = periodNotes.length
    const totalWords = periodNotes.reduce((acc, n) => {
      return acc + extractText(n.content).replace(/\s+/g, '').length
    }, 0)
    const avgPerDay = days > 0 ? Math.round(totalNotes / days) : 0

    // Tag frequency
    const tagMap = new Map<string, number>()
    periodNotes.forEach(n => n.tags.forEach(t => tagMap.set(t, (tagMap.get(t) || 0) + 1)))
    const topTags = Array.from(tagMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    // Daily distribution: generate all days in the period
    const dailyMap = new Map<string, number>()
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now - i * 86400000)
      const key = date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
      dailyMap.set(key, 0)
    }
    periodNotes.forEach(n => {
      const day = new Date(n.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
      if (dailyMap.has(day)) {
        dailyMap.set(day, (dailyMap.get(day) || 0) + 1)
      }
    })
    const dailyData = Array.from(dailyMap.entries())

    // Most active day
    const maxDay = dailyData.reduce(
      (max, d) => d[1] > max[1] ? d : max,
      ['', 0] as [string, number]
    )

    return { totalNotes, totalWords, avgPerDay, topTags, dailyData, maxDay }
  }, [notes, period])

  const periodLabel = period === 'week' ? '本周' : '本月'
  const maxBarValue = Math.max(...report.dailyData.map(d => d[1]), 1)

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-label={`${periodLabel}报告`}
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        width: 520, background: 'var(--bg-elevated)', borderRadius: 14,
        border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden', animation: 'fadeIn 150ms ease-out',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
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
            {/* Week/Month toggle */}
            <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="时间范围切换">
              {(['week', 'month'] as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  aria-pressed={period === p}
                  style={{
                    padding: '3px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
                    border: '1px solid var(--border-light)',
                    background: period === p ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: period === p ? 'white' : 'var(--text-tertiary)',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  {p === 'week' ? '周' : '月'}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            style={{ border: 'none', background: 'none', fontSize: 18, color: 'var(--text-faint)', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflow: 'auto', flex: 1 }}>
          {/* Aggregate stats cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div style={{ padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-num)' }}>
                {report.totalNotes}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>笔记数</div>
            </div>
            <div style={{ padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-num)' }}>
                {report.totalWords}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>总字数</div>
            </div>
            <div style={{ padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-num)' }}>
                {report.avgPerDay}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>日均笔记</div>
            </div>
          </div>

          {/* Daily distribution bar chart */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>
              每日分布
            </div>
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: period === 'week' ? 8 : 2,
              height: 100, padding: '0 4px',
            }}>
              {report.dailyData.map(([day, count]) => {
                const isMax = day === report.maxDay[0] && count > 0
                const barHeight = maxBarValue > 0 ? (count / maxBarValue) * 80 : 0
                return (
                  <div
                    key={day}
                    style={{
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    }}
                    title={`${day}: ${count} 条笔记`}
                  >
                    <span style={{
                      fontSize: 9, color: 'var(--text-faint)', fontFamily: 'var(--font-num)',
                      visibility: count > 0 ? 'visible' : 'hidden',
                    }}>
                      {count}
                    </span>
                    <div style={{
                      width: '100%',
                      height: Math.max(barHeight, count > 0 ? 4 : 2),
                      borderRadius: 3,
                      background: isMax ? 'var(--accent)' : count > 0 ? 'var(--accent-muted, rgba(var(--accent-rgb, 99,102,241), 0.5))' : 'var(--border-light)',
                      transition: 'height 0.3s ease',
                      boxShadow: isMax ? '0 0 6px var(--accent)' : 'none',
                    }} />
                    {period === 'week' && (
                      <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'var(--font-num)' }}>
                        {day}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            {/* Most active day highlight */}
            {report.maxDay[0] && report.maxDay[1] > 0 && (
              <div style={{
                fontSize: 11, color: 'var(--text-tertiary)', marginTop: 10,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>★</span>
                最活跃：{report.maxDay[0]}（{report.maxDay[1]} 条笔记）
              </div>
            )}
          </div>

          {/* Top 5 tags */}
          {report.topTags.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>
                热门标签 Top 5
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {report.topTags.map(([tag, count], idx) => (
                  <span key={tag} style={{
                    padding: '4px 10px', borderRadius: 4,
                    background: idx === 0 ? 'var(--accent)' : 'var(--bg-secondary)',
                    fontSize: 12,
                    color: idx === 0 ? 'white' : 'var(--text-secondary)',
                    fontFamily: 'var(--font-sans)',
                  }}>
                    #{tag} <span style={{
                      color: idx === 0 ? 'rgba(255,255,255,0.7)' : 'var(--text-faint)',
                      fontFamily: 'var(--font-num)',
                    }}>×{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
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
