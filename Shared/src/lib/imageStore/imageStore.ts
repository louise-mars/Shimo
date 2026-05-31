/**
 * Image Store — Platform-native file storage with reference counting
 *
 * Stores images outside IndexedDB using platform-native filesystem APIs,
 * referenced via asset://local/{id}.{ext} URIs in TipTap JSON.
 *
 * Three implementations:
 * - TauriImageStore: Uses @tauri-apps/plugin-fs (Desktop)
 * - CapacitorImageStore: Uses @capacitor/filesystem (Mobile)
 * - IndexedDBImageStore: Fallback using IndexedDB object store
 *
 * A factory function detects the platform and returns the appropriate implementation.
 */

// ─── Asset URI Helpers ───────────────────────────────────────────────────────

/**
 * Generate an asset URI from an ID and extension.
 * Format: asset://local/{id}.{ext}
 */
export function makeAssetUri(id: string, ext: string): string {
  return `asset://local/${id}.${ext}`
}

/**
 * Parse an asset URI into its components.
 * Returns null if the URI doesn't match the expected format.
 */
export function parseAssetUri(uri: string): { id: string; ext: string } | null {
  const match = uri.match(/^asset:\/\/local\/(.+)\.(\w+)$/)
  return match ? { id: match[1], ext: match[2] } : null
}

// ─── Image Metadata ──────────────────────────────────────────────────────────

export interface ImageMetadata {
  id: string
  ext: string
  sizeBytes: number
  compressed: boolean
  refs: string[] // noteIds referencing this image (stored as array for serialization)
  createdAt: number
}

// ─── IImageStore Interface ───────────────────────────────────────────────────

export interface IImageStore {
  /** Store image data, returns asset URI (asset://local/{id}.{ext}) */
  save(data: Blob, ext: string): Promise<string>
  /** Load image data by asset URI. Returns null if not found. */
  load(assetUri: string): Promise<Blob | null>
  /** Increment reference count for an asset (called when a note references the image) */
  addRef(assetUri: string, noteId: string): Promise<void>
  /** Decrement reference count for an asset (called when a note removes the image or is deleted) */
  removeRef(assetUri: string, noteId: string): Promise<void>
  /** Remove orphaned images (refCount === 0). Returns number of images removed. */
  cleanOrphans(): Promise<number>
  /** Get storage usage stats */
  getUsage(): Promise<{ count: number; bytes: number }>
}

// ─── ID Generation ───────────────────────────────────────────────────────────

function generateImageId(): string {
  // Use crypto.randomUUID if available, otherwise fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID
  return 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)
}

// ─── Tauri Image Store ───────────────────────────────────────────────────────

/**
 * Desktop implementation using @tauri-apps/plugin-fs.
 * Stores images in the app data directory under an 'images/' subdirectory.
 */
export class TauriImageStore implements IImageStore {
  private metadata: Map<string, ImageMetadata> = new Map()
  private metadataKey = 'shimo-image-metadata'
  private basePath = 'images'
  private initialized = false

  private async init(): Promise<void> {
    if (this.initialized) return
    try {
      const { exists, mkdir } = await import('@tauri-apps/plugin-fs')
      const { appDataDir } = await import('@tauri-apps/api/path')
      const appData = await appDataDir()
      const dirPath = `${appData}${this.basePath}`
      if (!(await exists(dirPath))) {
        await mkdir(dirPath, { recursive: true })
      }
      await this.loadMetadata()
      this.initialized = true
    } catch (err) {
      console.error('[TauriImageStore] Init failed:', err)
      throw err
    }
  }

  private async loadMetadata(): Promise<void> {
    try {
      const raw = localStorage.getItem(this.metadataKey)
      if (raw) {
        const entries: ImageMetadata[] = JSON.parse(raw)
        this.metadata = new Map(entries.map((m) => [m.id, m]))
      }
    } catch {
      this.metadata = new Map()
    }
  }

  private saveMetadata(): void {
    const entries = Array.from(this.metadata.values())
    localStorage.setItem(this.metadataKey, JSON.stringify(entries))
  }

  async save(data: Blob, ext: string): Promise<string> {
    await this.init()
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const { appDataDir } = await import('@tauri-apps/api/path')

    const id = generateImageId()
    const filename = `${id}.${ext}`
    const appData = await appDataDir()
    const filePath = `${appData}${this.basePath}/${filename}`

    const arrayBuffer = await data.arrayBuffer()
    await writeFile(filePath, new Uint8Array(arrayBuffer))

    const meta: ImageMetadata = {
      id,
      ext,
      sizeBytes: data.size,
      compressed: false,
      refs: [],
      createdAt: Date.now(),
    }
    this.metadata.set(id, meta)
    this.saveMetadata()

    return makeAssetUri(id, ext)
  }

  async load(assetUri: string): Promise<Blob | null> {
    await this.init()
    const parsed = parseAssetUri(assetUri)
    if (!parsed) return null

    try {
      const { readFile } = await import('@tauri-apps/plugin-fs')
      const { appDataDir } = await import('@tauri-apps/api/path')
      const appData = await appDataDir()
      const filePath = `${appData}${this.basePath}/${parsed.id}.${parsed.ext}`

      const data = await readFile(filePath)
      return new Blob([new Uint8Array(data).buffer as ArrayBuffer])
    } catch {
      return null
    }
  }

  async addRef(assetUri: string, noteId: string): Promise<void> {
    await this.init()
    const parsed = parseAssetUri(assetUri)
    if (!parsed) return

    const meta = this.metadata.get(parsed.id)
    if (meta && !meta.refs.includes(noteId)) {
      meta.refs.push(noteId)
      this.saveMetadata()
    }
  }

  async removeRef(assetUri: string, noteId: string): Promise<void> {
    await this.init()
    const parsed = parseAssetUri(assetUri)
    if (!parsed) return

    const meta = this.metadata.get(parsed.id)
    if (meta) {
      meta.refs = meta.refs.filter((ref) => ref !== noteId)
      this.saveMetadata()
    }
  }

  async cleanOrphans(): Promise<number> {
    await this.init()
    const { remove } = await import('@tauri-apps/plugin-fs')
    const { appDataDir } = await import('@tauri-apps/api/path')
    const appData = await appDataDir()

    let removed = 0
    for (const [id, meta] of this.metadata) {
      if (meta.refs.length === 0) {
        try {
          const filePath = `${appData}${this.basePath}/${id}.${meta.ext}`
          await remove(filePath)
        } catch {
          // File may already be gone
        }
        this.metadata.delete(id)
        removed++
      }
    }

    if (removed > 0) {
      this.saveMetadata()
    }
    return removed
  }

  async getUsage(): Promise<{ count: number; bytes: number }> {
    await this.init()
    let bytes = 0
    for (const meta of this.metadata.values()) {
      bytes += meta.sizeBytes
    }
    return { count: this.metadata.size, bytes }
  }
}

// ─── Capacitor Image Store ───────────────────────────────────────────────────

/**
 * Mobile implementation using @capacitor/filesystem.
 * Stores images in the app documents directory under an 'images/' subdirectory.
 */
export class CapacitorImageStore implements IImageStore {
  private metadata: Map<string, ImageMetadata> = new Map()
  private metadataKey = 'shimo-image-metadata'
  private basePath = 'images'
  private initialized = false

  private async init(): Promise<void> {
    if (this.initialized) return
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      try {
        await Filesystem.mkdir({
          path: this.basePath,
          directory: Directory.Data,
          recursive: true,
        })
      } catch {
        // Directory may already exist
      }
      await this.loadMetadata()
      this.initialized = true
    } catch (err) {
      console.error('[CapacitorImageStore] Init failed:', err)
      throw err
    }
  }

  private async loadMetadata(): Promise<void> {
    try {
      const raw = localStorage.getItem(this.metadataKey)
      if (raw) {
        const entries: ImageMetadata[] = JSON.parse(raw)
        this.metadata = new Map(entries.map((m) => [m.id, m]))
      }
    } catch {
      this.metadata = new Map()
    }
  }

  private saveMetadata(): void {
    const entries = Array.from(this.metadata.values())
    localStorage.setItem(this.metadataKey, JSON.stringify(entries))
  }

  async save(data: Blob, ext: string): Promise<string> {
    await this.init()
    const { Filesystem, Directory } = await import('@capacitor/filesystem')

    const id = generateImageId()
    const filename = `${id}.${ext}`

    // Convert Blob to base64 for Capacitor Filesystem
    const base64 = await blobToBase64(data)

    await Filesystem.writeFile({
      path: `${this.basePath}/${filename}`,
      data: base64,
      directory: Directory.Data,
    })

    const meta: ImageMetadata = {
      id,
      ext,
      sizeBytes: data.size,
      compressed: false,
      refs: [],
      createdAt: Date.now(),
    }
    this.metadata.set(id, meta)
    this.saveMetadata()

    return makeAssetUri(id, ext)
  }

  async load(assetUri: string): Promise<Blob | null> {
    await this.init()
    const parsed = parseAssetUri(assetUri)
    if (!parsed) return null

    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const result = await Filesystem.readFile({
        path: `${this.basePath}/${parsed.id}.${parsed.ext}`,
        directory: Directory.Data,
      })

      // Capacitor returns base64 string
      const binary = atob(result.data as string)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      return new Blob([bytes])
    } catch {
      return null
    }
  }

  async addRef(assetUri: string, noteId: string): Promise<void> {
    await this.init()
    const parsed = parseAssetUri(assetUri)
    if (!parsed) return

    const meta = this.metadata.get(parsed.id)
    if (meta && !meta.refs.includes(noteId)) {
      meta.refs.push(noteId)
      this.saveMetadata()
    }
  }

  async removeRef(assetUri: string, noteId: string): Promise<void> {
    await this.init()
    const parsed = parseAssetUri(assetUri)
    if (!parsed) return

    const meta = this.metadata.get(parsed.id)
    if (meta) {
      meta.refs = meta.refs.filter((ref) => ref !== noteId)
      this.saveMetadata()
    }
  }

  async cleanOrphans(): Promise<number> {
    await this.init()
    const { Filesystem, Directory } = await import('@capacitor/filesystem')

    let removed = 0
    for (const [id, meta] of this.metadata) {
      if (meta.refs.length === 0) {
        try {
          await Filesystem.deleteFile({
            path: `${this.basePath}/${id}.${meta.ext}`,
            directory: Directory.Data,
          })
        } catch {
          // File may already be gone
        }
        this.metadata.delete(id)
        removed++
      }
    }

    if (removed > 0) {
      this.saveMetadata()
    }
    return removed
  }

  async getUsage(): Promise<{ count: number; bytes: number }> {
    await this.init()
    let bytes = 0
    for (const meta of this.metadata.values()) {
      bytes += meta.sizeBytes
    }
    return { count: this.metadata.size, bytes }
  }
}

// ─── IndexedDB Image Store (Fallback) ────────────────────────────────────────

const IDB_IMAGE_DB = 'shimo-images-v2'
const IDB_IMAGE_VERSION = 1
const IDB_IMAGE_STORE = 'blobs'

/**
 * Web/fallback implementation using IndexedDB.
 * Stores image blobs in a dedicated IndexedDB object store.
 */
export class IndexedDBImageStore implements IImageStore {
  private metadata: Map<string, ImageMetadata> = new Map()
  private metadataKey = 'shimo-image-metadata'
  private dbPromise: Promise<IDBDatabase> | null = null

  private openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB not available'))
        return
      }

      const req = indexedDB.open(IDB_IMAGE_DB, IDB_IMAGE_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(IDB_IMAGE_STORE)) {
          db.createObjectStore(IDB_IMAGE_STORE)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        this.dbPromise = null
        reject(req.error)
      }
    })

    return this.dbPromise
  }

  private loadMetadata(): void {
    try {
      const raw = localStorage.getItem(this.metadataKey)
      if (raw) {
        const entries: ImageMetadata[] = JSON.parse(raw)
        this.metadata = new Map(entries.map((m) => [m.id, m]))
      }
    } catch {
      this.metadata = new Map()
    }
  }

  private saveMetadata(): void {
    const entries = Array.from(this.metadata.values())
    localStorage.setItem(this.metadataKey, JSON.stringify(entries))
  }

  constructor() {
    this.loadMetadata()
  }

  async save(data: Blob, ext: string): Promise<string> {
    const db = await this.openDB()
    const id = generateImageId()
    const key = `${id}.${ext}`

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_IMAGE_STORE, 'readwrite')
      tx.objectStore(IDB_IMAGE_STORE).put(data, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    const meta: ImageMetadata = {
      id,
      ext,
      sizeBytes: data.size,
      compressed: false,
      refs: [],
      createdAt: Date.now(),
    }
    this.metadata.set(id, meta)
    this.saveMetadata()

    return makeAssetUri(id, ext)
  }

  async load(assetUri: string): Promise<Blob | null> {
    const parsed = parseAssetUri(assetUri)
    if (!parsed) return null

    try {
      const db = await this.openDB()
      const key = `${parsed.id}.${parsed.ext}`

      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_IMAGE_STORE, 'readonly')
        const req = tx.objectStore(IDB_IMAGE_STORE).get(key)
        req.onsuccess = () => {
          const result = req.result
          if (result instanceof Blob) {
            resolve(result)
          } else if (result) {
            // Handle case where data was stored as ArrayBuffer
            resolve(new Blob([result]))
          } else {
            resolve(null)
          }
        }
        req.onerror = () => reject(req.error)
      })
    } catch {
      return null
    }
  }

  async addRef(assetUri: string, noteId: string): Promise<void> {
    const parsed = parseAssetUri(assetUri)
    if (!parsed) return

    const meta = this.metadata.get(parsed.id)
    if (meta && !meta.refs.includes(noteId)) {
      meta.refs.push(noteId)
      this.saveMetadata()
    }
  }

  async removeRef(assetUri: string, noteId: string): Promise<void> {
    const parsed = parseAssetUri(assetUri)
    if (!parsed) return

    const meta = this.metadata.get(parsed.id)
    if (meta) {
      meta.refs = meta.refs.filter((ref) => ref !== noteId)
      this.saveMetadata()
    }
  }

  async cleanOrphans(): Promise<number> {
    const db = await this.openDB()
    let removed = 0

    for (const [id, meta] of this.metadata) {
      if (meta.refs.length === 0) {
        try {
          const key = `${id}.${meta.ext}`
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(IDB_IMAGE_STORE, 'readwrite')
            tx.objectStore(IDB_IMAGE_STORE).delete(key)
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
          })
        } catch {
          // Key may already be gone
        }
        this.metadata.delete(id)
        removed++
      }
    }

    if (removed > 0) {
      this.saveMetadata()
    }
    return removed
  }

  async getUsage(): Promise<{ count: number; bytes: number }> {
    let bytes = 0
    for (const meta of this.metadata.values()) {
      bytes += meta.sizeBytes
    }
    return { count: this.metadata.size, bytes }
  }
}

// ─── Utility: Blob to Base64 ─────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1] || result
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ─── Platform Detection & Factory ────────────────────────────────────────────

/**
 * Detect the current platform and return the appropriate IImageStore implementation.
 *
 * Detection order:
 * 1. Tauri: Check for window.__TAURI_INTERNALS__
 * 2. Capacitor: Check for window.Capacitor
 * 3. Fallback: IndexedDB
 */
export function createImageStore(): IImageStore {
  // Tauri 2 detection
  if (
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in window
  ) {
    return new TauriImageStore()
  }

  // Capacitor detection
  if (
    typeof window !== 'undefined' &&
    'Capacitor' in window &&
    (window as Record<string, unknown>).Capacitor != null
  ) {
    return new CapacitorImageStore()
  }

  // Fallback to IndexedDB
  return new IndexedDBImageStore()
}
