import { useEffect } from 'react'

interface ShortcutGroup {
  title: string
  shortcuts: { key: string; desc: string }[]
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: '全局',
    shortcuts: [
      { key: 'Ctrl + N', desc: '新建笔记' },
      { key: 'Ctrl + T', desc: '选择模板新建' },
      { key: 'Ctrl + D', desc: '切换主题' },
      { key: 'Ctrl + /', desc: '快捷键帮助' },
      { key: 'Ctrl + B', desc: '折叠/展开侧边栏' },
      { key: 'Ctrl + \\', desc: '折叠/展开笔记列表' },
      { key: 'Esc', desc: '关闭面板 / 取消选中' },
    ],
  },
  {
    title: '编辑器',
    shortcuts: [
      { key: 'Ctrl + K', desc: '插入/编辑链接' },
      { key: '/', desc: '命令菜单（行首输入）' },
      { key: 'Ctrl + Z', desc: '撤销' },
      { key: 'Ctrl + Shift + Z', desc: '重做' },
      { key: 'Ctrl + B', desc: '加粗' },
      { key: 'Ctrl + I', desc: '斜体' },
      { key: 'Ctrl + U', desc: '下划线' },
    ],
  },
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
      role="dialog"
      aria-modal="true"
      aria-label="快捷键参考"
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
          padding: '24px 28px',
          minWidth: 360,
          maxWidth: '90vw',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
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
            aria-label="关闭"
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

        {shortcutGroups.map((group, gi) => (
          <div key={group.title} style={{ marginBottom: gi < shortcutGroups.length - 1 ? 20 : 0 }}>
            <h3 style={{
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--text-faint)',
              fontFamily: 'var(--font-sans)',
              textTransform: 'uppercase',
              letterSpacing: 1,
              margin: '0 0 8px 0',
            }}>
              {group.title}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {group.shortcuts.map(s => (
                <div
                  key={s.key + s.desc}
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
                    whiteSpace: 'nowrap',
                  }}>
                    {s.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
