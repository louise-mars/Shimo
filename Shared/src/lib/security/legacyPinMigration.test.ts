import { describe, it, expect, beforeEach, vi } from 'vitest';
import { detectPinFormat, migrateLegacyPin } from './legacyPinMigration';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('legacyPinMigration', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('detectPinFormat', () => {
    it('returns "plaintext" for a 4-digit numeric string', () => {
      expect(detectPinFormat('1234')).toBe('plaintext');
    });

    it('returns "plaintext" for a 5-digit numeric string', () => {
      expect(detectPinFormat('12345')).toBe('plaintext');
    });

    it('returns "plaintext" for a 6-digit numeric string', () => {
      expect(detectPinFormat('123456')).toBe('plaintext');
    });

    it('returns "sha256" for a 64-character hex string', () => {
      const sha256Hash = 'a'.repeat(64);
      expect(detectPinFormat(sha256Hash)).toBe('sha256');
    });

    it('returns "sha256" for a realistic SHA-256 hash', () => {
      // SHA-256 of "1234"
      const hash = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';
      expect(detectPinFormat(hash)).toBe('sha256');
    });

    it('returns "pbkdf2" for a valid JSON object with required fields', () => {
      const pbkdf2Data = JSON.stringify({
        hash: 'ab'.repeat(32),
        salt: 'cd'.repeat(16),
        iterations: 100000,
        algorithm: 'SHA-256',
      });
      expect(detectPinFormat(pbkdf2Data)).toBe('pbkdf2');
    });

    it('returns "unknown" for an empty string', () => {
      expect(detectPinFormat('')).toBe('unknown');
    });

    it('returns "unknown" for a whitespace-only string', () => {
      expect(detectPinFormat('   ')).toBe('unknown');
    });

    it('returns "unknown" for a 3-digit numeric string (too short)', () => {
      expect(detectPinFormat('123')).toBe('unknown');
    });

    it('returns "unknown" for a 7-digit numeric string (too long for plaintext)', () => {
      expect(detectPinFormat('1234567')).toBe('unknown');
    });

    it('returns "unknown" for a non-hex 64-char string', () => {
      const nonHex = 'g'.repeat(64);
      expect(detectPinFormat(nonHex)).toBe('unknown');
    });

    it('returns "unknown" for incomplete JSON', () => {
      const incomplete = JSON.stringify({ hash: 'abc', salt: 'def' });
      expect(detectPinFormat(incomplete)).toBe('unknown');
    });

    it('returns "unknown" for a random string', () => {
      expect(detectPinFormat('hello-world')).toBe('unknown');
    });

    it('distinguishes a 4-digit hex from plaintext (digits are also valid hex)', () => {
      // "1234" is 4 digits — should be plaintext, not sha256 (sha256 requires 64 chars)
      expect(detectPinFormat('1234')).toBe('plaintext');
    });
  });

  describe('migrateLegacyPin', () => {
    it('migrates a plaintext PIN to PBKDF2 on correct input', async () => {
      localStorageMock.setItem('shimo-app-pin', '5678');

      const result = await migrateLegacyPin('5678');

      expect(result).toBe(true);
      // Legacy key should be removed
      expect(localStorageMock.getItem('shimo-app-pin')).toBeNull();
      // New PBKDF2 data should be stored
      const pinData = JSON.parse(localStorageMock.getItem('shimo-pin-data')!);
      expect(pinData.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(pinData.salt).toMatch(/^[0-9a-f]{32}$/);
      expect(pinData.iterations).toBe(100_000);
      expect(pinData.algorithm).toBe('SHA-256');
    });

    it('returns false for incorrect plaintext PIN input', async () => {
      localStorageMock.setItem('shimo-app-pin', '5678');

      const result = await migrateLegacyPin('0000');

      expect(result).toBe(false);
      // Legacy key should still exist
      expect(localStorageMock.getItem('shimo-app-pin')).toBe('5678');
      // No PBKDF2 data should be stored
      expect(localStorageMock.getItem('shimo-pin-data')).toBeNull();
    });

    it('migrates a SHA-256 hash to PBKDF2 on correct input', async () => {
      // Pre-compute SHA-256 of "1234"
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode('1234'));
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      localStorageMock.setItem('shimo-pin-hash', hashHex);

      const result = await migrateLegacyPin('1234');

      expect(result).toBe(true);
      // Legacy key should be removed
      expect(localStorageMock.getItem('shimo-pin-hash')).toBeNull();
      // New PBKDF2 data should be stored
      const pinData = JSON.parse(localStorageMock.getItem('shimo-pin-data')!);
      expect(pinData.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(pinData.salt).toMatch(/^[0-9a-f]{32}$/);
      expect(pinData.iterations).toBe(100_000);
      expect(pinData.algorithm).toBe('SHA-256');
    });

    it('returns false for incorrect SHA-256 PIN input', async () => {
      // Pre-compute SHA-256 of "1234"
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode('1234'));
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      localStorageMock.setItem('shimo-pin-hash', hashHex);

      const result = await migrateLegacyPin('9999');

      expect(result).toBe(false);
      // Legacy key should still exist
      expect(localStorageMock.getItem('shimo-pin-hash')).toBe(hashHex);
      // No PBKDF2 data should be stored
      expect(localStorageMock.getItem('shimo-pin-data')).toBeNull();
    });

    it('returns false when no legacy PIN exists', async () => {
      const result = await migrateLegacyPin('1234');
      expect(result).toBe(false);
    });

    it('prioritizes plaintext over SHA-256 when both exist', async () => {
      localStorageMock.setItem('shimo-app-pin', '4321');
      // Also set a SHA-256 hash for a different PIN
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode('9999'));
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      localStorageMock.setItem('shimo-pin-hash', hashHex);

      // Verify against the plaintext PIN
      const result = await migrateLegacyPin('4321');

      expect(result).toBe(true);
      expect(localStorageMock.getItem('shimo-app-pin')).toBeNull();
      // SHA-256 key may still exist (plaintext was migrated first)
      expect(localStorageMock.getItem('shimo-pin-data')).not.toBeNull();
    });

    it('does not migrate if stored value is already PBKDF2 format', async () => {
      // Store a PBKDF2 value in the SHA-256 key (edge case)
      const pbkdf2Data = JSON.stringify({
        hash: 'ab'.repeat(32),
        salt: 'cd'.repeat(16),
        iterations: 100000,
        algorithm: 'SHA-256',
      });
      localStorageMock.setItem('shimo-pin-hash', pbkdf2Data);

      const result = await migrateLegacyPin('1234');

      // Should return false since the format is not sha256
      expect(result).toBe(false);
    });
  });
});
