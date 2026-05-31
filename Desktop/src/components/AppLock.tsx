import { useState, useEffect, useRef, useCallback } from 'react'
import {
  hashPin,
  verifyPin as sharedVerifyPin,
  getLockoutDuration,
  signCounter,
  migrateLegacyPin,
  type Pbkdf2PinData,
} from '@notepro/shared'

// --- Storage keys ---
const LOCK_KEY = 'shimo-app-lock'
const PIN_DATA_KEY = 'shimo-pin-data'
const ATTEMPTS_KEY = 'shimo-pin-attempts-v2'
const DEVICE_SECRET_KEY = 'shimo-device-secret'
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

// --- Types ---
interface AttemptsData {
  count: number
  lockedUntil: number
  sig: string
}

type LockMode = 'verify' | 'create' | 'confirm'

interface Props {
  onUnlock: () => void
}

// --- Device secret ---
function getDeviceSecret(): string {
  let secret = localStorage.getItem(DEVICE_SECRET_KEY)
  if (!secret) {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    secret = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
    localStorage.setItem(DEVICE_SECRET_KEY, secret)
  }
  return secret
}

// --- Attempt counter with HMAC signing ---
async function loadAttempts(): Promise<{ count: number; lockedUntil: number }> {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY)
    if (!raw) return { count: 0, lockedUntil: 0 }
    const data: AttemptsData = JSON.parse(raw)
    const secret = getDeviceSecret()
    const expectedSig = await signCounter(data.count * 1000000 + data.lockedUntil, secret)
    if (data.sig !== expectedSig) {
      // Signature mismatch — possible tampering, enforce max lockout
      return { count: 10, lockedUntil: Date.now() + 30 * 60 * 1000 }
    }
    // If lockout expired, reset
    if (data.lockedUntil > 0 && data.lockedUntil <= Date.now()) {
      await saveAttempts(0, 0)
      return { count: 0, lockedUntil: 0 }
    }
    return { count: data.count, lockedUntil: data.lockedUntil }
  } catch {
    return { count: 0, lockedUntil: 0 }
  }
}

async function saveAttempts(count: number, lockedUntil: number): Promise<void> {
  const secret = getDeviceSecret()
  const sig = await signCounter(count * 1000000 + lockedUntil, secret)
  const data: AttemptsData = { count, lockedUntil, sig }
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(data))
}

async function recordFailedAttempt(): Promise<{ count: number; lockedUntil: number }> {
  const { count } = await loadAttempts()
  const newCount = count + 1
  const lockoutSeconds = getLockoutDuration(newCount)
  const lockedUntil = lockoutSeconds > 0 ? Date.now() + lockoutSeconds * 1000 : 0
  await saveAttempts(newCount, lockedUntil)
  return { count: newCount, lockedUntil }
}

async function resetAttempts(): Promise<void> {
  await saveAttempts(0, 0)
}

// --- PIN data helpers ---
function getPinData(): Pbkdf2PinData | null {
  try {
    const raw = localStorage.getItem(PIN_DATA_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function hasPinDataStored(): boolean {
  return getPinData() !== null
}

function hasLegacyPin(): boolean {
  return !!(localStorage.getItem('shimo-app-pin') || localStorage.getItem('shimo-pin-hash'))
}

// --- Component ---
export default function AppLock({ onUnlock }: Props) {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [mode, setMode] = useState<LockMode>(() => {
    if (hasPinDataStored() || hasLegacyPin()) return 'verify'
    return 'create'
  })
  const [lockedUntil, setLockedUntil] = useState(0)
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [isVerifying, setIsVerifying] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load lockout state on mount
  useEffect(() => {
    loadAttempts().then(({ lockedUntil: lu }) => {
      if (lu > Date.now()) {
        setLockedUntil(lu)
      }
    })
  }, [])

  // Countdown timer for lockout
  useEffect(() => {
    if (lockedUntil <= 0) {
      setRemainingSeconds(0)
      return
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000))
      setRemainingSeconds(remaining)
      if (remaining <= 0) {
        setLockedUntil(0)
        setError('')
      }
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [lockedUntil])

  // Focus input on mode change
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [mode, lockedUntil])

  const handleVerify = async () => {
    if (pin.length < 4 || isVerifying) return
    setIsVerifying(true)

    try {
      // Try PBKDF2 verification first
      const pinData = getPinData()
      if (pinData) {
        const ok = await sharedVerifyPin(pin, pinData.hash, pinData.salt)
        if (ok) {
          await resetAttempts()
          onUnlock()
          return
        }
      } else if (hasLegacyPin()) {
        // Attempt legacy migration
        const migrated = await migrateLegacyPin(pin)
        if (migrated) {
          await resetAttempts()
          onUnlock()
          return
        }
      }

      // Failed attempt
      const { lockedUntil: lu } = await recordFailedAttempt()
      if (lu > Date.now()) {
        setLockedUntil(lu)
        setError('')
      } else {
        setError('PIN 码错误，请重试')
      }
      setPin('')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleCreate = () => {
    if (pin.length < 4 || pin.length > 6) return
    setMode('confirm')
    setConfirmPin('')
    setError('')
  }

  const handleConfirm = async () => {
    if (confirmPin !== pin) {
      setError('两次输入不一致，请重新设置')
      setMode('create')
      setPin('')
      setConfirmPin('')
      return
    }

    // Hash and store the new PIN
    const { hash, salt } = await hashPin(pin)
    const pinData: Pbkdf2PinData = {
      hash,
      salt,
      iterations: 100_000,
      algorithm: 'SHA-256',
    }
    localStorage.setItem(PIN_DATA_KEY, JSON.stringify(pinData))
    onUnlock()
  }

  const handleSubmit = () => {
    if (mode === 'verify') handleVerify()
    else if (mode === 'create') handleCreate()
    else if (mode === 'confirm') handleConfirm()
  }

  const isLockedOut = lockedUntil > Date.now()

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m}分${s.toString().padStart(2, '0')}秒` : `${s}秒`
  }

  const getTitle = (): string => {
    if (mode === 'create') return '设置 PIN 码（4-6位数字）'
    if (mode === 'confirm') return '再次输入 PIN 码确认'
    return '输入 PIN 码解锁'
  }

  const getButtonText = (): string => {
    if (mode === 'create') return '下一步'
    if (mode === 'confirm') return '确认设置'
    return '解锁'
  }

  const currentInput = mode === 'confirm' ? confirmPin : pin
  const setCurrentInput = mode === 'confirm' ? setConfirmPin : setPin
  const isButtonEnabled = currentInput.length >= 4 && currentInput.length <= 6 && !isLockedOut && !isVerifying

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      role="dialog"
      aria-modal="true"
      aria-label="应用锁定"
    >
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          fontFamily: 'var(--font-serif)',
          letterSpacing: 5,
          marginBottom: 32,
          color: 'var(--text-primary)',
        }}
      >
        拾墨
      </div>

      <div
        style={{
          fontSize: 14,
          color: 'var(--text-secondary)',
          marginBottom: 16,
          fontFamily: 'var(--font-sans)',
        }}
      >
        {getTitle()}
      </div>

      {isLockedOut ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
            }}
            aria-hidden="true"
          >
            🔒
          </div>
          <div
            style={{
              fontSize: 14,
              color: 'var(--danger)',
              textAlign: 'center',
              lineHeight: 1.6,
            }}
            role="alert"
          >
            输入错误次数过多
            <br />
            请等待 {formatTime(remainingSeconds)} 后重试
          </div>
        </div>
      ) : (
        <>
          {/* PIN dot indicators */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginBottom: 16,
            }}
            aria-hidden="true"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: i < currentInput.length ? 'var(--accent)' : 'var(--border-medium)',
                  transition: 'background 0.15s ease',
                }}
              />
            ))}
          </div>

          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={currentInput}
            onChange={e => {
              const val = e.target.value.replace(/\D/g, '')
              setCurrentInput(val)
              setError('')
            }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="输入数字"
            disabled={isVerifying}
            aria-label={getTitle()}
            style={{
              width: 160,
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
            <div
              style={{
                color: 'var(--danger)',
                fontSize: 12,
                marginTop: 8,
              }}
              role="alert"
            >
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!isButtonEnabled}
            aria-label={getButtonText()}
            style={{
              marginTop: 24,
              padding: '10px 32px',
              background: isButtonEnabled ? 'var(--accent)' : 'var(--bg-secondary)',
              color: isButtonEnabled ? 'white' : 'var(--text-faint)',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              cursor: isButtonEnabled ? 'pointer' : 'default',
              opacity: isVerifying ? 0.7 : 1,
            }}
          >
            {isVerifying ? '验证中...' : getButtonText()}
          </button>
        </>
      )}
    </div>
  )
}

// --- Exported utility functions ---

/** Check if app lock is enabled */
export function isLockEnabled(): boolean {
  return localStorage.getItem(LOCK_KEY) === 'true'
}

/** Enable app lock */
export function enableLock(): void {
  localStorage.setItem(LOCK_KEY, 'true')
}

/** Disable app lock */
export function disableLock(): void {
  localStorage.setItem(LOCK_KEY, 'false')
}

/** Check if a PIN has been configured (PBKDF2 or legacy) */
export function hasPinSet(): boolean {
  return !!(
    localStorage.getItem(PIN_DATA_KEY) ||
    localStorage.getItem('shimo-app-pin') ||
    localStorage.getItem('shimo-pin-hash')
  )
}

// --- Inactivity auto-lock hook ---

/**
 * Hook that monitors user activity and triggers lock after 5 minutes of inactivity.
 * Should be used in the main Layout component when app lock is enabled.
 */
export function useInactivityLock(onLock: () => void): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onLockRef = useRef(onLock)
  onLockRef.current = onLock

  const resetTimer = useCallback(() => {
    if (!isLockEnabled() || !hasPinSet()) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onLockRef.current()
    }, INACTIVITY_TIMEOUT_MS)
  }, [])

  useEffect(() => {
    if (!isLockEnabled() || !hasPinSet()) return

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click']
    const handler = () => resetTimer()

    // Start the timer
    resetTimer()

    // Listen for activity
    events.forEach(evt => document.addEventListener(evt, handler, { passive: true }))

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      events.forEach(evt => document.removeEventListener(evt, handler))
    }
  }, [resetTimer])
}
