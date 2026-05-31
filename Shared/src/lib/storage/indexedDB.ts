/**
 * IndexedDB Storage Layer for Shimo (拾墨)
 *
 * Provides key-value persistence using IndexedDB with:
 * - idbGet/idbSet helpers for reading/writing
 * - 500ms debounced state persistence
 * - Degraded read-only mode when IndexedDB is unavailable
 *
 * Database: 'shimo-db', Object Store: 'state'
 */

const DB_NAME = 'shimo-db'
const DB_VERSION = 1
const STORE_NAME = 'state'

let dbPromise: Promise<IDBDatabase> | null = null
let storageAvailable: boolean | null = null

/**
 * Check if IndexedDB is available in the current environment.
 * Caches the result after first check.
 */
export function isStorageAvailable(): boolean {
  if (storageAvailable !== null) return storageAvailable

  try {
    storageAvailable = typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    storageAvailable = false
  }

  return storageAvailable
}

/**
 * Reset the storage availability cache.
 * Useful for testing or when environment changes.
 */
export function _resetStorageState(): void {
  storageAvailable = null
  dbPromise = null
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    if (!isStorageAvailable()) {
      reject(new Error('IndexedDB is not available'))
      return
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    req.onsuccess = () => resolve(req.result)

    req.onerror = () => {
      dbPromise = null
      storageAvailable = false
      reject(req.error)
    }
  })

  return dbPromise
}

/**
 * Read a value from IndexedDB by key.
 * Returns null if the key doesn't exist or if IndexedDB is unavailable (degraded mode).
 */
export async function idbGet<T>(key: string): Promise<T | null> {
  if (!isStorageAvailable()) {
    console.warn('[Shimo Storage] IndexedDB unavailable — read returning null (degraded read-only mode)')
    return null
  }

  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(key)
      req.onsuccess = () => resolve((req.result as T) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    console.warn('[Shimo Storage] IndexedDB read failed — returning null (degraded read-only mode)')
    return null
  }
}

/**
 * Write a value to IndexedDB by key.
 * No-op with a warning if IndexedDB is unavailable (degraded read-only mode).
 */
export async function idbSet(key: string, value: unknown): Promise<void> {
  if (!isStorageAvailable()) {
    console.warn('[Shimo Storage] IndexedDB unavailable — write skipped (degraded read-only mode)')
    return
  }

  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    console.warn('[Shimo Storage] IndexedDB write failed (degraded read-only mode)')
  }
}

/**
 * Delete a value from IndexedDB by key.
 * No-op if IndexedDB is unavailable.
 */
export async function idbDelete(key: string): Promise<void> {
  if (!isStorageAvailable()) {
    console.warn('[Shimo Storage] IndexedDB unavailable — delete skipped (degraded read-only mode)')
    return
  }

  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    console.warn('[Shimo Storage] IndexedDB delete failed')
  }
}

// === Debounced Persistence ===

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const DEBOUNCE_MS = 500

/**
 * Debounced (500ms) wrapper around idbSet.
 * Multiple calls with the same key within 500ms will only trigger one write
 * with the latest value.
 */
export function debouncedPersist(key: string, value: unknown): void {
  if (!isStorageAvailable()) {
    console.warn('[Shimo Storage] IndexedDB unavailable — debounced persist skipped (degraded read-only mode)')
    return
  }

  const existing = debounceTimers.get(key)
  if (existing !== undefined) {
    clearTimeout(existing)
  }

  const timer = setTimeout(() => {
    debounceTimers.delete(key)
    idbSet(key, value).catch((err) => {
      console.error('[Shimo Storage] Debounced persist failed:', err)
    })
  }, DEBOUNCE_MS)

  debounceTimers.set(key, timer)
}

/**
 * Cancel any pending debounced persist for a given key.
 * Useful for cleanup or testing.
 */
export function cancelDebouncedPersist(key: string): void {
  const existing = debounceTimers.get(key)
  if (existing !== undefined) {
    clearTimeout(existing)
    debounceTimers.delete(key)
  }
}

/**
 * Flush a pending debounced persist immediately (for app shutdown scenarios).
 * Returns a promise that resolves when the write completes.
 */
export async function flushDebouncedPersist(key: string, value: unknown): Promise<void> {
  cancelDebouncedPersist(key)
  await idbSet(key, value)
}

// === Migration Helper ===

/**
 * Migrate data from localStorage to IndexedDB (one-time).
 * Returns the migrated data or null if nothing to migrate.
 */
export async function migrateFromLocalStorage(key: string): Promise<unknown | null> {
  if (!isStorageAvailable()) {
    return null
  }

  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null

    const data = JSON.parse(raw)
    await idbSet(key, data)
    localStorage.setItem(key + '-migrated', '1')
    return data
  } catch {
    return null
  }
}
