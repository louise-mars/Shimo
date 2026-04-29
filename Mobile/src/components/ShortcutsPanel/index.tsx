import { X } from 'lucide-react'

const shortcuts = [
  { category: 'General', items: [
    ['Ctrl+N', 'New note'],
    ['Ctrl+Shift+N', 'New from template'],
    ['Ctrl+K', 'Global search'],
    ['Ctrl+\\', 'Toggle sidebar'],
    ['Ctrl+I', 'Note info'],
    ['Ctrl+Shift+F', 'Zen mode'],
    ['Ctrl+?', 'Keyboard shortcuts'],
  ]},
  { category: 'Editor', items: [
    ['/', 'Slash commands'],
    ['Ctrl+B', 'Bold'],
    ['Ctrl+I', 'Italic'],
    ['Ctrl+Shift+X', 'Strikethrough'],
    ['Ctrl+E', 'Inline code'],
    ['Ctrl+Shift+H', 'Highlight'],
    ['Ctrl+Z', 'Undo'],
    ['Ctrl+Shift+Z', 'Redo'],
  ]},
  { category: 'Markdown Shortcuts', items: [
    ['# + Space', 'Heading 1'],
    ['## + Space', 'Heading 2'],
    ['- + Space', 'Bullet list'],
    ['1. + Space', 'Numbered list'],
    ['[] + Space', 'To-do item'],
    ['> + Space', 'Blockquote'],
    ['``` + Enter', 'Code block'],
    ['---', 'Divider'],
  ]},
]

export default function ShortcutsPanel({ onClose }: { onClose: () => void }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10vh',
      }}>
      <div style={{
        width: 520, maxHeight: '75vh', background: 'var(--bg-elevated)', borderRadius: 14,
        border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden', animation: 'fadeIn 150ms ease-out',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-light)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Keyboard Shortcuts</span>
          <button className="icon-btn" onClick={onClose} style={{ width: 28, height: 28 }}><X size={16} /></button>
        </div>

        <div style={{ overflow: 'auto', padding: '12px 20px 20px' }}>
          {shortcuts.map(group => (
            <div key={group.category} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                {group.category}
              </div>
              {group.items.map(([key, desc]) => (
                <div key={key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '5px 0', fontSize: 13,
                }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{desc}</span>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {key.split('+').map((k, i) => (
                      <span key={i} className="kbd" style={{ fontSize: 11, padding: '2px 6px' }}>{k.trim()}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
