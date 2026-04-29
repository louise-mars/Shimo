import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { SyncStatus } from '../../lib/useSync'
import { useStore } from '../../store'
import { isAIConfigured } from '../../lib/ai'
import { getReviewHour, setReviewHour } from '../../lib/review'

interface Props {
  user: User | null
  syncStatus: SyncStatus
  isConfigured: boolean
  onSignIn: () => void
  onSignOut: () => void
  onSync: () => void
  onGoToAISettings: () => void
  onGoToAsk: () => void
}

export default function SettingsPage({ user, syncStatus, isConfigured, onSignIn, onSignOut, onSync, onGoToAISettings, onGoToAsk }: Props) {
  const { state, dispatch } = useStore()
  const aiConfigured = isAIConfigured()
  const [reviewHour, setReviewHourState] = useState(getReviewHour())

  const handleReviewHourChange = (hour: number) => {
    setReviewHour(hour)
    setReviewHourState(hour)
  }

  const sections = [
    {
      title: 'AI',
      rows: [
        {
          label: 'AI 设置',
          value: aiConfigured ? '已配置 ✓' : '未配置',
          action: onGoToAISettings,
        },
        {
          label: '问我的笔记',
          value: '→',
          action: onGoToAsk,
          disabled: !aiConfigured,
        },
      ],
    },
    {
      title: '同步',
      rows: [
        {
          label: user ? `已登录 · ${user.email?.split('@')[0]}` : '登录同步',
          value: user ? '退出' : '→',
          action: user ? onSignOut : onSignIn,
        },
        {
          label: '立即同步',
          value: syncStatus === 'syncing' ? '同步中…' : syncStatus === 'synced' ? '已同步' : '→',
          action: onSync,
          disabled: !isConfigured || syncStatus === 'syncing',
        },
      ],
    },
    {
      title: '外观',
      rows: [
        {
          label: '深色模式',
          value: state.theme === 'dark' ? '开' : '关',
          action: () => dispatch({ type: 'TOGGLE_THEME' }),
        },
      ],
    },
    {
      title: '通知',
      rows: [
        {
          label: '今日回顾时间',
          value: `${reviewHour}:00`,
          action: () => {
            // 循环切换时间：21 -> 20 -> 19 -> ... -> 18
            const newHour = reviewHour > 18 ? 18 : reviewHour - 1
            handleReviewHourChange(newHour === 18 ? 21 : newHour)
          },
        },
      ],
    },
    {
      title: '数据',
      rows: [
        {
          label: '回收站',
          value: `${state.notes.filter(n => !!n.deletedAt).length} 条`,
          action: () => {
            // Navigate to trash view - dispatch a special tag
            dispatch({ type: 'SET_ACTIVE_FOLDER', folderId: '__trash' as any })
          },
        },
      ],
    },
    {
      title: '使用帮助',
      rows: [
        { label: '输入 / 唤出命令菜单', value: '标题、列表、代码块…' },
        { label: '输入 #标签 自动识别', value: '自动归类' },
        { label: '底部语音栏', value: '长按或点击录音' },
        { label: '笔记数', value: `${state.notes.filter(n => !n.deletedAt).length} 条` },
        { label: '版本', value: 'v0.1.0' },
      ],
    },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <span className="page-title">设置</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {sections.map(section => (
          <div key={section.title} style={{ marginBottom: 8 }}>
            <div className="mobile-settings-section-title" style={{ padding: '12px 20px 4px' }}>
              {section.title}
            </div>
            <div style={{ padding: '0 20px' }}>
              {section.rows.map((row, i) => (
                <button
                  key={i}
                  className="settings-row"
                  onClick={'action' in row ? (row as { action: () => void }).action : undefined}
                  disabled={'disabled' in row ? (row as { disabled: boolean }).disabled : false}
                >
                  <span className="settings-label">{row.label}</span>
                  <span className="settings-value" style={{
                    color: row.value?.includes('✓') ? 'var(--success)' : undefined,
                  }}>
                    {row.value}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="settings-footer">
          <p>拾墨 · 记录此刻</p>
          <p style={{ marginTop: 4, fontSize: 11, opacity: 0.4 }}>v1.0.0</p>
        </div>
      </div>
    </div>
  )
}
