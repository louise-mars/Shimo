import { useState } from 'react'
import { useStore } from '../../store'

export default function MobileFolders() {
  const { state, dispatch } = useStore()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderEmoji, setNewFolderEmoji] = useState('📁')

  const emojis = ['📁', '📝', '💼', '🎯', '💡', '📚', '🔬', '🎨', '🏠', '💻', '📱', '🎵', '🍕', '✈️', '🌟', '❤️']

  const createFolder = () => {
    if (!newFolderName.trim()) return
    
    const folder = {
      id: crypto.randomUUID(),
      name: newFolderName.trim(),
      emoji: newFolderEmoji,
      parentId: null,
      order: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    
    dispatch({ type: 'CREATE_FOLDER', folder })
    setNewFolderName('')
    setNewFolderEmoji('📁')
    setShowCreateForm(false)
  }

  const deleteFolder = (folderId: string) => {
    if (folderId === 'default') return
    
    const folder = state.folders.find(f => f.id === folderId)
    if (!folder) return
    
    const notesInFolder = state.notes.filter(n => n.folderId === folderId)
    
    let message = `确定要删除文件夹"${folder.name}"吗？`
    if (notesInFolder.length > 0) {
      message += `\n\n文件夹中的 ${notesInFolder.length} 条笔记将移动到"所有笔记"。`
    }
    
    if (confirm(message)) {
      dispatch({ type: 'DELETE_FOLDER', folderId })
    }
  }

  const getFolderNoteCount = (folderId: string) => {
    if (folderId === 'default') {
      return state.notes.length
    }
    return state.notes.filter(n => n.folderId === folderId).length
  }

  return (
    <div className="mobile-note-list">
      {/* 顶部工具栏 */}
      <div className="mobile-header">
        <h1 className="mobile-header-title">📁 文件夹</h1>
        <div className="mobile-header-actions">
          <button 
            className="mobile-header-btn" 
            onClick={() => setShowCreateForm(true)}
          >
            ➕
          </button>
        </div>
      </div>

      {/* 文件夹列表 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
        {state.folders.map(folder => (
          <div key={folder.id} className="mobile-note-card">
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px',
                cursor: 'pointer' 
              }}
              onClick={() => dispatch({ type: 'SET_ACTIVE_FOLDER', folderId: folder.id })}
            >
              <div style={{ fontSize: '24px' }}>{folder.emoji}</div>
              <div style={{ flex: 1 }}>
                <div className="mobile-note-title">{folder.name}</div>
                <div className="mobile-note-preview">
                  {getFolderNoteCount(folder.id)} 条笔记
                </div>
              </div>
              {folder.id !== 'default' && (
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-tertiary)',
                    fontSize: '18px',
                    cursor: 'pointer',
                    padding: '8px',
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteFolder(folder.id)
                  }}
                >
                  🗑️
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 创建文件夹模态框 */}
      {showCreateForm && (
        <div className="mobile-modal-overlay" onClick={() => setShowCreateForm(false)}>
          <div className="mobile-modal" onClick={e => e.stopPropagation()}>
            <div className="mobile-modal-header">
              <h3>新建文件夹</h3>
              <button onClick={() => setShowCreateForm(false)}>✕</button>
            </div>
            <div className="mobile-modal-content">
              {/* 选择表情 */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ 
                  fontSize: '14px', 
                  color: 'var(--text-secondary)', 
                  marginBottom: '8px' 
                }}>
                  选择图标
                </div>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(8, 1fr)', 
                  gap: '8px' 
                }}>
                  {emojis.map(emoji => (
                    <button
                      key={emoji}
                      style={{
                        width: '40px',
                        height: '40px',
                        border: newFolderEmoji === emoji ? '2px solid var(--accent-primary)' : '1px solid var(--border-light)',
                        borderRadius: '8px',
                        background: newFolderEmoji === emoji ? 'var(--accent-bg)' : 'var(--bg-elevated)',
                        fontSize: '20px',
                        cursor: 'pointer',
                      }}
                      onClick={() => setNewFolderEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* 输入名称 */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ 
                  fontSize: '14px', 
                  color: 'var(--text-secondary)', 
                  marginBottom: '8px' 
                }}>
                  文件夹名称
                </div>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="输入文件夹名称"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--border-light)',
                    borderRadius: '8px',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '16px',
                  }}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      createFolder()
                    }
                  }}
                />
              </div>

              {/* 操作按钮 */}
              <div style={{ 
                display: 'flex', 
                gap: '12px', 
                justifyContent: 'flex-end' 
              }}>
                <button
                  style={{
                    padding: '12px 20px',
                    border: '1px solid var(--border-light)',
                    borderRadius: '8px',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setShowCreateForm(false)}
                >
                  取消
                </button>
                <button
                  style={{
                    padding: '12px 20px',
                    border: 'none',
                    borderRadius: '8px',
                    background: 'var(--accent-primary)',
                    color: 'white',
                    cursor: 'pointer',
                    opacity: newFolderName.trim() ? 1 : 0.5,
                  }}
                  onClick={createFolder}
                  disabled={!newFolderName.trim()}
                >
                  创建
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}