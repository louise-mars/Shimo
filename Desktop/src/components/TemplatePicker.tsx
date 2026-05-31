import { useAppStore } from '@notepro/shared'
import { v4 as uuid } from 'uuid'
import type { Note } from '@notepro/shared'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

const timeNow = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const makeNote = (title: string, content: object, tags: string[]): Note => ({
  id: uuid(), title, content: JSON.stringify(content),
  tags, folderId: null, pinned: false, favorited: false,
  locked: false, hidden: false, deletedAt: null,
  createdAt: Date.now(), updatedAt: Date.now(),
})

const templates = [
  {
    id: 'blank', name: '空白笔记', icon: '📝',
    create: () => makeNote('', { type: 'doc', content: [] }, []),
  },
  {
    id: 'daily', name: '今日日记', icon: '🌸',
    create: () => makeNote(today(), {
      type: 'doc', content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🌅 今晨' }] },
        { type: 'paragraph', content: [] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🔥 今日要事' }] },
        { type: 'taskList', content: [
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
        ]},
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🌙 今日小结' }] },
        { type: 'paragraph', content: [] },
      ]
    }, ['日记']),
  },
  {
    id: 'meeting', name: '会议记录', icon: '📋',
    create: () => makeNote(`会议记录 · ${today()}`, {
      type: 'doc', content: [
        { type: 'paragraph', content: [{ type: 'text', text: `时间：${today()} ${timeNow()}` }] },
        { type: 'paragraph', content: [{ type: 'text', text: '参与人：' }] },
        { type: 'horizontalRule' },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '议题' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
        ]},
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '行动项' }] },
        { type: 'taskList', content: [
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
        ]},
      ]
    }, ['会议']),
  },
  {
    id: 'todo', name: '待办清单', icon: '✅',
    create: () => makeNote('待办', {
      type: 'doc', content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🔴 紧急' }] },
        { type: 'taskList', content: [
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
        ]},
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🟡 重要' }] },
        { type: 'taskList', content: [
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
        ]},
      ]
    }, ['待办']),
  },
]

interface Props { onClose: () => void }

/**
 * Determines whether the template picker should be shown for new users.
 * Returns true if the total number of non-deleted notes is <= 3.
 */
export function shouldShowTemplatePicker(): boolean {
  const notes = useAppStore.getState().notes
  const activeNotes = notes.filter(n => !n.deletedAt)
  return activeNotes.length <= 3
}

export default function TemplatePicker({ onClose }: Props) {
  const importNotes = useAppStore((s) => s.importNotes)
  const setActiveNote = useAppStore((s) => s.setActiveNote)

  const handleSelect = (tpl: typeof templates[0]) => {
    const note = tpl.create()
    importNotes([note])
    setActiveNote(note.id)
    onClose()
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 360, background: 'var(--bg-elevated)', borderRadius: 14,
        border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden', animation: 'fadeIn 120ms ease-out',
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border-light)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}>选择模板</span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, color: 'var(--text-faint)', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {templates.map(tpl => (
            <button
              key={tpl.id}
              onClick={() => handleSelect(tpl)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', border: 'none', borderRadius: 8,
                background: 'transparent', cursor: 'pointer',
                textAlign: 'left', width: '100%', transition: 'background 0.1s',
                fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: 22 }}>{tpl.icon}</span>
              <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{tpl.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
