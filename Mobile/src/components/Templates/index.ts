import { v4 as uuid } from 'uuid'
import type { Note } from '@notepro/shared'

export type NoteMode = 'writing' | 'meeting' | 'default'

export interface Template {
  id: string
  name: string
  icon: string
  description: string
  mode: NoteMode
  create: (folderId: string | null) => Note & { mode?: NoteMode }
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

const timeNow = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function makeNote(title: string, content: object, tags: string[], folderId: string | null): Note {
  return {
    id: uuid(), title, content: JSON.stringify(content),
    tags, folderId, pinned: false, favorited: false,
    locked: false, hidden: false, deletedAt: null,
    createdAt: Date.now(), updatedAt: Date.now(),
  }
}

export const templates: Template[] = [
  {
    id: 'blank',
    name: '空白笔记',
    icon: '📝',
    description: '从一张白纸开始',
    mode: 'writing',
    create: (folderId) => makeNote('', { type: 'doc', content: [] }, [], folderId),
  },
  {
    id: 'daily',
    name: '今日日记',
    icon: '🌸',
    description: '记录今天的心情与思绪',
    mode: 'writing',
    create: (folderId) => makeNote(
      today(),
      {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🌅 今晨' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🔥 今日要事' }] },
          { type: 'taskList', content: [
            { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
            { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
          ]},
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '💡 想法与灵感' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🌙 今日小结' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '' }] },
        ],
      },
      ['日记'],
      folderId,
    ),
  },
  {
    id: 'meeting',
    name: '会议记录',
    icon: '📋',
    description: '清晰记录，行动项自动高亮',
    mode: 'meeting',
    create: (folderId) => makeNote(
      `会议记录 · ${today()}`,
      {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: `时间：${today()} ${timeNow()}` }] },
          { type: 'paragraph', content: [{ type: 'text', text: '参与人：@' }] },
          { type: 'horizontalRule' },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '议题' }] },
          { type: 'bulletList', content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
          ]},
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '讨论记录' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '行动项' }] },
          { type: 'taskList', content: [
            { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '@负责人 ' }] }] },
          ]},
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '决议' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '' }] },
        ],
      },
      ['会议'],
      folderId,
    ),
  },
  {
    id: 'todo',
    name: '待办清单',
    icon: '✅',
    description: '按优先级整理任务',
    mode: 'default',
    create: (folderId) => makeNote(
      '待办',
      {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🔴 紧急' }] },
          { type: 'taskList', content: [
            { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
          ]},
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🟡 重要' }] },
          { type: 'taskList', content: [
            { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
          ]},
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🟢 待定' }] },
          { type: 'taskList', content: [
            { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
          ]},
        ],
      },
      ['待办'],
      folderId,
    ),
  },
]