import { useState, useRef } from 'react'
import { useStore } from '../../store'
import { exportAllNotes } from '@notepro/shared'
import {
  FileText, Clock, Pin, Star, FolderPlus, ChevronLeft, ChevronRight,
  Moon, Sun, Download, Upload, LayoutTemplate, Trash2, GripVertical
} from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Folder } from '@notepro/shared'

function SortableFolder({ folder, isActive, noteCount, onSelect, onRename, onDelete, children }: {
  folder: Folder; isActive: boolean; noteCount: number
  onSelect: () => void; onRename: () => void; onDelete: () => void
  children?: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: folder.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div ref={setNodeRef} style={style}>
      <div className={`sidebar-item ${isActive ? 'active' : ''}`} onClick={onSelect} onDoubleClick={onRename}>
        <span {...attributes} {...listeners} style={{ cursor: 'grab', display: 'flex', opacity: 0.3 }}>
          <GripVertical size={12} />
        </span>
        <span style={{ fontSize: 15, width: 18, textAlign: 'center', flexShrink: 0 }}>{folder.emoji}</span>
        <span className="sidebar-item-label">{folder.name}</span>
        <span className="count">{noteCount}</span>
        {isActive && (
          <button className="icon-btn" onClick={e => { e.stopPropagation(); onDelete() }}
            style={{ width: 20, height: 20 }} title="Delete folder">
            <Trash2 size={11} />
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

export default function Sidebar({ onNewTemplate, onImport, syncSlot }: { onNewTemplate?: () => void; onImport?: () => void; syncSlot?: React.ReactNode }) {
  const { state, dispatch } = useStore()
  const [addingFolder, setAddingFolder] = useState(false)
  const [addingSubfolder, setAddingSubfolder] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const allCount = state.notes.length
  const favCount = state.notes.filter(n => n.favorited).length
  const pinnedCount = state.notes.filter(n => n.pinned).length
  const recentCount = state.notes.filter(n => Date.now() - n.updatedAt < 7 * 24 * 60 * 60 * 1000).length

  const folderNoteCount = (folderId: string) =>
    state.notes.filter(n => n.folderId === folderId).length

  const topFolders = state.folders.filter(f => f.id !== 'default' && !f.parentId)
  const getChildren = (parentId: string) => state.folders.filter(f => f.parentId === parentId)

  const toggleExpand = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleAddFolder = (parentId: string | null = null) => {
    if (newFolderName.trim()) {
      dispatch({ type: 'CREATE_FOLDER', folder: { id: crypto.randomUUID(), name: newFolderName.trim(), emoji: '📁', parentId } })
      if (parentId) setExpandedFolders(prev => new Set(prev).add(parentId))
      setNewFolderName(''); setAddingFolder(false); setAddingSubfolder(null)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = topFolders.map(f => f.id)
    const oldIndex = ids.indexOf(active.id as string)
    const newIndex = ids.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return
    const newIds = [...ids]
    newIds.splice(oldIndex, 1)
    newIds.splice(newIndex, 0, active.id as string)
    // Include child folders
    const allIds = newIds.flatMap(id => [id, ...getChildren(id).map(c => c.id)])
    dispatch({ type: 'REORDER_FOLDERS', ids: allIds })
  }

  // Drop note onto folder
  const handleNoteDrop = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault()
    const noteId = e.dataTransfer.getData('noteId')
    if (noteId) dispatch({ type: 'MOVE_NOTE_TO_FOLDER', noteId, folderId })
  }

  const smartGroups = [
    { id: null, label: 'All Notes', icon: <FileText size={18} />, count: allCount },
    { id: '__recent', label: 'Recent', icon: <Clock size={18} />, count: recentCount },
    { id: '__pinned', label: 'Pinned', icon: <Pin size={18} />, count: pinnedCount },
    { id: '__favorites', label: 'Favorites', icon: <Star size={18} />, count: favCount },
  ]

  const renderFolder = (folder: Folder) => {
    const children = getChildren(folder.id)
    const hasChildren = children.length > 0
    const isExpanded = expandedFolders.has(folder.id)
    const isActive = state.activeFolderId === folder.id

    if (renamingId === folder.id) {
      return (
        <div key={folder.id} className="add-folder-row" style={{ paddingLeft: folder.parentId ? 28 : 8 }}>
          <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && renameValue.trim()) { dispatch({ type: 'UPDATE_FOLDER', folderId: folder.id, name: renameValue.trim() }); setRenamingId(null) }
              if (e.key === 'Escape') setRenamingId(null)
            }}
            onBlur={() => setRenamingId(null)}
          />
        </div>
      )
    }

    return (
      <SortableFolder key={folder.id} folder={folder} isActive={isActive}
        noteCount={folderNoteCount(folder.id)}
        onSelect={() => dispatch({ type: 'SET_ACTIVE_FOLDER', folderId: folder.id })}
        onRename={() => { setRenamingId(folder.id); setRenameValue(folder.name) }}
        onDelete={() => dispatch({ type: 'DELETE_FOLDER', folderId: folder.id })}
      >
        {/* Expand/collapse + subfolder toggle */}
        {isActive && !folder.parentId && (
          <div style={{ display: 'flex', gap: 2, paddingLeft: 32, paddingBottom: 2 }}>
            {hasChildren && (
              <button className="icon-btn" onClick={() => toggleExpand(folder.id)} style={{ width: 20, height: 20 }}>
                {isExpanded ? <ChevronRight size={11} style={{ transform: 'rotate(90deg)' }} /> : <ChevronRight size={11} />}
              </button>
            )}
            <button className="icon-btn" onClick={() => { setAddingSubfolder(folder.id); setNewFolderName('') }}
              style={{ width: 20, height: 20 }} title="Add subfolder">
              <FolderPlus size={11} />
            </button>
          </div>
        )}
        {/* Children */}
        {isExpanded && children.map(child => (
          <div key={child.id} style={{ paddingLeft: 16 }}
            onDragOver={e => e.preventDefault()} onDrop={e => handleNoteDrop(e, child.id)}>
            <div className={`sidebar-item ${state.activeFolderId === child.id ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'SET_ACTIVE_FOLDER', folderId: child.id })}
              onDoubleClick={() => { setRenamingId(child.id); setRenameValue(child.name) }}>
              <span style={{ fontSize: 13, width: 16, textAlign: 'center', flexShrink: 0 }}>{child.emoji}</span>
              <span className="sidebar-item-label" style={{ fontSize: 12 }}>{child.name}</span>
              <span className="count">{folderNoteCount(child.id)}</span>
            </div>
          </div>
        ))}
        {/* Add subfolder input */}
        {addingSubfolder === folder.id && (
          <div className="add-folder-row" style={{ paddingLeft: 28 }}>
            <input autoFocus placeholder="Subfolder..." value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddFolder(folder.id); if (e.key === 'Escape') setAddingSubfolder(null) }}
              onBlur={() => { if (!newFolderName.trim()) setAddingSubfolder(null) }}
            />
          </div>
        )}
      </SortableFolder>
    )
  }

  return (
    <aside className={`sidebar ${state.sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="logo-dot" />
          <span>拾墨</span>
        </div>
        <button className="icon-btn" onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })} title="Toggle sidebar">
          <ChevronLeft size={18} />
        </button>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title"><span className="sidebar-item-label">Smart Groups</span></div>
        {smartGroups.map(g => (
          <div key={g.id ?? 'all'} className={`sidebar-item ${state.activeFolderId === g.id ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_ACTIVE_FOLDER', folderId: g.id })}
            onDragOver={e => e.preventDefault()} onDrop={e => handleNoteDrop(e, null)}>
            {g.icon}
            <span className="sidebar-item-label">{g.label}</span>
            <span className="count">{g.count}</span>
          </div>
        ))}
      </div>

      <div className="sidebar-section" style={{ flex: 1, overflow: 'auto' }}>
        <div className="sidebar-section-title">
          <span className="sidebar-item-label">Folders</span>
          <button className="icon-btn" onClick={() => { setAddingFolder(true); setNewFolderName('') }} style={{ width: 24, height: 24 }}>
            <FolderPlus size={14} />
          </button>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={topFolders.map(f => f.id)} strategy={verticalListSortingStrategy}>
            {topFolders.map(folder => (
              <div key={folder.id} onDragOver={e => e.preventDefault()} onDrop={e => handleNoteDrop(e, folder.id)}>
                {renderFolder(folder)}
              </div>
            ))}
          </SortableContext>
        </DndContext>

        {addingFolder && (
          <div className="add-folder-row">
            <input autoFocus placeholder="Folder name..." value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddFolder(null); if (e.key === 'Escape') setAddingFolder(false) }}
              onBlur={() => { if (!newFolderName.trim()) setAddingFolder(false) }}
            />
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        {/* Sync panel — full width row */}
        {syncSlot && (
          <div className="sidebar-footer-full">{syncSlot}</div>
        )}
        {/* Icon row */}
        <div className="sidebar-footer-full sidebar-footer-icons">
          <button className="icon-btn" onClick={() => dispatch({ type: 'TOGGLE_THEME' })} title={state.theme === 'light' ? 'Dark mode' : 'Light mode'}>
            {state.theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          <button className="icon-btn" onClick={onImport} title="Import notes">
            <Download size={17} />
          </button>
          <button className="icon-btn" onClick={onNewTemplate} title="New from template">
            <LayoutTemplate size={17} />
          </button>
          <button className="icon-btn" onClick={() => exportAllNotes(state.notes)} title="Export all notes">
            <Upload size={17} />
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept=".md,.txt,.markdown" multiple style={{ display: 'none' }} />
      </div>
    </aside>
  )
}
