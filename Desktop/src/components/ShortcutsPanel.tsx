import { useEffect } from 'react'

const shortcuts = [
  { key: 'Ctrl + N', desc: '新建笔记' },
  { key: 'Ctrl + T', desc: '选择模板新建' },
  { key: 'Ctrl + D', desc: '切换主题' },
  { key: 'Ctrl + /', desc: '快捷键帮助' },
  { key: '/', desc: '命令菜单（编辑器内）' },
  { key: 'Ctrl + Z', desc: '撤销' },
  { key: 'Ctrl + Shift + Z', desc: '重做' },
  { key: 'Esc', desc: '关闭编辑器 / 面板' },
]

interface Props {
  onClose: () => void
}

export default function ShortcutsPanel({ onClose }: Props) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        animation: 'fadeIn 150ms ease-out',
      }}
    >
      <div 
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-elevated)',
          borderRadius: 12,
          padding: '20px 24px',
          minWidth: 320,
          maxWidth: '90vw',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}>
          <h2 style={{
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-serif)',
            margin: 0,
          }}>
            快捷键
          </h2>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              color: 'var(--text-faint)',
              fontSize: 18,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shortcuts.map(s => (
            <div
              key={s.key}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 0',
                borderBottom: '1px solid var(--border-light)',
              }}
            >
              <span style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-sans)',
              }}>
                {s.desc}
              </span>
              <kbd style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                fontSize: 11,
                fontFamily: 'var(--font-num)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-light)',
                borderRadius: 4,
                color: 'var(--text-primary)',
              }}>
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}