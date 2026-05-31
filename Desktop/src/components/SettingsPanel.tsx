import { useState, useEffect, useMemo } from 'react'
import { useAppStore, supabase } from '@notepro/shared'
import { isLockEnabled, enableLock, disableLock, hasPinSet } from './AppLock'
import { clearPin } from '../lib/pinSecurity'

// AI config (shared with Mobile via localStorage)
type AIProvider = 'minimax' | 'kimi' | 'glm' | 'qwen' | 'openrouter'
interface AIConfig { provider: AIProvider; apiKey: string; model: string }
const AI_CONFIG_KEY = 'shimo-ai-config'
const PROVIDERS: Array<{ id: AIProvider; name: string; defaultModel: string }> = [
  { id: 'minimax', name: 'MiniMax', defaultModel: 'MiniMax-Text-01' },
  { id: 'kimi', name: 'Kimi', defaultModel: 'moonshot-v1-8k' },
  { id: 'glm', name: '智谱 GLM', defaultModel: 'glm-4-flash' },
  { id: 'qwen', name: '通义千问', defaultModel: 'qwen-turbo' },
  { id: 'openrouter', name: 'OpenRouter', defaultModel: 'deepseek/deepseek-chat-v3-0324:free' },
]
function loadAI(): AIConfig | null { try { const r = localStorage.getItem(AI_CONFIG_KEY); return r ? JSON.parse(r) : null } catch { return null } }
function saveAI(c: AIConfig) { localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(c)) }
function clearAI() { localStorage.removeItem(AI_CONFIG_KEY) }

/** Estimate word count from TipTap JSON content string */
function estimateWordCount(content: string): number {
  if (!content) return 0
  try {
    // Extract text from TipTap JSON by stripping JSON structure
    const textOnly = content.replace(/"type":"[^"]+"/g, '')
      .replace(/"attrs":\{[^}]*\}/g, '')
      .replace(/[{}\[\]",:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    // Chinese characters count as 1 word each, English words separated by spaces
    const chinese = (textOnly.match(/[\u4e00-\u9fa5]/g) || []).length
    const english = textOnly.replace(/[\u4e00-\u9fa5]/g, ' ').trim().split(/\s+/).filter(w => w.length > 0).length
    return chinese + english
  } catch {
    return 0
  }
}

/** Estimate storage usage from notes content */
function estimateStorageBytes(notes: Array<{ content: string; title: string }>): number {
  return notes.reduce((sum, n) => sum + (n.content?.length || 0) + (n.title?.length || 0), 0) * 2 // UTF-16 estimate
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Props {
  onClose: () => void
  user: import('@supabase/supabase-js').User | null
  syncStatus: string
  syncError: string
  onSync: () => void
  onSignOut: () => void
}

export default function SettingsPanel({ onClose, user, syncStatus, syncError, onSync, onSignOut }: Props) {
  // Use shared Zustand store for theme and notes
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const notes = useAppStore((s) => s.notes)

  const [lockEnabled, setLockEnabled] = useState(isLockEnabled())
  const [pinSet, setPinSet] = useState(hasPinSet())
  const [sbUrl, setSbUrl] = useState(localStorage.getItem('shimo-sb-url') || '')
  const [sbKey, setSbKey] = useState(localStorage.getItem('shimo-sb-key') || '')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [aiConfig, setAiConfig] = useState(loadAI)
  const [aiProvider, setAiProvider] = useState<AIProvider>(aiConfig?.provider || 'minimax')
  const [aiKey, setAiKey] = useState(aiConfig?.apiKey || '')
  const [aiModel, setAiModel] = useState(aiConfig?.model || 'MiniMax-Text-01')
  const [aiSaved, setAiSaved] = useState(false)

  // Computed stats from shared store
  const stats = useMemo(() => {
    const activeNotes = notes.filter(n => !n.deletedAt)
    const totalNotes = activeNotes.length
    const totalTags = new Set(activeNotes.flatMap(n => n.tags)).size
    const totalWords = activeNotes.reduce((sum, n) => sum + estimateWordCount(n.content), 0)
    const storageUsage = estimateStorageBytes(activeNotes)
    return { totalNotes, totalTags, totalWords, storageUsage }
  }, [notes])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleLogin = async () => {
    if (!supabase || !loginEmail || !loginPassword) return
    setLoginLoading(true)
    setLoginError('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword })
      if (error) setLoginError(error.message)
      else window.location.reload()
    } catch (e: unknown) {
      setLoginError((e as Error).message || '登录失败')
    } finally {
      setLoginLoading(false)
    }
  }

  const themeLabel = theme === 'dark' ? '深色' : theme === 'light' ? '浅色' : '跟随系统'

  const sectionTitle = (text: string) => (
    <div style={{
      fontSize: 10, fontWeight: 500, color: 'var(--text-faint)',
      fontFamily: 'var(--font-num)', letterSpacing: 1.5,
      textTransform: 'uppercase', padding: '16px 0 6px',
      borderBottom: '1px solid var(--border-light)', marginBottom: 4,
    }}>{text}</div>
  )

  const row = (label: string, value: React.ReactNode, onClick?: () => void) => (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 0',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.1s',
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-num)' }}>{value}</span>
    </div>
  )

  const toggle = (label: string, checked: boolean, onChange: () => void) => (
    <div
      onClick={onChange}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 0', cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>{label}</span>
      <div style={{
        width: 36, height: 20, borderRadius: 10,
        background: checked ? 'var(--accent)' : 'var(--border-medium)',
        position: 'relative', transition: 'background 0.2s',
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: '50%',
          background: 'white', position: 'absolute', top: 2,
          left: checked ? 18 : 2, transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
    </div>
  )

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 400, maxHeight: '80vh', background: 'var(--bg-elevated)',
        borderRadius: 14, border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        animation: 'fadeIn 150ms ease-out',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-light)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)' }}>设置</span>
          <button onClick={onClose} aria-label="关闭设置" style={{
            border: 'none', background: 'none', fontSize: 18,
            color: 'var(--text-faint)', cursor: 'pointer',
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '0 20px 20px', overflow: 'auto', flex: 1 }}>

          {/* Theme section */}
          {sectionTitle('外观')}
          {row('主题模式', themeLabel, toggleTheme)}

          {/* Sync section */}
          {sectionTitle('同步')}
          {user ? (
            <>
              {row('账号', user.email?.split('@')[0] || '已登录')}
              {row('状态', syncStatus === 'syncing' ? '同步中…' : syncStatus === 'synced' ? '已同步' : syncError || '离线')}
              {row('立即同步', '→', onSync)}
              {row('退出登录', '→', onSignOut)}
            </>
          ) : supabase ? (
            <>
              <div style={{ padding: '8px 0' }}>
                <input
                  placeholder="邮箱"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  aria-label="登录邮箱"
                  style={{
                    width: '100%', padding: '8px 10px', marginBottom: 6,
                    border: '1px solid var(--border-medium)', borderRadius: 6,
                    background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                    fontSize: 13, outline: 'none', fontFamily: 'var(--font-sans)',
                  }}
                />
                <input
                  type="password"
                  placeholder="密码"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  aria-label="登录密码"
                  style={{
                    width: '100%', padding: '8px 10px', marginBottom: 6,
                    border: '1px solid var(--border-medium)', borderRadius: 6,
                    background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                    fontSize: 13, outline: 'none', fontFamily: 'var(--font-sans)',
                  }}
                />
                {loginError && <div style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 6 }}>{loginError}</div>}
                <button
                  onClick={handleLogin}
                  disabled={loginLoading || !loginEmail || !loginPassword}
                  style={{
                    width: '100%', padding: '8px', background: 'var(--accent)', color: 'white',
                    border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                    opacity: loginLoading ? 0.6 : 1,
                  }}
                >
                  {loginLoading ? '登录中…' : '登录'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '6px 0', lineHeight: 1.5 }}>
                配置 Supabase 连接以启用同步
              </div>
              <div style={{ padding: '4px 0' }}>
                <input
                  placeholder="Supabase URL"
                  value={sbUrl}
                  onChange={e => setSbUrl(e.target.value)}
                  aria-label="Supabase URL"
                  style={{
                    width: '100%', padding: '8px 10px', marginBottom: 6,
                    border: '1px solid var(--border-medium)', borderRadius: 6,
                    background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                    fontSize: 12, outline: 'none', fontFamily: 'var(--font-num)',
                  }}
                />
                <input
                  placeholder="Supabase Anon Key"
                  value={sbKey}
                  onChange={e => setSbKey(e.target.value)}
                  aria-label="Supabase Anon Key"
                  style={{
                    width: '100%', padding: '8px 10px', marginBottom: 6,
                    border: '1px solid var(--border-medium)', borderRadius: 6,
                    background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                    fontSize: 12, outline: 'none', fontFamily: 'var(--font-num)',
                  }}
                />
                <button
                  onClick={() => {
                    localStorage.setItem('shimo-sb-url', sbUrl.trim())
                    localStorage.setItem('shimo-sb-key', sbKey.trim())
                    window.location.reload()
                  }}
                  disabled={!sbUrl.trim() || !sbKey.trim()}
                  style={{
                    width: '100%', padding: '8px', background: 'var(--accent)', color: 'white',
                    border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  保存并重启
                </button>
              </div>
            </>
          )}

          {/* AI provider config */}
          {sectionTitle('AI')}
          <div style={{ padding: '8px 0' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {PROVIDERS.map(p => (
                <button key={p.id} onClick={() => { setAiProvider(p.id); setAiModel(p.defaultModel) }}
                  style={{
                    padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                    border: aiProvider === p.id ? '1.5px solid var(--accent)' : '1px solid var(--border-light)',
                    background: aiProvider === p.id ? 'var(--accent-bg)' : 'var(--bg-elevated)',
                    color: aiProvider === p.id ? 'var(--accent)' : 'var(--text-secondary)',
                    fontFamily: 'var(--font-sans)',
                  }}>{p.name}</button>
              ))}
            </div>
            <input
              type="password" placeholder="API Key" value={aiKey}
              onChange={e => setAiKey(e.target.value)}
              aria-label="AI API Key"
              style={{
                width: '100%', padding: '7px 10px', marginBottom: 6,
                border: '1px solid var(--border-medium)', borderRadius: 6,
                background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                fontSize: 12, outline: 'none', fontFamily: 'var(--font-mono)',
              }}
            />
            <input
              placeholder="模型" value={aiModel}
              onChange={e => setAiModel(e.target.value)}
              aria-label="AI 模型名称"
              style={{
                width: '100%', padding: '7px 10px', marginBottom: 8,
                border: '1px solid var(--border-medium)', borderRadius: 6,
                background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                fontSize: 12, outline: 'none', fontFamily: 'var(--font-num)',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => {
                if (!aiKey.trim()) return
                saveAI({ provider: aiProvider, apiKey: aiKey.trim(), model: aiModel })
                setAiConfig({ provider: aiProvider, apiKey: aiKey.trim(), model: aiModel })
                setAiSaved(true); setTimeout(() => setAiSaved(false), 2000)
              }} style={{
                flex: 1, padding: '7px 0', background: aiKey.trim() ? 'var(--accent)' : 'var(--bg-secondary)',
                color: aiKey.trim() ? 'white' : 'var(--text-faint)',
                border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer',
              }}>{aiSaved ? '✓ 已保存' : '保存'}</button>
              {aiConfig && (
                <button onClick={() => { clearAI(); setAiConfig(null); setAiKey('') }} style={{
                  padding: '7px 12px', background: 'none', border: '1px solid var(--border-light)',
                  borderRadius: 6, color: 'var(--danger)', fontSize: 12, cursor: 'pointer',
                }}>清除</button>
              )}
            </div>
            {aiConfig && <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 6 }}>AI 已配置 · {aiConfig.provider}</div>}
          </div>

          {/* Security section */}
          {sectionTitle('安全')}
          {toggle('App 启动锁', lockEnabled, () => {
            if (lockEnabled) {
              disableLock()
              setLockEnabled(false)
            } else {
              if (!pinSet) {
                alert('请先设置 PIN 码：加密任意一条笔记时会引导你设置。')
                return
              }
              enableLock()
              setLockEnabled(true)
            }
          })}
          {row('PIN 码', pinSet ? '已设置' : '未设置')}
          {pinSet && row('重置 PIN', '→', () => {
            if (confirm('确定重置 PIN 码？重置后需要重新设置。')) {
              clearPin()
              setPinSet(false)
              disableLock()
              setLockEnabled(false)
            }
          })}

          {/* Stats section */}
          {sectionTitle('数据')}
          {row('笔记总数', `${stats.totalNotes} 条`)}
          {row('标签总数', `${stats.totalTags} 个`)}
          {row('总字数', `${stats.totalWords.toLocaleString()} 字`)}
          {row('存储占用', formatBytes(stats.storageUsage))}

          {/* Keyboard shortcuts reference */}
          {sectionTitle('快捷键')}
          {row('新建笔记', 'Ctrl+N')}
          {row('选择模板', 'Ctrl+T')}
          {row('切换主题', 'Ctrl+D')}
          {row('快捷键帮助', 'Ctrl+/')}
          {row('命令菜单', '/ (编辑器内)')}
          {row('关闭编辑器', 'Esc')}

          {/* About section */}
          {sectionTitle('关于')}
          {row('版本', 'v1.0.0')}
          {row('应用', '拾墨 Shimo')}
        </div>
      </div>
    </div>
  )
}
