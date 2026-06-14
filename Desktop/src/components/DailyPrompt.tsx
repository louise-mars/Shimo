/**
 * DailyPrompt — generates a morning writing prompt based on recent notes.
 * Shown as a subtle card in the sidebar or as a toast notification.
 *
 * Prompt logic (local, no AI required):
 * 1. Looks at yesterday's notes for unfinished threads
 * 2. Finds uncompleted tasks from recent task lists
 * 3. Surfaces notes from the same day last week/month
 * 4. Generates a contextual prompt in Chinese
 */

import { useMemo, useState } from 'react'
import { useAppStore } from '@notepro/shared'
import { getPreview } from '@notepro/shared'

interface Props {
  onCreateNote: (title: string, content?: string) => void
  onDismiss: () => void
}

interface PromptData {
  text: string
  context?: string
  type: 'unfinished' | 'reflection' | 'continuation' | 'anniversary' | 'generic'
}

const DISMISS_KEY = 'shimo-daily-prompt-dismissed'

export function shouldShowDailyPrompt(): boolean {
  try {
    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (!dismissed) return true
    const dismissedDate = new Date(dismissed).toDateString()
    return dismissedDate !== new Date().toDateString()
  } catch { return true }
}

function dismissToday() {
  localStorage.setItem(DISMISS_KEY, new Date().toISOString())
}

function getUncheckedTasks(content: string): string[] {
  try {
    const tasks: string[] = []
    const walk = (node: any) => {
      if (node.type === 'taskItem' && node.attrs?.checked === false) {
        const text = (node.content || [])
          .map((c: any) => c.content?.map((t: any) => t.text || '').join('') || '')
          .join('')
          .trim()
        if (text) tasks.push(text)
      }
      ;(node.content || []).forEach(walk)
    }
    walk(JSON.parse(content))
    return tasks
  } catch { return [] }
}

export default function DailyPrompt({ onCreateNote, onDismiss }: Props) {
  const notes = useAppStore((s) => s.notes)
  const [dismissed, setDismissed] = useState(false)

  const prompt = useMemo((): PromptData | null => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 86400000).toDateString()
    const lastWeek = new Date(now.getTime() - 7 * 86400000).toDateString()

    const activeNotes = notes.filter(n => !n.deletedAt && !n.hidden)

    // 1. Check for uncompleted tasks from yesterday
    const yesterdayNotes = activeNotes.filter(n =>
      new Date(n.updatedAt).toDateString() === yesterday
    )
    for (const n of yesterdayNotes) {
      const tasks = getUncheckedTasks(n.content)
      if (tasks.length > 0) {
        return {
          text: `昨天「${n.title || '未命名'}」中还有 ${tasks.length} 项未完成，今天继续？`,
          context: tasks.slice(0, 2).map(t => `· ${t}`).join('\n'),
          type: 'unfinished',
        }
      }
    }

    // 2. Anniversary — same day last week
    const lastWeekNotes = activeNotes.filter(n =>
      new Date(n.createdAt).toDateString() === lastWeek
    )
    if (lastWeekNotes.length > 0) {
      const n = lastWeekNotes[0]
      return {
        text: `一周前你写了「${n.title || getPreview(n.content, 20) || '一条笔记'}」，现在想法有变化吗？`,
        context: getPreview(n.content, 60),
        type: 'anniversary',
      }
    }

    // 3. Continuation — most active tag this week
    const weekAgo = now.getTime() - 7 * 86400000
    const thisWeekNotes = activeNotes.filter(n => n.updatedAt >= weekAgo)
    const tagCounts = new Map<string, number>()
    thisWeekNotes.forEach(n => n.tags.forEach(t => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)))
    const topTag = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1])[0]
    if (topTag && topTag[1] >= 2) {
      return {
        text: `这周你在 #${topTag[0]} 上记了 ${topTag[1]} 条，今天有新的想法吗？`,
        type: 'continuation',
      }
    }

    // 4. Reflection if yesterday had notes
    if (yesterdayNotes.length > 0) {
      return {
        text: `昨天记录了 ${yesterdayNotes.length} 条，今天从哪里开始？`,
        type: 'reflection',
      }
    }

    // 5. Generic morning prompt
    const hour = now.getHours()
    if (hour < 12) {
      return { text: '早安，今天想记录点什么？', type: 'generic' }
    } else if (hour < 18) {
      return { text: '午后时光，捕捉一个想法。', type: 'generic' }
    } else {
      return { text: '夜晚安静，回顾今天的思绪。', type: 'generic' }
    }
  }, [notes])

  if (dismissed || !prompt) return null

  const handleDismiss = () => {
    setDismissed(true)
    dismissToday()
    onDismiss()
  }

  const handleCreate = () => {
    onCreateNote('')
    handleDismiss()
  }

  return (
    <div style={{
      margin: '8px 0',
      padding: '10px 12px',
      background: 'var(--accent-light)',
      borderRadius: 8,
      borderLeft: '3px solid var(--accent)',
      animation: 'fadeIn 300ms ease-out',
    }}>
      <div style={{
        fontSize: 12, color: 'var(--text-secondary)',
        fontFamily: 'var(--font-sans)',
        lineHeight: 1.5,
        marginBottom: 6,
      }}>
        {prompt.text}
      </div>

      {prompt.context && (
        <div style={{
          fontSize: 11, color: 'var(--text-faint)',
          fontFamily: 'var(--font-sans)',
          marginBottom: 6,
          whiteSpace: 'pre-line',
          overflow: 'hidden',
          maxHeight: 36,
        }}>
          {prompt.context}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={handleCreate}
          style={{
            padding: '4px 10px', fontSize: 11,
            border: 'none', borderRadius: 4,
            background: 'var(--accent)', color: 'white',
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}
        >
          开始写
        </button>
        <button
          onClick={handleDismiss}
          style={{
            padding: '4px 10px', fontSize: 11,
            border: 'none', borderRadius: 4,
            background: 'transparent', color: 'var(--text-faint)',
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}
        >
          稍后
        </button>
      </div>
    </div>
  )
}
