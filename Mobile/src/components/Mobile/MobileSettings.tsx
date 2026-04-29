import type { User } from '@supabase/supabase-js'
import type { SyncStatus } from '../../lib/useSync'

interface MobileSettingsProps {
  user: User | null
  syncStatus: SyncStatus
  isConfigured: boolean
  onSignIn: () => void
  onSignOut: () => void
  onSync: () => void
  onImport: () => void
}

export default function MobileSettings({
  user,
  syncStatus,
  isConfigured,
  onSignIn,
  onSignOut,
  onSync,
  onImport,
}: MobileSettingsProps) {
  const settingSections = [
    {
      title: '同步设置',
      items: [
        {
          icon: '☁️',
          label: user ? `已登录: ${user.email}` : '登录账户',
          action: user ? onSignOut : onSignIn,
          description: user ? '点击退出登录' : '登录以同步数据',
        },
        {
          icon: '🔄',
          label: '立即同步',
          action: onSync,
          description: '手动同步笔记数据',
          disabled: !isConfigured || syncStatus === 'syncing',
        },
      ],
    },
    {
      title: '数据管理',
      items: [
        {
          icon: '📥',
          label: '导入笔记',
          action: onImport,
          description: '从文件导入笔记',
        },
        {
          icon: '📤',
          label: '导出笔记',
          action: () => {
            // 导出功能
            alert('导出功能开发中...')
          },
          description: '导出所有笔记',
        },
      ],
    },
    {
      title: '应用设置',
      items: [
        {
          icon: '🌙',
          label: '深色模式',
          action: () => {
            // 切换主题
            document.documentElement.classList.toggle('dark')
          },
          description: '切换应用主题',
        },
        {
          icon: '🔤',
          label: '字体大小',
          action: () => {
            alert('字体设置开发中...')
          },
          description: '调整编辑器字体大小',
        },
      ],
    },
    {
      title: '关于',
      items: [
        {
          icon: 'ℹ️',
          label: '拾墨 Shimo',
          action: () => {
            alert('拾墨 v1.0.0\n\n以墨为问，拾起散落的思绪\n\n一款有氛围感的私人书写工具')
          },
          description: '版本信息',
        },
        {
          icon: '📖',
          label: '使用帮助',
          action: () => {
            alert('使用帮助开发中...')
          },
          description: '查看使用说明',
        },
      ],
    },
  ]

  const getSyncStatusText = () => {
    switch (syncStatus) {
      case 'syncing':
        return '同步中...'
      case 'error':
        return '同步失败'
      default:
        return '立即同步'
    }
  }

  return (
    <div className="mobile-note-list">
      {/* 顶部工具栏 */}
      <div className="mobile-header">
        <h1 className="mobile-header-title">⚙️ 设置</h1>
      </div>

      {/* 设置列表 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
        {settingSections.map((section, sectionIndex) => (
          <div key={sectionIndex} style={{ marginBottom: '24px' }}>
            <div style={{
              fontSize: '14px',
              fontWeight: '600',
              color: 'var(--text-secondary)',
              marginBottom: '8px',
              paddingLeft: '16px',
            }}>
              {section.title}
            </div>
            
            {section.items.map((item, itemIndex) => (
              <div
                key={itemIndex}
                className="mobile-note-card"
                onClick={item.disabled ? undefined : item.action}
                style={{
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  opacity: item.disabled ? 0.5 : 1,
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}>
                  <div style={{ fontSize: '24px' }}>{item.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div className="mobile-note-title">
                      {item.label === '立即同步' ? getSyncStatusText() : item.label}
                    </div>
                    <div className="mobile-note-preview">
                      {item.description}
                    </div>
                  </div>
                  <div style={{
                    color: 'var(--text-tertiary)',
                    fontSize: '18px',
                  }}>
                    →
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* 同步状态指示器 */}
        {isConfigured && (
          <div style={{
            padding: '16px',
            background: syncStatus === 'error' ? 'var(--error-bg)' : 'var(--success-bg)',
            border: `1px solid ${syncStatus === 'error' ? 'var(--error-border)' : 'var(--success-border)'}`,
            borderRadius: '12px',
            marginTop: '16px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              color: syncStatus === 'error' ? 'var(--error-text)' : 'var(--success-text)',
            }}>
              <span>{syncStatus === 'error' ? '❌' : '✅'}</span>
              <span>
                {syncStatus === 'error' 
                  ? '同步服务连接失败' 
                  : '同步服务已连接'
                }
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}