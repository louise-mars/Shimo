/**
 * PIN Security Module
 * 
 * Implements PBKDF2-based PIN hashing and verification using Web Crypto API.
 * - 100,000 iterations with SHA-256
 * - 16-byte random salt per hash
 * - HMAC-signed attempt counter to prevent localStorage tampering
 * - Escalating lockout durations after failed attempts
 * 
 * This is a pure cryptographic module with no dependencies on the store.
 */

// --- Types ---

export interface LockoutThreshold {
  attempts: number;
  durationSeconds: number;
}

export const DEFAULT_LOCKOUT_THRESHOLDS: LockoutThreshold[] = [
  { attempts: 3, durationSeconds: 60 },       // 60s after 3 failures
  { attempts: 6, durationSeconds: 300 },      // 5min after 6 failures
  { attempts: 10, durationSeconds: 1800 },    // 30min after 10 failures
];

// --- Utility helpers ---

function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// --- Core functions ---

/**
 * Hash a PIN using PBKDF2 with a random 16-byte salt.
 * Returns the hex-encoded derived key and hex-encoded salt.
 * 
 * @param pin - The PIN string to hash
 * @returns Object with hex-encoded hash and hex-encoded salt
 */
export async function hashPin(pin: string): Promise<{ hash: string; salt: string }> {
  const encoder = new TextEncoder();

  // Generate a cryptographically random 16-byte salt
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);

  // Import the PIN as key material for PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // Derive 256 bits (32 bytes) using PBKDF2 with 100K iterations and SHA-256
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return {
    hash: uint8ArrayToHex(new Uint8Array(derivedBits)),
    salt: uint8ArrayToHex(saltBytes),
  };
}

/**
 * Verify a PIN against a stored hash and salt.
 * Re-derives the key with the same parameters and compares.
 * 
 * @param pin - The PIN string to verify
 * @param hash - The hex-encoded stored derived key
 * @param salt - The hex-encoded salt used during hashing
 * @returns true if the PIN matches, false otherwise
 */
export async function verifyPin(pin: string, hash: string, salt: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const saltBytes = hexToUint8Array(salt);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const derivedHex = uint8ArrayToHex(new Uint8Array(derivedBits));

  // Constant-time comparison to prevent timing attacks
  if (derivedHex.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < derivedHex.length; i++) {
    diff |= derivedHex.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Get the lockout duration in seconds based on the number of failed attempts.
 * 
 * Escalation:
 * - 0-2 attempts: 0 (no lockout)
 * - 3-5 attempts: 60 seconds
 * - 6-9 attempts: 300 seconds (5 minutes)
 * - 10+ attempts: 1800 seconds (30 minutes)
 * 
 * @param failedAttempts - The number of consecutive failed PIN attempts
 * @returns Lockout duration in seconds (0 means no lockout)
 */
export function getLockoutDuration(failedAttempts: number): number {
  let duration = 0;
  for (const threshold of DEFAULT_LOCKOUT_THRESHOLDS) {
    if (failedAttempts >= threshold.attempts) {
      duration = threshold.durationSeconds;
    }
  }
  return duration;
}

/**
 * Sign a counter value using HMAC-SHA256 to prevent tampering.
 * Used to protect the attempt counter stored in localStorage.
 * 
 * @param counter - The counter value to sign
 * @param secret - The device secret used as the HMAC key
 * @returns Hex-encoded HMAC signature
 */
export async function signCounter(counter: number, secret: string): Promise<string> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(String(counter))
  );

  return uint8ArrayToHex(new Uint8Array(signature));
}
