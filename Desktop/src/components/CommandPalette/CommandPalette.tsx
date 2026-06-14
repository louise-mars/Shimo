import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useAppStore } from '@notepro/shared'
import { pinyinMatch, getPreview } from '@notepro/shared'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CommandItem {
  id: string
  type: 'note' | 'tag' | 'action'
  title: string
  subtitle?: string
  icon: string
  action: () => void
}

interface Props {
  onClose: () => void
  onShowGraph: () => void
  onShowReport: () => void
  onShowSettings: () => void
  onShowDailyReview: () => void
  onShowAskAI: () => void
  onShowImport: () => void
  onShowTemplates: () => void
  onShowFocusMode: () => void
  onShowThemePicker: () => void
  onShowKanban: () => void
  onShowSearch: () => void
  onShowImageGallery: () => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CommandPalette({
  onClose,
  onShowGraph,
  onShowReport,
  onShowSettings,
  onShowDailyReview,
  onShowAskAI,
  onShowImport,
  onShowTemplates,
  onShowFocusMode,
  onShowThemePicker,
  onShowKanban,
  onShowSearch,
  onShowImageGallery,
}: Props) {
  const notes = useAppStore((s) => s.notes)
  const setActiveNote = useAppStore((s) => s.setActiveNote)
  const setActiveTag = useAppStore((s) => s.setActiveTag)
  const createNote = useAppStore((s) => s.createNote)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const toggleNoteList = useAppStore((s) => s.toggleNoteList)

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Build commands list
  const actions: CommandItem[] = useMemo(() => [
    { id: 'new-note', type: 'action', title: '新建笔记', subtitle: 'Ctrl+N', icon: '✦', action: () => { createNote(); onClose() } },
    { id: 'new-template', type: 'action', title: '从模板新建', subtitle: 'Ctrl+T', icon: '📋', action: () => { onShowTemplates(); onClose() } },
    { id: 'toggle-theme', type: 'action', title: '切换主题', subtitle: 'Ctrl+D', icon: '🌓', action: () => { toggleTheme(); onClose() } },
    { id: 'show-graph', type: 'action', title: '打开思维图', icon: '🕸', action: () => { onShowGraph(); onClose() } },
    { id: 'show-report', type: 'action', title: '查看报告', icon: '📊', action: () => { onShowReport(); onClose() } },
    { id: 'show-review', type: 'action', title: '今日回顾', icon: '🌙', action: () => { onShowDailyReview(); onClose() } },
    { id: 'ask-ai', type: 'action', title: '问 AI', icon: '🤖', action: () => { onShowAskAI(); onClose() } },
    { id: 'import', type: 'action', title: '导入笔记', icon: '📥', action: () => { onShowImport(); onClose() } },
    { id: 'settings', type: 'action', title: '设置', icon: '⚙', action: () => { onShowSettings(); onClose() } },
    { id: 'toggle-sidebar', type: 'action', title: '切换侧边栏', subtitle: 'Ctrl+B', icon: '◁', action: () => { toggleSidebar(); onClose() } },
    { id: 'toggle-list', type: 'action', title: '切换笔记列表', subtitle: 'Ctrl+\\', icon: '▷', action: () => { toggleNoteList(); onClose() } },
    { id: 'focus-mode', type: 'action', title: '专注模式', subtitle: 'Ctrl+Shift+F', icon: '🧘', action: () => { onShowFocusMode(); onClose() } },
    { id: 'theme-picker', type: 'action', title: '配色方案', icon: '🎨', action: () => { onShowThemePicker(); onClose() } },
    { id: 'kanban', type: 'action', title: '任务看板', icon: '📋', action: () => { onShowKanban(); onClose() } },
    { id: 'search', type: 'action', title: '高级搜索', subtitle: 'Ctrl+F', icon: '🔍', action: () => { onShowSearch(); onClose() } },
    { id: 'image-gallery', type: 'action', title: '图片库', icon: '🖼', action: () => { onShowImageGallery(); onClose() } },
  ], [createNote, toggleTheme, toggleSidebar, toggleNoteList, onClose, onShowGraph, onShowReport, onShowSettings, onShowDailyReview, onShowAskAI, onShowImport, onShowTemplates, onShowFocusMode, onShowThemePicker, onShowKanban, onShowSearch, onShowImageGallery])

  // Build filtered results
  const results: CommandItem[] = useMemo(() => {
    const q = query.trim()
    if (!q) {
      // Show recent notes + all actions
      const recentNotes: CommandItem[] = notes
        .filter(n => !n.deletedAt && !n.hidden)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5)
        .map(n => ({
          id: `note-${n.id}`,
          type: 'note' as const,
          title: n.title || getPreview(n.content, 40) || '无标题',
          subtitle: n.tags.length > 0 ? n.tags.slice(0, 3).map(t => `#${t}`).join(' ') : undefined,
          icon: '📝',
          action: () => { setActiveNote(n.id); onClose() },
        }))
      return [...recentNotes, ...actions]
    }

    // Filter notes by query (title + content + tags + pinyin)
    const matchingNotes: CommandItem[] = notes
      .filter(n => !n.deletedAt && !n.hidden)
      .filter(n => {
        if (pinyinMatch(n.title, q)) return true
        if (n.tags.some(t => pinyinMatch(t, q))) return true
        // Content search (lightweight)
        if (n.title.toLowerCase().includes(q.toLowerCase())) return true
        try {
          const text = getPreview(n.content, 200)
          if (text.toLowerCase().includes(q.toLowerCase())) return true
        } catch { /* skip */ }
        return false
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 10)
      .map(n => ({
        id: `note-${n.id}`,
        type: 'note' as const,
        title: n.title || getPreview(n.content, 40) || '无标题',
        subtitle: n.tags.length > 0 ? n.tags.slice(0, 3).map(t => `#${t}`).join(' ') : undefined,
        icon: '📝',
        action: () => { setActiveNote(n.id); onClose() },
      }))

    // Filter tags
    const tagSet = new Map<string, number>()
    notes.filter(n => !n.deletedAt).forEach(n => n.tags.forEach(t => tagSet.set(t, (tagSet.get(t) || 0) + 1)))
    const matchingTags: CommandItem[] = Array.from(tagSet.entries())
      .filter(([tag]) => pinyinMatch(tag, q))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({
        id: `tag-${tag}`,
        type: 'tag' as const,
        title: `#${tag}`,
        subtitle: `${count} 条笔记`,
        icon: '🏷',
        action: () => { setActiveTag(tag); onClose() },
      }))

    // Filter actions
    const matchingActions = actions.filter(a => pinyinMatch(a.title, q))

    return [...matchingNotes, ...matchingTags, ...matchingActions]
  }, [query, notes, actions, setActiveNote, setActiveTag, onClose])

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [results.length, query])

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (results[selectedIndex]) {
          results[selectedIndex].action()
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [results, selectedIndex, onClose])

  // Type label
  const typeLabel = (type: CommandItem['type']) => {
    switch (type) {
      case 'note': return '笔记'
      case 'tag': return '标签'
      case 'action': return '操作'
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh',
      }}
      role="dialog"
      aria-label="命令面板"
      aria-modal="true"
    >
      <div
        style={{
          width: 520, maxHeight: '60vh',
          background: 'var(--bg-elevated)',
          borderRadius: 14,
          border: '1px solid var(--border-light)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          animation: 'commandPaletteIn 150ms ease-out',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 16, color: 'var(--text-faint)', flexShrink: 0 }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索笔记、标签或操作…"
            aria-label="搜索命令"
            style={{
              flex: 1, border: 'none', background: 'transparent',
              fontSize: 15, color: 'var(--text-primary)',
              outline: 'none', fontFamily: 'var(--font-sans)',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                border: 'none', background: 'none',
                color: 'var(--text-faint)', fontSize: 14, cursor: 'pointer',
              }}
              aria-label="清除搜索"
            >✕</button>
          )}
        </div>

        {/* Results list */}
        <div
          ref={listRef}
          style={{
            overflow: 'auto', padding: '6px',
            flex: 1,
          }}
          role="listbox"
        >
          {results.length === 0 && (
            <div style={{
              padding: '24px 0', textAlign: 'center',
              color: 'var(--text-faint)', fontSize: 13,
              fontFamily: 'var(--font-sans)',
            }}>
              无匹配结果
            </div>
          )}
          {results.map((item, idx) => (
            <div
              key={item.id}
              role="option"
              aria-selected={idx === selectedIndex}
              onClick={() => item.action()}
              onMouseEnter={() => setSelectedIndex(idx)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '9px 12px', borderRadius: 8,
                cursor: 'pointer',
                background: idx === selectedIndex ? 'var(--bg-active)' : 'transparent',
                transition: 'background 80ms ease',
              }}
            >
              <span style={{ fontSize: 16, width: 24, textAlign: 'center', flexShrink: 0 }}>
                {item.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 500,
                  color: 'var(--text-primary)',
                  fontFamily: item.type === 'note' ? 'var(--font-serif)' : 'var(--font-sans)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {item.title}
                </div>
                {item.subtitle && (
                  <div style={{
                    fontSize: 11, color: 'var(--text-faint)',
                    fontFamily: 'var(--font-num)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {item.subtitle}
                  </div>
                )}
              </div>
              <span style={{
                fontSize: 10, color: 'var(--text-faint)',
                fontFamily: 'var(--font-num)',
                padding: '2px 6px',
                background: 'var(--bg-secondary)',
                borderRadius: 3,
                flexShrink: 0,
              }}>
                {item.subtitle && item.type === 'action' ? item.subtitle : typeLabel(item.type)}
              </span>
            </div>
          ))}
        </div>

        {/* Footer hints */}
        <div style={{
          padding: '8px 14px',
          borderTop: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', gap: 12,
          fontSize: 11, color: 'var(--text-faint)',
          fontFamily: 'var(--font-num)',
        }}>
          <span>↑↓ 导航</span>
          <span>↵ 选择</span>
          <span>Esc 关闭</span>
        </div>
      </div>

      <style>{`
        @keyframes commandPaletteIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
