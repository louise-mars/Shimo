import { describe, it, expect } from 'vitest'
import {
  hashPin,
  verifyPin,
  getLockoutDuration,
  signCounter,
} from '@notepro/shared'

describe('pinSecurity', () => {
  describe('hashPin', () => {
    it('returns a hex-encoded hash and salt', async () => {
      const result = await hashPin('1234')
      expect(result.hash).toMatch(/^[0-9a-f]{64}$/) // 256 bits = 64 hex chars
      expect(result.salt).toMatch(/^[0-9a-f]{32}$/) // 16 bytes = 32 hex chars
    })

    it('produces different salts on each call', async () => {
      const r1 = await hashPin('1234')
      const r2 = await hashPin('1234')
      expect(r1.salt).not.toBe(r2.salt)
      expect(r1.hash).not.toBe(r2.hash) // different salt → different hash
    })
  })

  describe('verifyPin', () => {
    it('returns true for the correct PIN', async () => {
      const { hash, salt } = await hashPin('5678')
      const result = await verifyPin('5678', hash, salt)
      expect(result).toBe(true)
    })

    it('returns false for an incorrect PIN', async () => {
      const { hash, salt } = await hashPin('5678')
      const result = await verifyPin('0000', hash, salt)
      expect(result).toBe(false)
    })

    it('returns false when salt is wrong', async () => {
      const { hash } = await hashPin('1234')
      const wrongSalt = '00'.repeat(16) // 16 zero bytes
      const result = await verifyPin('1234', hash, wrongSalt)
      expect(result).toBe(false)
    })
  })

  describe('getLockoutDuration', () => {
    it('returns 0 for fewer than 3 attempts', () => {
      expect(getLockoutDuration(0)).toBe(0)
      expect(getLockoutDuration(1)).toBe(0)
      expect(getLockoutDuration(2)).toBe(0)
    })

    it('returns 60 seconds for 3-5 attempts', () => {
      expect(getLockoutDuration(3)).toBe(60)
      expect(getLockoutDuration(4)).toBe(60)
      expect(getLockoutDuration(5)).toBe(60)
    })

    it('returns 300 seconds for 6-9 attempts', () => {
      expect(getLockoutDuration(6)).toBe(300)
      expect(getLockoutDuration(7)).toBe(300)
      expect(getLockoutDuration(9)).toBe(300)
    })

    it('returns 1800 seconds for 10+ attempts', () => {
      expect(getLockoutDuration(10)).toBe(1800)
      expect(getLockoutDuration(15)).toBe(1800)
      expect(getLockoutDuration(100)).toBe(1800)
    })
  })

  describe('signCounter', () => {
    it('returns a hex-encoded HMAC signature', async () => {
      const sig = await signCounter(5, 'my-device-secret')
      expect(sig).toMatch(/^[0-9a-f]{64}$/) // HMAC-SHA256 = 32 bytes = 64 hex chars
    })

    it('produces the same signature for the same inputs', async () => {
      const sig1 = await signCounter(3, 'secret')
      const sig2 = await signCounter(3, 'secret')
      expect(sig1).toBe(sig2)
    })

    it('produces different signatures for different counters', async () => {
      const sig1 = await signCounter(1, 'secret')
      const sig2 = await signCounter(2, 'secret')
      expect(sig1).not.toBe(sig2)
    })

    it('produces different signatures for different secrets', async () => {
      const sig1 = await signCounter(5, 'secret-a')
      const sig2 = await signCounter(5, 'secret-b')
      expect(sig1).not.toBe(sig2)
    })
  })
})
