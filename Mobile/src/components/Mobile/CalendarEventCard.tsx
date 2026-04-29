import { useState } from 'react'
import type { ParsedEvent } from '../../lib/dateParser'
import { formatEventDate } from '../../lib/dateParser'
import { addEventToCalendar } from '../../lib/calendar'

interface Props {
  events: ParsedEvent[]
  onDismiss: () => void
}

export default function CalendarEventCard({ events, onDismiss }: Props) {
  const [adding, setAdding] = useState<number | null>(null)
  const [done, setDone] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const handleAdd = async (event: ParsedEvent, index: number) => {
    setAdding(index)
    setError(null)
    const result = await addEventToCalendar(event)
    setAdding(null)

    if (result.success) {
      setDone(prev => new Set(prev).add(index))
      // 全部添加完后自动关闭
      if (done.size + 1 >= events.length) {
        setTimeout(onDismiss, 800)
      }
    } else {
      if (result.error === 'web_env') {
        setError('请在手机上使用此功能')
      } else if (result.error === 'permission_denied') {
        setError('需要日历权限，请在设置中开启')
      } else {
        setError('添加失败，请重试')
      }
    }
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 80,
      left: 16,
      right: 16,
      zIndex: 200,
      animation: 'slideUpCard 0.25s ease-out',
    }}>
      <style>{`
        @keyframes slideUpCard {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      <div style={{
        background: 'var(--bg-elevated)',
        borderRadius: 12,
        border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }}>
        {/* 头部 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px 8px',
          borderBottom: events.length > 1 ? '1px solid var(--border-light)' : 'none',
        }}>
          <span style={{
            fontSize: 12,
            color: 'var(--text-faint)',
            fontFamily: 'var(--font-sans)',
            letterSpacing: 0.5,
          }}>
            📅 检测到日程
          </span>
          <button
            onClick={onDismiss}
            style={{
              border: 'none', background: 'none',
              color: 'var(--text-faint)', fontSize: 16,
              cursor: 'pointer', padding: '2px 4px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* 事件列表 */}
        {events.map((event, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: i < events.length - 1 ? '1px solid var(--border-light)' : 'none',
            gap: 12,
          }}>
            {/* 事件信息 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 15,
                fontWeight: 500,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-serif)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginBottom: 3,
              }}>
                {event.title || '日程'}
              </div>
              <div style={{
                fontSize: 12,
                color: 'var(--text-faint)',
                fontFamily: 'var(--font-num)',
              }}>
                {formatEventDate(event.date, event.hasTime)}
              </div>
            </div>

            {/* 操作按钮 */}
            {done.has(i) ? (
              <span style={{
                fontSize: 13,
                color: 'var(--success)',
                fontFamily: 'var(--font-sans)',
              }}>
                ✓ 已添加
              </span>
            ) : (
              <button
                onClick={() => handleAdd(event, i)}
                disabled={adding === i}
                style={{
                  border: 'none',
                  background: 'var(--ink)',
                  color: 'var(--bg-primary)',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: 13,
                  fontFamily: 'var(--font-sans)',
                  cursor: adding === i ? 'default' : 'pointer',
                  opacity: adding === i ? 0.6 : 1,
                  flexShrink: 0,
                  transition: 'opacity 0.2s',
                }}
              >
                {adding === i ? '添加中…' : '加入日历'}
              </button>
            )}
          </div>
        ))}

        {/* 错误提示 */}
        {error && (
          <div style={{
            padding: '8px 16px',
            fontSize: 12,
            color: 'var(--danger)',
            fontFamily: 'var(--font-sans)',
            borderTop: '1px solid var(--border-light)',
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
