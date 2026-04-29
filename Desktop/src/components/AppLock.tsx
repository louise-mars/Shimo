import { useState, useEffect } from 'react'
import { verifyPin, setPinHash, hasPinConfigured } from '../lib/pinSecurity'

const LOCK_KEY = 'shimo-app-lock'

interface Props {
  onUnlock: () => void
}

export default function AppLock({ onUnlock }: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [isFirstTime, setIsFirstTime] = useState(true)

  useEffect(() => {
    setIsFirstTime(!hasPinConfigured())
  }, [])

  const handleSubmit = async () => {
    if (isFirstTime) {
      if (pin.length < 4) return
      await setPinHash(pin)
      localStorage.setItem(LOCK_KEY, 'false')
      onUnlock()
    } else {
      const ok = await verifyPin(pin)
      if (ok) {
        localStorage.setItem(LOCK_KEY, 'false')
        onUnlock()
      } else {
        setError(true)
        setPin('')
      }
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{
        fontSize: 32,
        fontWeight: 700,
        fontFamily: 'var(--font-serif)',
        letterSpacing: 5,
        marginBottom: 32,
        color: 'var(--text-primary)',
      }}>
        拾墨
      </div>

      <div style={{
        fontSize: 14,
        color: 'var(--text-secondary)',
        marginBottom: 16,
        fontFamily: 'var(--font-sans)',
      }}>
        {isFirstTime ? '设置 App 锁 PIN 码（4位）' : '输入 PIN 码解锁'}
      </div>

      <input
        type="password"
        maxLength={4}
        value={pin}
        onChange={e => {
          setPin(e.target.value.replace(/\D/g, ''))
          setError(false)
        }}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        placeholder="4位数字"
        style={{
          width: 120,
          padding: '12px 16px',
          fontSize: 24,
          textAlign: 'center',
          letterSpacing: 8,
          border: error ? '2px solid var(--danger)' : '1px solid var(--border-medium)',
          borderRadius: 8,
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          outline: 'none',
        }}
        autoFocus
      />

      {error && (
        <div style={{
          color: 'var(--danger)',
          fontSize: 12,
          marginTop: 8,
        }}>
          PIN 码错误
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={pin.length < 4}
        style={{
          marginTop: 24,
          padding: '10px 32px',
          background: pin.length >= 4 ? 'var(--accent)' : 'var(--bg-secondary)',
          color: pin.length >= 4 ? 'white' : 'var(--text-faint)',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          cursor: pin.length >= 4 ? 'pointer' : 'default',
        }}
      >
        {isFirstTime ? '确认' : '解锁'}
      </button>
    </div>
  )
}

// 检查是否需要显示锁屏
export function isLockEnabled(): boolean {
  return localStorage.getItem(LOCK_KEY) === 'true'
}

// 启用锁
export function enableLock(): void {
  localStorage.setItem(LOCK_KEY, 'true')
}

// 禁用锁
export function disableLock(): void {
  localStorage.setItem(LOCK_KEY, 'false')
}

// 检查是否设置了 PIN
export function hasPinSet(): boolean {
  return hasPinConfigured()
}