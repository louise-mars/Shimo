import { useState } from 'react'
import { loadAIConfig, saveAIConfig, clearAIConfig, PROVIDERS, getProviderInfo } from '../../lib/aiConfig'
import type { AIProvider } from '../../lib/aiConfig'
import { isAIConfigured } from '../../lib/ai'

interface Props { onBack: () => void }

export default function AISettings({ onBack }: Props) {
  const existing = loadAIConfig()
  const [provider, setProvider] = useState<AIProvider>(existing?.provider || 'minimax')
  const [apiKey, setApiKey] = useState(existing?.apiKey || '')
  const [model, setModel] = useState(existing?.model || getProviderInfo(provider).defaultModel)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null)
  const configured = isAIConfigured()

  const info = getProviderInfo(provider)

  const handleProviderChange = (p: AIProvider) => {
    setProvider(p)
    const pInfo = getProviderInfo(p)
    setModel(pInfo.defaultModel)
    setTestResult(null)
    // 切换提供商时清空 key（不同提供商 key 不通用）
    if (p !== existing?.provider) setApiKey('')
  }

  const handleSave = () => {
    if (!apiKey.trim()) return
    saveAIConfig({ provider, apiKey: apiKey.trim(), model })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTest = async () => {
    if (!apiKey.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      saveAIConfig({ provider, apiKey: apiKey.trim(), model })
      const { structureVoiceText } = await import('../../lib/ai')
      await structureVoiceText('测试')
      setTestResult('ok')
    } catch {
      setTestResult('fail')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ border: 'none', background: 'none', fontSize: 20, color: 'var(--text-tertiary)', cursor: 'pointer' }}>←</button>
        <span className="page-title" style={{ fontSize: 20 }}>AI 功能</span>
        {configured && <span style={{ fontSize: 11, color: 'var(--success)', fontFamily: 'var(--font-sans)', marginLeft: 'auto' }}>已启用</span>}
      </div>

      <div style={{ padding: '0 20px', overflow: 'auto', flex: 1 }}>

        {/* 说明 */}
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', lineHeight: 1.7, marginBottom: 20, padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
          配置后可使用：语音自动整理、问我的笔记、今日摘要
        </div>

        {/* 提供商选择 */}
        <div style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-sans)', marginBottom: 8 }}>
          选择 AI 提供商
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              onClick={() => handleProviderChange(p.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', borderRadius: 8,
                border: provider === p.id ? '2px solid var(--accent)' : '1px solid var(--border-light)',
                background: provider === p.id ? 'var(--accent-bg)' : 'var(--bg-elevated)',
                cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'all 0.15s',
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-sans)', marginTop: 2 }}>
                  {p.desc}
                </div>
              </div>
              {provider === p.id && (
                <span style={{ color: 'var(--accent)', fontSize: 16 }}>✓</span>
              )}
            </button>
          ))}
        </div>

        {/* API Key */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-sans)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>{info.name} API Key</span>
            <a href={info.keyUrl} target="_blank" rel="noreferrer"
              style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 11 }}>
              获取 Key →
            </a>
          </div>
          <input
            type="password"
            value={apiKey}
            onChange={e => { setApiKey(e.target.value); setTestResult(null) }}
            placeholder="输入 API Key…"
            style={{
              width: '100%', padding: '12px 14px',
              border: '1px solid var(--border-light)',
              borderRadius: 8, background: 'var(--bg-elevated)',
              color: 'var(--text-primary)', fontSize: 14,
              fontFamily: 'var(--font-mono)', outline: 'none',
            }}
          />
        </div>

        {/* 模型选择 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-sans)', marginBottom: 8 }}>
            模型
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {info.models.map(m => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                style={{
                  padding: '7px 12px', borderRadius: 6,
                  border: model === m.id ? '1.5px solid var(--accent)' : '1px solid var(--border-light)',
                  background: model === m.id ? 'var(--accent-bg)' : 'var(--bg-elevated)',
                  color: model === m.id ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 12, fontFamily: 'var(--font-sans)', cursor: 'pointer',
                  transition: 'all 0.1s',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          {/* 自定义模型 ID */}
          {provider === 'openrouter' && (
            <input
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="或输入自定义模型 ID"
              style={{
                width: '100%', padding: '8px 10px', marginTop: 8,
                border: '1px solid var(--border-light)', borderRadius: 6,
                background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none',
              }}
            />
          )}
        </div>

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={handleTest} disabled={!apiKey.trim() || testing}
            style={{
              flex: 1, padding: '12px 0', border: '1px solid var(--border-light)',
              borderRadius: 8, background: 'var(--bg-elevated)',
              color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)',
              fontSize: 14, cursor: apiKey.trim() ? 'pointer' : 'default',
              opacity: apiKey.trim() ? 1 : 0.4,
            }}>
            {testing ? '测试中…' : '测试连接'}
          </button>
          <button onClick={handleSave} disabled={!apiKey.trim()}
            style={{
              flex: 1, padding: '12px 0', border: 'none', borderRadius: 8,
              background: apiKey.trim() ? 'var(--accent)' : 'var(--bg-secondary)',
              color: apiKey.trim() ? 'white' : 'var(--text-faint)',
              fontFamily: 'var(--font-sans)', fontSize: 14,
              cursor: apiKey.trim() ? 'pointer' : 'default',
            }}>
            {saved ? '✓ 已保存' : '保存'}
          </button>
        </div>

        {/* 测试结果 */}
        {testResult && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, marginBottom: 16,
            background: testResult === 'ok' ? 'var(--success-bg)' : 'var(--error-bg)',
            color: testResult === 'ok' ? 'var(--success-text)' : 'var(--error-text)',
            fontSize: 13, fontFamily: 'var(--font-sans)',
          }}>
            {testResult === 'ok' ? '✓ 连接成功，AI 已就绪' : '✕ 连接失败，请检查 Key 和模型'}
          </div>
        )}

        {/* 清除 */}
        {configured && (
          <button onClick={() => { if (confirm('清除 AI 配置？')) { clearAIConfig(); setApiKey(''); setTestResult(null) } }}
            style={{ width: '100%', padding: '12px 0', border: '1px solid var(--border-light)', borderRadius: 8, background: 'none', color: 'var(--danger)', fontFamily: 'var(--font-sans)', fontSize: 14, cursor: 'pointer', marginBottom: 20 }}>
            清除配置
          </button>
        )}
      </div>
    </div>
  )
}