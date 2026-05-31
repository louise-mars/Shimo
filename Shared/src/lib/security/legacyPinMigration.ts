/**
 * Legacy PIN Migration Module
 * 
 * Detects and migrates legacy PIN formats to the current PBKDF2 standard.
 * 
 * Legacy formats:
 * 1. Plaintext PIN (4-6 digit string stored directly in 'shimo-app-pin')
 * 2. SHA-256 hash (64-char hex string stored in 'shimo-pin-hash')
 * 
 * Current format:
 * - PBKDF2 with 100K iterations, SHA-256, 16-byte salt
 * - Stored as JSON in 'shimo-pin-data': { hash, salt, iterations, algorithm }
 * 
 * Migration flow:
 * 1. detectPinFormat() identifies what format is currently stored
 * 2. migrateLegacyPin() verifies user input against legacy format, then re-hashes with PBKDF2
 */

import { hashPin } from './pinSecurity';

// --- Storage keys ---

const LEGACY_PLAINTEXT_KEY = 'shimo-app-pin';
const LEGACY_SHA256_KEY = 'shimo-pin-hash';
const PBKDF2_KEY = 'shimo-pin-data';

// --- Types ---

export type PinFormat = 'plaintext' | 'sha256' | 'pbkdf2' | 'unknown';

export interface Pbkdf2PinData {
  hash: string;
  salt: string;
  iterations: number;
  algorithm: string;
}

// --- Detection ---

/**
 * Detect the format of a stored PIN value.
 * 
 * - 'plaintext': A 4-6 digit numeric string (legacy v1)
 * - 'sha256': A 64-character hex string (legacy v2)
 * - 'pbkdf2': A JSON object with hash, salt, iterations, algorithm fields
 * - 'unknown': Unrecognized format
 * 
 * @param stored - The raw stored PIN value from localStorage
 * @returns The detected format
 */
export function detectPinFormat(stored: string): PinFormat {
  if (!stored || stored.trim() === '') {
    return 'unknown';
  }

  // Try parsing as JSON (PBKDF2 format)
  try {
    const parsed = JSON.parse(stored);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.hash === 'string' &&
      typeof parsed.salt === 'string' &&
      typeof parsed.iterations === 'number' &&
      typeof parsed.algorithm === 'string'
    ) {
      return 'pbkdf2';
    }
  } catch {
    // Not JSON, continue checking other formats
  }

  // Check for plaintext PIN: 4-6 digit numeric string
  if (/^\d{4,6}$/.test(stored)) {
    return 'plaintext';
  }

  // Check for SHA-256 hash: exactly 64 hex characters
  if (/^[0-9a-f]{64}$/.test(stored)) {
    return 'sha256';
  }

  return 'unknown';
}

// --- Verification helpers ---

/**
 * Verify user input against a legacy plaintext PIN.
 */
function verifyPlaintext(userInput: string, stored: string): boolean {
  // Constant-time comparison to prevent timing attacks
  if (userInput.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < userInput.length; i++) {
    diff |= userInput.charCodeAt(i) ^ stored.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verify user input against a legacy SHA-256 hash.
 * The legacy format hashed the PIN directly with SHA-256 (no salt).
 */
async function verifySha256(userInput: string, storedHash: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(userInput);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const computedHash = Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison
  if (computedHash.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHash.length; i++) {
    diff |= computedHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}

// --- Migration ---

/**
 * Migrate a legacy PIN to PBKDF2 format.
 * 
 * Detects the current storage format, verifies the user's input against
 * the legacy format, and if successful, re-hashes with PBKDF2 and stores
 * the new hash in localStorage under 'shimo-pin-data'.
 * 
 * After successful migration, legacy keys are removed from localStorage.
 * 
 * @param userInput - The PIN entered by the user
 * @returns true if migration succeeded (PIN verified and re-hashed), false otherwise
 */
export async function migrateLegacyPin(userInput: string): Promise<boolean> {
  // Check for plaintext PIN first (oldest format)
  const plaintextStored = localStorage.getItem(LEGACY_PLAINTEXT_KEY);
  if (plaintextStored) {
    const format = detectPinFormat(plaintextStored);
    if (format === 'plaintext') {
      const verified = verifyPlaintext(userInput, plaintextStored);
      if (verified) {
        await migrateToPbkdf2(userInput);
        localStorage.removeItem(LEGACY_PLAINTEXT_KEY);
        return true;
      }
      return false;
    }
  }

  // Check for SHA-256 hash (intermediate format)
  const sha256Stored = localStorage.getItem(LEGACY_SHA256_KEY);
  if (sha256Stored) {
    const format = detectPinFormat(sha256Stored);
    if (format === 'sha256') {
      const verified = await verifySha256(userInput, sha256Stored);
      if (verified) {
        await migrateToPbkdf2(userInput);
        localStorage.removeItem(LEGACY_SHA256_KEY);
        return true;
      }
      return false;
    }
  }

  // No legacy PIN found or already migrated
  return false;
}

/**
 * Hash the PIN with PBKDF2 and store in the new format.
 */
async function migrateToPbkdf2(userInput: string): Promise<void> {
  const { hash, salt } = await hashPin(userInput);
  const pinData: Pbkdf2PinData = {
    hash,
    salt,
    iterations: 100_000,
    algorithm: 'SHA-256',
  };
  localStorage.setItem(PBKDF2_KEY, JSON.stringify(pinData));
}
