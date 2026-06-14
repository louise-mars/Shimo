/**
 * KanbanView — a board view showing task-containing notes organized by status.
 * Columns: 待办 (unchecked tasks) → 进行中 (partially checked) → 已完成 (all checked)
 *
 * Accessible via Command Palette or sidebar.
 */

import { useMemo, useState } from 'react'
import { useAppStore } from '@notepro/shared'
import { getPreview } from '@notepro/shared'
import type { Note } from '@notepro/shared'

interface Props {
  onClose: () => void
}

interface TaskStats {
  total: number
  checked: number
}

interface KanbanCard {
  note: Note
  tasks: TaskStats
  progress: number // 0-100
}

type Column = 'todo' | 'doing' | 'done'

function getTaskStats(content: string): TaskStats | null {
  try {
    let total = 0
    let checked = 0
    const walk = (node: any) => {
      if (node.type === 'taskItem') {
        total++
        if (node.attrs?.checked) checked++
      }
      ;(node.content || []).forEach(walk)
    }
    walk(JSON.parse(content))
    return total > 0 ? { total, checked } : null
  } catch { return null }
}

function getColumn(stats: TaskStats): Column {
  if (stats.checked === 0) return 'todo'
  if (stats.checked === stats.total) return 'done'
  return 'doing'
}

const COLUMNS: Array<{ id: Column; label: string; emoji: string; color: string }> = [
  { id: 'todo', label: '待办', emoji: '○', color: 'var(--text-faint)' },
  { id: 'doing', label: '进行中', emoji: '◐', color: 'var(--accent)' },
  { id: 'done', label: '已完成', emoji: '●', color: 'var(--success)' },
]

export default function KanbanView({ onClose }: Props) {
  const notes = useAppStore((s) => s.notes)
  const setActiveNote = useAppStore((s) => s.setActiveNote)
  const [filterTag, setFilterTag] = useState<string | null>(null)

  // Build kanban cards from notes with tasks
  const { cards, allTags } = useMemo(() => {
    const cards: KanbanCard[] = []
    const tagSet = new Set<string>()

    for (const note of notes) {
      if (note.deletedAt || note.hidden) continue
      const stats = getTaskStats(note.content)
      if (!stats) continue

      // Tag filter
      if (filterTag && !note.tags.includes(filterTag)) continue

      note.tags.forEach(t => tagSet.add(t))
      cards.push({
        note,
        tasks: stats,
        progress: Math.round((stats.checked / stats.total) * 100),
      })
    }

    return { cards, allTags: Array.from(tagSet).sort() }
  }, [notes, filterTag])

  // Group cards by column
  const columns = useMemo(() => {
    const grouped: Record<Column, KanbanCard[]> = { todo: [], doing: [], done: [] }
    for (const card of cards) {
      const col = getColumn(card.tasks)
      grouped[col].push(card)
    }
    // Sort: most recently updated first in each column
    Object.values(grouped).forEach(col => col.sort((a, b) => b.note.updatedAt - a.note.updatedAt))
    return grouped
  }, [cards])

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      role="dialog"
      aria-label="看板视图"
      aria-modal="true"
    >
      <div style={{
        width: 'min(920px, 94vw)', height: 'min(640px, 88vh)',
        background: 'var(--bg-primary)',
        borderRadius: 14, border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fadeIn 200ms ease-out',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border-light)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              fontSize: 16, fontWeight: 600,
              fontFamily: 'var(--font-serif)',
              color: 'var(--text-primary)',
              letterSpacing: 1,
            }}>
              任务看板
            </span>
            <span style={{
              fontSize: 11, color: 'var(--text-faint)',
              fontFamily: 'var(--font-num)',
            }}>
              {cards.length} 条含任务的笔记
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Tag filter */}
            {allTags.length > 0 && (
              <select
                value={filterTag || ''}
                onChange={e => setFilterTag(e.target.value || null)}
                style={{
                  padding: '4px 8px', fontSize: 11,
                  border: '1px solid var(--border-light)',
                  borderRadius: 5, background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-sans)',
                  cursor: 'pointer', outline: 'none',
                }}
              >
                <option value="">所有标签</option>
                {allTags.map(t => (
                  <option key={t} value={t}>#{t}</option>
                ))}
              </select>
            )}
            <button
              onClick={onClose}
              style={{ border: 'none', background: 'none', fontSize: 18, color: 'var(--text-faint)', cursor: 'pointer' }}
              aria-label="关闭"
            >✕</button>
          </div>
        </div>

        {/* Board */}
        <div style={{
          flex: 1, display: 'flex', gap: 12,
          padding: '16px', overflow: 'auto',
        }}>
          {COLUMNS.map(col => (
            <div key={col.id} style={{
              flex: 1, minWidth: 240,
              display: 'flex', flexDirection: 'column',
              background: 'var(--bg-secondary)',
              borderRadius: 10,
              overflow: 'hidden',
            }}>
              {/* Column header */}
              <div style={{
                padding: '12px 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderBottom: '1px solid var(--border-light)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, color: col.color }}>{col.emoji}</span>
                  <span style={{
                    fontSize: 13, fontWeight: 600,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-sans)',
                  }}>
                    {col.label}
                  </span>
                </div>
                <span style={{
                  fontSize: 11, color: 'var(--text-faint)',
                  fontFamily: 'var(--font-num)',
                  background: 'var(--bg-primary)',
                  padding: '2px 7px', borderRadius: 10,
                }}>
                  {columns[col.id].length}
                </span>
              </div>

              {/* Cards */}
              <div style={{
                flex: 1, overflow: 'auto', padding: '8px',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                {columns[col.id].length === 0 && (
                  <div style={{
                    padding: '24px 0', textAlign: 'center',
                    color: 'var(--text-faint)', fontSize: 12,
                    fontFamily: 'var(--font-sans)',
                  }}>
                    暂无
                  </div>
                )}
                {columns[col.id].map(card => (
                  <div
                    key={card.note.id}
                    onClick={() => { setActiveNote(card.note.id); onClose() }}
                    style={{
                      padding: '10px 12px',
                      background: 'var(--bg-elevated)',
                      borderRadius: 8,
                      border: '1px solid var(--border-light)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--accent)'
                      e.currentTarget.style.transform = 'translateY(-1px)'
                      e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border-light)'
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    {/* Title */}
                    <div style={{
                      fontSize: 13, fontWeight: 500,
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-serif)',
                      marginBottom: 4,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {card.note.title || getPreview(card.note.content, 30) || '无标题'}
                    </div>

                    {/* Progress bar */}
                    <div style={{
                      height: 4, borderRadius: 2,
                      background: 'var(--border-light)',
                      marginBottom: 6,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 2,
                        width: `${card.progress}%`,
                        background: card.progress === 100 ? 'var(--success)' : 'var(--accent)',
                        transition: 'width 0.3s ease',
                      }} />
                    </div>

                    {/* Meta */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      fontSize: 10, color: 'var(--text-faint)',
                      fontFamily: 'var(--font-num)',
                    }}>
                      <span>{card.tasks.checked}/{card.tasks.total} 项</span>
                      <span>{card.note.tags.slice(0, 2).map(t => `#${t}`).join(' ')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
