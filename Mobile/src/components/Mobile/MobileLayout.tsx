import { type ReactNode } from 'react'

type MobileView = 'notes' | 'folders' | 'settings' | 'editor'

interface MobileLayoutProps {
  children: ReactNode
  currentView: MobileView
  onViewChange: (view: MobileView) => void
  showBottomNav: boolean
}

export default function MobileLayout({ 
  children, 
  currentView, 
  onViewChange, 
  showBottomNav 
}: MobileLayoutProps) {
  const navItems = [
    { id: 'notes' as const, icon: '📜', label: '笔墨' },
    { id: 'folders' as const, icon: '🗂', label: '卷宗' },
    { id: 'settings' as const, icon: '⚙️', label: '设置' },
  ]

  return (
    <div className="mobile-app">
      <div className="mobile-content">
        {children}
      </div>
      
      {showBottomNav && (
        <nav className="mobile-bottom-nav">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`mobile-nav-item ${currentView === item.id ? 'active' : ''}`}
              onClick={() => onViewChange(item.id)}
            >
              <span className="mobile-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}