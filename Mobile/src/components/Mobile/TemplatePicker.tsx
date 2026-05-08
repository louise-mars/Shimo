import { useStore } from '../../store'
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

interface Props {
  onClose: () => void
  onCreated: () => void
}

export default function TemplatePicker({ onClose, onCreated }: Props) {
  const { dispatch } = useStore()

  const handleSelect = (tpl: typeof templates[0]) => {
    const note = tpl.create()
    dispatch({ type: 'IMPORT_NOTES', notes: [note] })
    onCreated()
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 400,
        background: 'var(--bg-elevated)',
        borderRadius: '16px 16px 0 0',
        padding: '16px 0 env(safe-area-inset-bottom)',
        animation: 'fadeUp 150ms ease-out',
      }}>
        <div style={{
          padding: '0 20px 12px',
          fontSize: 16, fontWeight: 600,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-serif)',
        }}>选择模板</div>

        {templates.map(tpl => (
          <button
            key={tpl.id}
            onClick={() => handleSelect(tpl)}
            style={{
              width: '100%', padding: '14px 20px',
              border: 'none', background: 'none',
              display: 'flex', alignItems: 'center', gap: 14,
              cursor: 'pointer', textAlign: 'left',
              borderBottom: '1px solid var(--border-light)',
            }}
          >
            <span style={{ fontSize: 24 }}>{tpl.icon}</span>
            <span style={{ fontSize: 15, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
              {tpl.name}
            </span>
          </button>
        ))}

        <button onClick={onClose} style={{
          width: '100%', padding: '14px 20px', marginTop: 8,
          border: 'none', background: 'none',
          color: 'var(--text-faint)', fontSize: 14,
          fontFamily: 'var(--font-sans)', cursor: 'pointer',
          textAlign: 'center',
        }}>取消</button>
      </div>
    </div>
  )
}
