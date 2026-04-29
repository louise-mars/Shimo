import { useState, useEffect } from 'react'
import type { RelatedNote } from '../../lib/relations'
import { getNudgeText } from '../../lib/relations'

interface Props {
  related: RelatedNote[]
  onSelectNote: (noteId: string) => void
}

export default function CognitiveNudge({ related, onSelectNote }: Props) {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  // 延迟出现，不打断输入
  useEffect(() => {
    if (related.length === 0) { setVisible(false); return }
    const t = setTimeout(() => setVisible(true), 800)
    return () => clearTimeout(t)
  }, [related.map(r => r.note.id).join(',')])

  const activeNudges = related.filter(r => !dismissed.has(r.note.id))
  if (!visible || activeNudges.length === 0) return null

  // 只显示最相关的一条
  const top = activeNudges[0]

  return (
    <div style={{
      position: 'absolute',
      bottom: 56, // 在语音栏上方
      left: 16,
      right: 16,
      zIndex: 100,
      animation: 'nudgeIn 0.3s ease-out',
    }}>
      <style>{`
        @keyframes nudgeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-light)',
        borderRadius: 10,
        boxShadow: 'var(--shadow-md)',
      }}>
        {/* 关联强度指示点 */}
        <div style={{
          width: 6, height: 6,
          borderRadius: '50%',
          background: top.score > 0.6 ? 'var(--accent-deep)' : 'var(--accent)',
          flexShrink: 0,
          opacity: 0.7,
        }} />

        {/* 提示文字 */}
        <div
          style={{
            flex: 1,
            fontSize: 12,
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
            lineHeight: 1.4,
          }}
          onClick={() => onSelectNote(top.note.id)}
        >
          {getNudgeText(top)}
          <span style={{
            marginLeft: 6,
            color: 'var(--accent-deep)',
            fontWeight: 500,
          }}>
            {top.note.title || '查看'}
          </span>
        </div>

        {/* 关闭 */}
        <button
          onClick={() => setDismissed(prev => new Set(prev).add(top.note.id))}
          style={{
            border: 'none', background: 'none',
            color: 'var(--text-faint)', fontSize: 14,
            cursor: 'pointer', padding: '2px 4px',
            lineHeight: 1, flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* 如果有多条，显示数量提示 */}
      {activeNudges.length > 1 && (
        <div style={{
          textAlign: 'center',
          fontSize: 10,
          color: 'var(--text-faint)',
          fontFamily: 'var(--font-num)',
          marginTop: 4,
        }}>
          还有 {activeNudges.length - 1} 条相关
        </div>
      )}
    </div>
  )
}
