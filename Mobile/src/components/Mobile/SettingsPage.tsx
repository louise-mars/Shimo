import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { SyncStatus } from '../../lib/useSync'
import { useStore } from '../../store'
import { isAIConfigured } from '../../lib/ai'
import { getReviewHour, setReviewHour } from '../../lib/review'
import { isASRConfigured, getASRConfig, setASRConfig } from '../../lib/speechToText'
import { noteToMarkdown } from '@notepro/shared'

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
  const [showTrash, setShowTrash] = useState(false)

  const trashNotes = state.notes.filter(n => !!n.deletedAt)

  const handleReviewHourChange = (hour: number) => {
    setReviewHour(hour)
    setReviewHourState(hour)
  }

  // 回收站视图
  if (showTrash) {
    return (
      <div className="page">
        <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setShowTrash(false)} style={{
            border: 'none', background: 'none', color: 'var(--text-tertiary)',
            fontSize: 18, cursor: 'pointer', padding: '4px 8px',
          }}>←</button>
          <span className="page-title" style={{ borderBottom: 'none', paddingBottom: 0 }}>回收站</span>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
          {trashNotes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-faint)', fontSize: 13 }}>
              回收站为空
            </div>
          ) : (
            <>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', padding: '8px 0', fontFamily: 'var(--font-sans)' }}>
                删除后 30 天自动永久清除
              </p>
              {trashNotes.map(note => (
                <div key={note.id} style={{
                  padding: '12px 0', borderBottom: '1px solid var(--border-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {note.title || '无标题'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-num)', marginTop: 2 }}>
                      {new Date(note.deletedAt!).toLocaleDateString('zh-CN')} 删除
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => dispatch({ type: 'RESTORE_NOTE', noteId: note.id })}
                      style={{ fontSize: 12, color: 'var(--success)', background: 'none', border: '1px solid var(--success)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
                    >恢复</button>
                    <button
                      onClick={() => { if (confirm('永久删除？不可恢复。')) dispatch({ type: 'PERMANENT_DELETE', noteId: note.id }) }}
                      style={{ fontSize: 12, color: 'var(--danger)', background: 'none', border: '1px solid var(--danger)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
                    >删除</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    )
  }

  const asrConfigured = isASRConfigured()
  const [showASRConfig, setShowASRConfig] = useState(false)
  const [asrUrl, setAsrUrl] = useState(() => getASRConfig().apiUrl)
  const [asrKey, setAsrKey] = useState(() => getASRConfig().apiKey)

  // ASR 配置页
  if (showASRConfig) {
    return (
      <div className="page">
        <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setShowASRConfig(false)} style={{
            border: 'none', background: 'none', color: 'var(--text-tertiary)',
            fontSize: 18, cursor: 'pointer', padding: '4px 8px',
          }}>←</button>
          <span className="page-title" style={{ borderBottom: 'none', paddingBottom: 0 }}>语音识别配置</span>
        </div>
        <div style={{ padding: '16px 20px', flex: 1, overflow: 'auto' }}>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16, lineHeight: 1.6 }}>
            语音输入需要在线语音识别服务（ASR）。支持 OpenAI Whisper API 兼容格式。
          </p>

          <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
            API 地址
          </label>
          <input
            value={asrUrl}
            onChange={e => setAsrUrl(e.target.value)}
            placeholder="https://api.siliconflow.cn/v1/audio/transcriptions"
            style={{
              width: '100%', padding: '10px 12px', fontSize: 14,
              border: '1px solid var(--border-medium)', borderRadius: 8,
              background: 'var(--bg-elevated)', color: 'var(--text-primary)',
              outline: 'none', marginBottom: 16, fontFamily: 'var(--font-sans)',
            }}
          />

          <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
            API Key
          </label>
          <input
            type="password"
            value={asrKey}
            onChange={e => setAsrKey(e.target.value)}
            placeholder="sk-..."
            style={{
              width: '100%', padding: '10px 12px', fontSize: 14,
              border: '1px solid var(--border-medium)', borderRadius: 8,
              background: 'var(--bg-elevated)', color: 'var(--text-primary)',
              outline: 'none', marginBottom: 20, fontFamily: 'var(--font-sans)',
            }}
          />

          <button
            onClick={() => {
              setASRConfig({ provider: 'whisper-api', apiUrl: asrUrl, apiKey: asrKey, language: 'zh' })
              setShowASRConfig(false)
            }}
            disabled={!asrUrl || !asrKey}
            style={{
              width: '100%', padding: '12px', fontSize: 15, fontWeight: 500,
              border: 'none', borderRadius: 8, cursor: 'pointer',
              background: asrUrl && asrKey ? 'var(--accent)' : 'var(--bg-secondary)',
              color: asrUrl && asrKey ? 'white' : 'var(--text-faint)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            保存
          </button>

          <div style={{ marginTop: 24, fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.8 }}>
            <p style={{ fontWeight: 500, marginBottom: 8, color: 'var(--text-secondary)' }}>快速填入（点击自动填写地址）：</p>
            {[
              { name: '硅基流动', url: 'https://api.siliconflow.cn/v1/audio/transcriptions', note: '国内直连，注册送额度' },
              { name: '阿里百炼', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/audio/transcriptions', note: '阿里云，稳定' },
              { name: 'Groq', url: 'https://api.groq.com/openai/v1/audio/transcriptions', note: '需翻墙' },
            ].map(s => (
              <button
                key={s.name}
                onClick={() => setAsrUrl(s.url)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 12px', marginBottom: 6,
                  border: asrUrl === s.url ? '1px solid var(--accent)' : '1px solid var(--border-light)',
                  borderRadius: 8, background: asrUrl === s.url ? 'var(--accent-bg)' : 'var(--bg-elevated)',
                  cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                <span style={{ fontWeight: 500 }}>{s.name}</span>
                <span style={{ color: 'var(--text-faint)', marginLeft: 8, fontSize: 11 }}>{s.note}</span>
              </button>
            ))}
            <p style={{ marginTop: 12, fontSize: 11, color: 'var(--text-faint)' }}>
              格式要求：兼容 OpenAI Whisper /v1/audio/transcriptions 接口。
              填入对应平台的 API Key 即可使用。
            </p>
          </div>
        </div>
      </div>
    )
  }

  const sections = [
    {
      title: '语音',
      rows: [
        {
          label: '语音识别 (ASR)',
          value: asrConfigured ? '已配置 ✓' : '未配置',
          action: () => setShowASRConfig(true),
        },
      ],
    },
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
            // 循环：21 → 22 → 20 → 19 → 18 → 21
            const cycle = [21, 22, 20, 19, 18]
            const idx = cycle.indexOf(reviewHour)
            const next = cycle[(idx + 1) % cycle.length]
            handleReviewHourChange(next)
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
          action: () => setShowTrash(true),
        },
        {
          label: '导出为 JSON',
          value: '→',
          action: () => {
            const data = JSON.stringify(state.notes.filter(n => !n.deletedAt), null, 2)
            const blob = new Blob([data], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = `shimo-export-${new Date().toISOString().slice(0,10)}.json`
            a.click(); URL.revokeObjectURL(url)
          },
        },
        {
          label: '导出为 Markdown',
          value: '→',
          action: () => {
            const md = state.notes.filter(n => !n.deletedAt).map(n => `# ${n.title || '无标题'}\n\n${noteToMarkdown(n)}\n\n---\n`).join('\n')
            const blob = new Blob([md], { type: 'text/markdown' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = `shimo-export-${new Date().toISOString().slice(0,10)}.md`
            a.click(); URL.revokeObjectURL(url)
          },
        },
        {
          label: '导入笔记',
          value: '→',
          action: () => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = '.json,.md,.txt'
            input.onchange = async () => {
              const file = input.files?.[0]
              if (!file) return
              const text = await file.text()
              try {
                // Try JSON first
                const data = JSON.parse(text)
                const notes = Array.isArray(data) ? data : [data]
                dispatch({ type: 'IMPORT_NOTES', notes })
                alert(`已导入 ${notes.length} 条笔记`)
              } catch {
                // Treat as markdown/text — create single note
                const note = {
                  id: crypto.randomUUID(), title: file.name.replace(/\.\w+$/, ''),
                  content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }),
                  tags: ['导入'], folderId: null, pinned: false, favorited: false,
                  locked: false, hidden: false, deletedAt: null,
                  createdAt: Date.now(), updatedAt: Date.now(),
                }
                dispatch({ type: 'IMPORT_NOTES', notes: [note] })
                alert('已导入 1 条笔记')
              }
            }
            input.click()
          },
        },
      ],
    },
    {
      title: '关于',
      rows: [
        { label: '笔记数', value: `${state.notes.filter(n => !n.deletedAt).length} 条` },
        { label: '版本', value: 'v1.0.0' },
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
              {section.rows.map((row, i) => {
                const hasAction = 'action' in row && !!(row as any).action
                const isDisabled = 'disabled' in row ? (row as { disabled: boolean }).disabled : false
                const Tag = hasAction ? 'button' : 'div'
                return (
                  <Tag
                    key={i}
                    className="settings-row"
                    onClick={hasAction ? (row as { action: () => void }).action : undefined}
                    disabled={hasAction ? isDisabled : undefined}
                    style={!hasAction ? { cursor: 'default', opacity: 0.8 } : undefined}
                  >
                    <span className="settings-label">{row.label}</span>
                    <span className="settings-value" style={{
                      color: row.value?.includes('✓') ? 'var(--success)' : undefined,
                    }}>
                      {row.value}
                    </span>
                  </Tag>
                )
              })}
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
