/**
 * PIN 安全模块
 * - SHA-256 哈希存储（不存明文）
 * - 锁定状态用签名防篡改
 */

const PIN_HASH_KEY = 'shimo-pin-hash'
const ATTEMPTS_KEY = 'shimo-pin-attempts'
const LOCK_SECRET = 'shimo-lock-2026' // 简单签名防直接清除

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function setPinHash(pin: string): Promise<void> {
  const hash = await sha256(pin + LOCK_SECRET)
  localStorage.setItem(PIN_HASH_KEY, hash)
  // 迁移：清除旧明文 PIN
  localStorage.removeItem('shimo-app-pin')
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = localStorage.getItem(PIN_HASH_KEY)
  if (!stored) {
    // 兼容旧版明文 PIN
    const oldPin = localStorage.getItem('shimo-app-pin')
    if (oldPin) {
      if (pin === oldPin) {
        // 迁移到哈希
        await setPinHash(pin)
        return true
      }
      return false
    }
    return false
  }
  const hash = await sha256(pin + LOCK_SECRET)
  return hash === stored
}

export function hasPinConfigured(): boolean {
  return !!(localStorage.getItem(PIN_HASH_KEY) || localStorage.getItem('shimo-app-pin'))
}

export function clearPin(): void {
  localStorage.removeItem(PIN_HASH_KEY)
  localStorage.removeItem('shimo-app-pin')
  localStorage.removeItem(ATTEMPTS_KEY)
}

// 锁定逻辑（带签名防篡改）
interface AttemptsData {
  count: number
  lockedUntil: number
  sig: string
}

function signAttempts(count: number, lockedUntil: number): string {
  // 简单签名：防止用户直接编辑 localStorage 绕过
  return btoa(`${count}:${lockedUntil}:${LOCK_SECRET}`).slice(0, 16)
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
