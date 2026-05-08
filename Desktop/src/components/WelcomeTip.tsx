import { useState } from 'react'

const TIP_KEY = 'shimo-desktop-tip-shown'

export function shouldShowTip(): boolean {
  return !localStorage.getItem(TIP_KEY)
}

export default function WelcomeTip({ onDismiss }: { onDismiss: () => void }) {
  const [visible, setVisible] = useState(true)

  const dismiss = () => {
    localStorage.setItem(TIP_KEY, '1')
    setVisible(false)
    onDismiss()
  }

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 900,
      background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
      borderRadius: 12, padding: '16px 20px', maxWidth: 300,
      boxShadow: 'var(--shadow-lg)', animation: 'fadeIn 300ms ease-out',
    }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)', marginBottom: 8 }}>
        欢迎使用拾墨
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', lineHeight: 1.7, marginBottom: 12 }}>
        <p>• <strong>Ctrl+N</strong> 新建笔记</p>
        <p>• 输入 <strong>/</strong> 唤出命令菜单</p>
        <p>• <strong>Ctrl+B</strong> 折叠侧边栏</p>
        <p>• <strong>Ctrl+/</strong> 查看所有快捷键</p>
      </div>
      <button onClick={dismiss} style={{
        width: '100%', padding: '8px', background: 'var(--accent)', color: 'white',
        border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
      }}>知道了</button>
    </div>
  )
}
