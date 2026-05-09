/**
 * PIN 安全模块
 * - SHA-256 哈希存储（不存明文）
 * - 每设备随机盐值（不在源码中暴露）
 * - 锁定状态用签名防篡改
 * 
 * 注意：这是客户端安全，无法防御有 DevTools 访问权限的攻击者。
 * 设计目标是防止日常场景下的偷看，不是防御专业攻击。
 */

const PIN_HASH_KEY = 'shimo-pin-hash'
const ATTEMPTS_KEY = 'shimo-pin-attempts'
const DEVICE_SECRET_KEY = 'shimo-device-secret'

// Legacy secret for migration from old hardcoded version
const LEGACY_SECRET = 'shimo-lock-2026'

/**
 * Get or generate a per-device random secret.
 * This secret is unique to each device/browser and never appears in source code.
 */
function getDeviceSecret(): string {
  let secret = localStorage.getItem(DEVICE_SECRET_KEY)
  if (!secret) {
    // Generate a cryptographically random 32-byte hex string
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(32)
      crypto.getRandomValues(bytes)
      secret = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
    } else {
      // Fallback: less secure but still unique per device
      secret = Date.now().toString(36) + Math.random().toString(36).slice(2) +
               Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
    }
    localStorage.setItem(DEVICE_SECRET_KEY, secret)
  }
  return secret
}

async function sha256(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  }
  // Fallback: simple hash (not as secure as SHA-256, but doesn't store plaintext)
  let hash = 0
  const secret = getDeviceSecret()
  const str = text + secret + text
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return 'fb_' + Math.abs(hash).toString(16).padStart(8, '0') + str.length.toString(16).padStart(4, '0')
}

export async function setPinHash(pin: string): Promise<void> {
  const secret = getDeviceSecret()
  const hash = await sha256(pin + secret)
  localStorage.setItem(PIN_HASH_KEY, hash)
  // 迁移：清除旧明文 PIN
  localStorage.removeItem('shimo-app-pin')
}

export async function verifyPin(pin: string): Promise<boolean> {
  if (!pin || pin.length < 4) return false
  
  const stored = localStorage.getItem(PIN_HASH_KEY)
  if (!stored) {
    // 兼容旧版明文 PIN
    const oldPin = localStorage.getItem('shimo-app-pin')
    if (oldPin) {
      if (pin === oldPin) {
        // 迁移到新格式
        await setPinHash(pin)
        return true
      }
      return false
    }
    return false
  }

  // Try current device secret first
  const secret = getDeviceSecret()
  const hash = await sha256(pin + secret)
  if (hash === stored) return true

  // Migration: try legacy hardcoded secret (for users upgrading from old version)
  const legacyHash = await sha256(pin + LEGACY_SECRET)
  if (legacyHash === stored) {
    // Re-hash with new device secret
    await setPinHash(pin)
    return true
  }

  return false
}

export function hasPinConfigured(): boolean {
  return !!(localStorage.getItem(PIN_HASH_KEY) || localStorage.getItem('shimo-app-pin'))
}

export function clearPin(): void {
  localStorage.removeItem(PIN_HASH_KEY)
  localStorage.removeItem('shimo-app-pin')
  localStorage.removeItem(ATTEMPTS_KEY)
  // Note: we keep DEVICE_SECRET_KEY so it can be reused if PIN is set again
}

// 锁定逻辑（带签名防篡改）
interface AttemptsData {
  count: number
  lockedUntil: number
  sig: string
}

function signAttempts(count: number, lockedUntil: number): string {
  const secret = getDeviceSecret()
  // HMAC-like signature using device secret
  const payload = `${count}:${lockedUntil}:${secret}`
  // Simple hash of the payload for signing
  let h = 0
  for (let i = 0; i < payload.length; i++) {
    h = ((h << 5) - h) + payload.charCodeAt(i)
    h = h & h
  }
  return Math.abs(h).toString(36).padStart(10, '0').slice(0, 12)
}

export function getAttempts(): { count: number; lockedUntil: number } {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY)
    if (!raw) return { count: 0, lockedUntil: 0 }
    const data: AttemptsData = JSON.parse(raw)
    // 验证签名
    if (data.sig !== signAttempts(data.count, data.lockedUntil)) {
      // 签名不匹配，可能被篡改，重置为最严格锁定
      return { count: 10, lockedUntil: Date.now() + 30 * 60 * 1000 }
    }
    // 如果锁定已过期，自动重置
    if (data.lockedUntil > 0 && data.lockedUntil <= Date.now()) {
      resetAttempts()
      return { count: 0, lockedUntil: 0 }
    }
    return { count: data.count, lockedUntil: data.lockedUntil }
  } catch {
    return { count: 0, lockedUntil: 0 }
  }
}

export function recordFailedAttempt(): { count: number; lockedUntil: number } {
  const { count } = getAttempts()
  const newCount = count + 1
  let lockedUntil = 0
  if (newCount >= 10) lockedUntil = Date.now() + 30 * 60 * 1000
  else if (newCount >= 6) lockedUntil = Date.now() + 5 * 60 * 1000
  else if (newCount >= 3) lockedUntil = Date.now() + 60 * 1000

  const data: AttemptsData = { count: newCount, lockedUntil, sig: signAttempts(newCount, lockedUntil) }
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(data))
  return { count: newCount, lockedUntil }
}

export function resetAttempts(): void {
  const data: AttemptsData = { count: 0, lockedUntil: 0, sig: signAttempts(0, 0) }
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(data))
}
