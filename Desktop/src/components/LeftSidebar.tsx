import { useMemo, useState, useCallback } from 'react'
import { useAppStore } from '@notepro/shared/dist/lib/store/createStore'
import type { Folder } from '@notepro/shared'
import type { User } from '@supabase/supabase-js'
import type { SyncStatus } from '../lib/useSync'
import { exportAsJSON, exportAsMarkdown } from '../lib/exportData'
import { IconClock, IconStar } from './Icons'
import OnThisDay from './OnThisDay'

interface Props {
  user: User | null
  syncStatus: SyncStatus
  syncError: string
  isConfigured: boolean
  onSignOut: () => void
  onSync: () => void
  onShowGraph: () => void
  onImport: () => void
  onShowReport: () => void
  onShowSettings: () => void
  onShowDailyReview: () => void
  onShowAskAI: () => void
  onCollapse: () => void
}

export default function LeftSidebar({ syncStatus, syncError, isConfigured, onSync, onShowGraph, onImport, onShowReport, onShowSettings, onShowDailyReview, onShowAskAI, onCollapse }: Props) {
  // Use Zustand store selectors and actions
  const notes = useAppStore((s) => s.notes)
  const folders = useAppStore((s) => s.folders)
  const activeTag = useAppStore((s) => s.activeTag)
  const activeFolderId = useAppStore((s) => s.activeFolderId)
  const setActiveTag = useAppStore((s) => s.setActiveTag)
  const setActiveFolder = useAppStore((s) => s.setActiveFolder)
  const setActiveNote = useAppStore((s) => s.setActiveNote)
  const createNote = useAppStore((s) => s.createNote)
  const renameTag = useAppStore((s) => s.renameTag)

  const [renamingTag, setRenamingTag] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  // Tags sorted by frequency (most used first), only from active (non-deleted) notes
  const tags = useMemo(() => {
    const map = new Map<string, number>()
    notes
      .filter((n) => !n.deletedAt)
      .forEach((n) => n.tags.forEach((t) => map.set(t, (map.get(t) || 0) + 1)))
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [notes])

  // Navigation view counts
  const favCount = useMemo(
    () => notes.filter((n) => n.favorited && !n.deletedAt).length,
    [notes]
  )
  const trashCount = useMemo(
    () => notes.filter((n) => !!n.deletedAt).length,
    [notes]
  )
  const recentCount = useMemo(
    () => notes.filter((n) => !n.deletedAt).length,
    [notes]
  )

  // Build folder tree (root folders sorted by order)
  const rootFolders = useMemo(
    () => folders
      .filter((f) => f.parentId === null)
      .sort((a, b) => a.order - b.order),
    [folders]
  )

  const getChildFolders = useCallback(
    (parentId: string) =>
      folders
        .filter((f) => f.parentId === parentId)
        .sort((a, b) => a.order - b.order),
    [folders]
  )

  const toggleFolderExpand = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }, [])

  const handleFolderClick = useCallback((folderId: string) => {
    // Clear tag filter when selecting a folder
    setActiveTag(null)
    setActiveFolder(activeFolderId === folderId ? null : folderId)
  }, [activeFolderId, setActiveFolder, setActiveTag])

  const handleTagClick = useCallback((tag: string) => {
    // Clear folder filter when selecting a tag
    setActiveFolder(null)
    setActiveTag(activeTag === tag ? null : tag)
  }, [activeTag, setActiveTag, setActiveFolder])

  const handleNavClick = useCallback((tag: string | null) => {
    setActiveFolder(null)
    setActiveTag(tag)
  }, [setActiveTag, setActiveFolder])

  const handleTagRenameComplete = useCallback((oldTag: string, newValue: string) => {
    if (newValue && newValue !== oldTag) {
      renameTag(oldTag, newValue)
    }
    setRenamingTag(null)
  }, [renameTag])

  const syncLabel = syncStatus === 'syncing' ? '同步中…'
    : syncStatus === 'synced' ? '已同步'
    : syncStatus === 'error' ? (syncError || '同步失败')
    : ''

  // Tool button helper
  const toolBtn = (label: string, onClick: () => void) => (
    <button onClick={onClick} title={label} style={{
      flex: 1, height: 38,
      border: 'none', borderRadius: 7,
      background: 'transparent',
      color: 'var(--text-faint)',
      cursor: 'pointer', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-sans)', fontSize: 13,
      transition: 'all 0.15s', letterSpacing: 0.5,
    }}>{label}</button>
  )

  // Render a folder tree node recursively
  const renderFolder = (folder: Folder, depth: number = 0) => {
    const children = getChildFolders(folder.id)
    const hasChildren = children.length > 0
    const isExpanded = expandedFolders.has(folder.id)
    const isActive = activeFolderId === folder.id

    return (
      <div key={folder.id}>
        <button
          onClick={() => handleFolderClick(folder.id)}
          style={{
            width: '100%',
            padding: `6px 10px 6px ${10 + depth * 16}px`,
            border: 'none', borderRadius: 6,
            background: isActive ? 'var(--bg-active)' : 'transparent',
            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
            fontFamily: 'var(--font-sans)', fontSize: 12,
            cursor: 'pointer', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 6,
            fontWeight: isActive ? 500 : 400,
            transition: 'all 0.15s',
          }}
        >
          {hasChildren && (
            <span
              onClick={(e) => { e.stopPropagation(); toggleFolderExpand(folder.id) }}
              style={{
                fontSize: 10, width: 14, textAlign: 'center',
                color: 'var(--text-faint)', cursor: 'pointer',
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s',
                display: 'inline-block',
              }}
            >
              ▶
            </span>
          )}
          {!hasChildren && <span style={{ width: 14 }} />}
          <span style={{ fontSize: 14, lineHeight: 1 }}>{folder.emoji || '📁'}</span>
          <span style={{
            overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', flex: 1,
          }}>
            {folder.name}
          </span>
        </button>
        {hasChildren && isExpanded && (
          <div>
            {children.map((child) => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside role="navigation" aria-label="侧边栏" style={{
      width: 220, minWidth: 180, maxWidth: 260,
      height: '100vh',
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border-light)',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0, overflow: 'hidden',
      userSelect: 'none',
    }}>

      {/* Logo + 折叠按钮 */}
      <div style={{ padding: '20px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          fontSize: 20, fontWeight: 700,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-serif)',
          letterSpacing: 4,
          paddingBottom: 10,
          borderBottom: '2px solid var(--accent)',
          display: 'inline-block',
        }}>
          拾墨
        </div>
        <button
          onClick={onCollapse}
          title="隐藏侧边栏 (Ctrl+B)"
          style={{
            width: 32, height: 32, border: 'none', borderRadius: 6,
            background: 'transparent', color: 'var(--text-faint)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, transition: 'all 0.15s', opacity: 0.5,
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--bg-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.background = 'transparent' }}
        >◁</button>
      </div>

      {/* 新建按钮 */}
      <div style={{ padding: '14px 12px 8px' }}>
        <button
          onClick={() => createNote(activeFolderId)}
          style={{
            width: '100%', padding: '11px 14px',
            background: 'var(--accent)', color: 'white',
            border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 500,
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer', letterSpacing: 0.5,
            display: 'flex', alignItems: 'center', gap: 8,
            transition: 'all 0.15s',
            boxShadow: '0 2px 8px rgba(181, 52, 26, 0.2)',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.boxShadow = '0 3px 12px rgba(181, 52, 26, 0.3)' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(181, 52, 26, 0.2)' }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>✦</span>
          新建笔记
        </button>
      </div>

      {/* 导航视图 */}
      <nav style={{ padding: '2px 8px' }}>
        <div style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-num)', letterSpacing: 1, textTransform: 'uppercase', padding: '6px 8px 4px' }}>
          视图
        </div>
        {[
          { label: '最近', tag: null, count: recentCount, icon: <IconClock size={15} /> },
          ...(favCount > 0 ? [{ label: '收藏', tag: '__fav', count: favCount, icon: <IconStar size={15} /> }] : []),
          ...(trashCount > 0 ? [{ label: '回收站', tag: '__trash', count: trashCount, icon: <IconClock size={15} /> }] : []),
        ].map(item => (
          <button
            key={item.label}
            onClick={() => handleNavClick(item.tag)}
            style={{
              width: '100%', padding: '7px 10px',
              border: 'none', borderRadius: 6,
              background: activeTag === item.tag && !activeFolderId ? 'var(--bg-active)' : 'transparent',
              color: activeTag === item.tag && !activeFolderId ? 'var(--accent)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-sans)', fontSize: 13,
              cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontWeight: activeTag === item.tag && !activeFolderId ? 500 : 400,
              transition: 'all 0.15s',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {item.icon}
              {item.label}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-num)' }}>
              {item.count}
            </span>
          </button>
        ))}
      </nav>

      {/* 可滚动区域：文件夹 + 标签 + On This Day */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 8px', minHeight: 0 }}>

        {/* 文件夹树 */}
        {rootFolders.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-num)', letterSpacing: 1, textTransform: 'uppercase', padding: '8px 8px 4px' }}>
              文件夹
            </div>
            {rootFolders.map((folder) => renderFolder(folder))}
          </>
        )}

        {/* 标签列表 */}
        {tags.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-num)', letterSpacing: 1, textTransform: 'uppercase', padding: '8px 8px 4px' }}>
              标签
            </div>
            {tags.map(([tag, count]) => (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  setRenamingTag(tag)
                  setRenameValue(tag)
                }}
                title="双击重命名"
                style={{
                  width: '100%', padding: '6px 10px',
                  border: 'none', borderRadius: 6,
                  background: activeTag === tag ? 'var(--bg-active)' : 'transparent',
                  color: activeTag === tag ? 'var(--accent)' : 'var(--text-tertiary)',
                  fontFamily: 'var(--font-sans)', fontSize: 12,
                  cursor: 'pointer', textAlign: 'left',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'all 0.15s',
                }}
              >
                {renamingTag === tag ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={() => handleTagRenameComplete(tag, renameValue)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleTagRenameComplete(tag, renameValue)
                      if (e.key === 'Escape') setRenamingTag(null)
                    }}
                    onClick={e => e.stopPropagation()}
                    style={{
                      border: '1px solid var(--accent)', borderRadius: 4,
                      padding: '2px 6px', fontSize: 12, width: '100%',
                      background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                      outline: 'none', fontFamily: 'var(--font-sans)',
                    }}
                  />
                ) : (
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    #{tag}
                  </span>
                )}
                <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-num)', flexShrink: 0 }}>
                  {count}
                </span>
              </button>
            ))}
          </>
        )}

        {/* On This Day */}
        <OnThisDay onSelect={(noteId) => setActiveNote(noteId)} />
      </div>

      {/* 底部工具栏 */}
      <div style={{
        padding: '6px 8px 8px',
        borderTop: '1px solid var(--border-light)',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {toolBtn('回顾', onShowDailyReview)}
          {toolBtn('问AI', onShowAskAI)}
          {toolBtn('图谱', onShowGraph)}
          {toolBtn('报告', onShowReport)}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {toolBtn('导入', onImport)}
          {toolBtn('导出', () => {
            const c = confirm('导出为 JSON？\n\n确定 = JSON\n取消 = Markdown')
            if (c) exportAsJSON(notes); else exportAsMarkdown(notes)
          })}
          {toolBtn('设置', onShowSettings)}
        </div>

        {/* 同步状态行 */}
        {isConfigured && syncLabel && (
          <button onClick={onSync} title="点击同步" style={{
            width: '100%', padding: '4px 8px',
            border: 'none', borderRadius: 4, background: 'transparent',
            color: 'var(--text-faint)', fontFamily: 'var(--font-num)', fontSize: 10,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: syncStatus === 'syncing' ? 'var(--accent)'
                : syncStatus === 'synced' ? 'var(--success)'
                : syncStatus === 'error' ? 'var(--danger)'
                : 'var(--text-faint)',
              animation: syncStatus === 'syncing' ? 'pulse 1s infinite' : 'none',
            }} />
            {syncLabel}
          </button>
        )}
      </div>
    </aside>
  )
}
