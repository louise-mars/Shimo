import { useState } from 'react'
import { supabase } from '@notepro/shared'
import { X } from 'lucide-react'

interface Props {
  onClose: () => void
  onAuth: () => void
}

export default function AuthModal({ onClose, onAuth }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !email || !password) return
    setLoading(true); setError(''); setSuccess('')

    try {
      if (mode === 'signup') {
        const { error: err } = await supabase.auth.signUp({ email, password })
        if (err) throw err
        // 尝试直接登录（如果关闭了邮箱验证）
        const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password })
        if (loginErr) {
          setSuccess('注册成功！请查收邮件确认后再登录。')
        } else {
          onAuth()
          onClose()
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw err
        onAuth()
        onClose()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失败'
      if (msg.includes('Invalid login credentials')) {
        setError('邮箱或密码错误')
      } else if (msg.includes('Email not confirmed')) {
        setError('请先验证邮箱，或在 Supabase 控制台关闭邮箱验证')
      } else if (msg.includes('User already registered')) {
        setError('该邮箱已注册，请直接登录')
        setMode('login')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px',
    border: '1px solid var(--border-light)',
    borderRadius: 8, fontSize: 15,
    color: 'var(--text-primary)',
    background: 'var(--bg-primary)',
    outline: 'none',
    fontFamily: 'var(--font-sans)',
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(26,18,8,0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'var(--bg-elevated)',
        borderRadius: '14px 14px 0 0',
        border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
        animation: 'slideUp 0.28s ease-out',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {/* 拖拽指示 */}
        <div style={{ width: 32, height: 3, background: 'var(--border-medium)', borderRadius: 2, margin: '10px auto 0' }} />

        {/* 标题 */}
        <div style={{
          padding: '14px 20px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-light)',
        }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)', letterSpacing: 1 }}>
            {mode === 'login' ? '登录' : '注册'}
          </span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', color: 'var(--text-faint)', fontSize: 18, cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="邮箱"
            required
            style={inputStyle}
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="密码（至少6位）"
            required
            minLength={6}
            style={inputStyle}
          />

          {error && (
            <div style={{ fontSize: 13, color: 'var(--danger)', fontFamily: 'var(--font-sans)', padding: '8px 12px', background: 'var(--error-bg)', borderRadius: 6 }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ fontSize: 13, color: 'var(--success-text)', fontFamily: 'var(--font-sans)', padding: '8px 12px', background: 'var(--success-bg)', borderRadius: 6 }}>
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '13px', border: 'none', borderRadius: 8,
              background: 'var(--accent)', color: 'white',
              fontSize: 15, fontFamily: 'var(--font-sans)',
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.7 : 1,
              marginTop: 4,
            }}
          >
            {loading ? '处理中…' : mode === 'login' ? '登录' : '注册'}
          </button>

          <p style={{ fontSize: 13, color: 'var(--text-faint)', textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
            {mode === 'login' ? (
              <>还没有账号？<button type="button" onClick={() => { setMode('signup'); setError('') }}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
                注册
              </button></>
            ) : (
              <>已有账号？<button type="button" onClick={() => { setMode('login'); setError('') }}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
                登录
              </button></>
            )}
          </p>
        </form>
      </div>
    </div>
  )
}
