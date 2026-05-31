import { useState } from 'react'
import { PROVIDERS, saveAIConfig, type ProviderInfo } from '@notepro/shared'

interface Props {
  onComplete: () => void
  onClose: () => void
}

type Step = 'provider' | 'key' | 'done'

export default function AISetupWizard({ onComplete, onClose }: Props) {
  const [step, setStep] = useState<Step>('provider')
  const [selected, setSelected] = useState<ProviderInfo | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)

  const handleSelectProvider = (provider: ProviderInfo) => {
    setSelected(provider)
    setModel(provider.defaultModel)
    setStep('key')
  }

  const handleTest = async () => {
    if (!selected || !apiKey.trim()) return
    setTesting(true)
    setTestResult(null)

    try {
      const response = await fetch(`${selected.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: '你好' }],
          max_tokens: 10,
        }),
      })

      if (response.ok) {
        setTestResult('success')
      } else {
        setTestResult('error')
      }
    } catch {
      setTestResult('error')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = () => {
    if (!selected || !apiKey.trim()) return
    saveAIConfig({
      provider: selected.id,
      apiKey: apiKey.trim(),
      model,
    })
    setStep('done')
    setTimeout(onComplete, 1500)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.4)',
    }} onClick={onClose}>
      <div style={{
        width: 480, background: 'var(--bg-primary)',
        borderRadius: 14, boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px', borderBottom: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}>
              配置 AI 助手
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
              {step === 'provider' ? '第 1 步：选择 AI 服务商' :
               step === 'key' ? '第 2 步：输入 API Key' :
               '✓ 配置完成'}
            </p>
          </div>
          <button onClick={onClose} style={{
            border: 'none', background: 'none', color: 'var(--text-faint)',
            fontSize: 20, cursor: 'pointer',
          }}>✕</button>
        </div>

        {/* Step 1: Choose provider */}
        {step === 'provider' && (
          <div style={{ padding: '16px 24px 24px' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
              选择一个 AI 服务商。推荐选择有免费额度的服务（标有"免费"），注册后即可使用。
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectProvider(p)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px', border: '1px solid var(--border-light)',
                    borderRadius: 10, background: 'var(--bg-primary)',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-light)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.background = 'var(--bg-primary)' }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                      {p.name}
                      {(p.id === 'glm' || p.id === 'openrouter') && (
                        <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--success-bg)', color: 'var(--success)' }}>
                          有免费额度
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{p.desc}</div>
                  </div>
                  <span style={{ color: 'var(--text-faint)', fontSize: 16 }}>→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Enter API key */}
        {step === 'key' && selected && (
          <div style={{ padding: '16px 24px 24px' }}>
            <div style={{
              padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8,
              marginBottom: 16, fontSize: 13, lineHeight: 1.6,
            }}>
              <strong style={{ color: 'var(--text-primary)' }}>获取 API Key：</strong>
              <ol style={{ margin: '8px 0 0', paddingLeft: 20, color: 'var(--text-secondary)' }}>
                <li>
                  访问{' '}
                  <a href={selected.keyUrl} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                    {selected.name} 开放平台
                  </a>
                </li>
                <li>注册/登录账号</li>
                <li>在 API Keys 页面创建一个新 Key，复制粘贴到下方</li>
              </ol>
            </div>

            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setTestResult(null) }}
              placeholder={`粘贴你的 ${selected.name} API Key`}
              autoFocus
              style={{
                width: '100%', padding: '10px 14px', fontSize: 14,
                border: testResult === 'error' ? '1.5px solid var(--danger)' :
                        testResult === 'success' ? '1.5px solid var(--success)' :
                        '1px solid var(--border-medium)',
                borderRadius: 8, background: 'var(--bg-elevated)',
                color: 'var(--text-primary)', outline: 'none',
                fontFamily: 'var(--font-num)',
                boxSizing: 'border-box',
              }}
            />

            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginTop: 12, marginBottom: 6 }}>
              模型
            </label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', fontSize: 13,
                border: '1px solid var(--border-medium)', borderRadius: 8,
                background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                outline: 'none', cursor: 'pointer', boxSizing: 'border-box',
              }}
            >
              {selected.models.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>

            {/* Test result */}
            {testResult && (
              <div style={{
                marginTop: 10, fontSize: 12, padding: '6px 10px', borderRadius: 6,
                background: testResult === 'success' ? 'var(--success-bg)' : 'var(--error-bg)',
                color: testResult === 'success' ? 'var(--success)' : 'var(--danger)',
              }}>
                {testResult === 'success' ? '✓ 连接成功！' : '✕ 连接失败，请检查 Key 是否正确'}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => { setStep('provider'); setApiKey(''); setTestResult(null) }} style={{
                padding: '9px 16px', border: '1px solid var(--border-light)',
                borderRadius: 7, background: 'var(--bg-primary)', color: 'var(--text-secondary)',
                fontSize: 13, cursor: 'pointer',
              }}>返回</button>
              <button onClick={handleTest} disabled={!apiKey.trim() || testing} style={{
                padding: '9px 16px', border: '1px solid var(--border-light)',
                borderRadius: 7, background: 'var(--bg-primary)',
                color: apiKey.trim() && !testing ? 'var(--text-primary)' : 'var(--text-faint)',
                fontSize: 13, cursor: apiKey.trim() && !testing ? 'pointer' : 'default',
              }}>{testing ? '测试中…' : '测试连接'}</button>
              <button onClick={handleSave} disabled={!apiKey.trim()} style={{
                padding: '9px 16px', border: 'none', borderRadius: 7,
                background: apiKey.trim() ? 'var(--accent)' : 'var(--bg-secondary)',
                color: apiKey.trim() ? 'white' : 'var(--text-faint)',
                fontSize: 13, cursor: apiKey.trim() ? 'pointer' : 'default',
                fontWeight: 500,
              }}>保存并完成</button>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 'done' && (
          <div style={{
            padding: '40px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
            <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
              AI 助手已就绪
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 8 }}>
              现在可以使用"问 AI"功能了
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
