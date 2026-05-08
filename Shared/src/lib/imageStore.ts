/**
 * 图片独立存储
 * 图片存入独立的 IndexedDB store，笔记内容只存引用 ID
 * 避免大图片撑爆主数据存储
 */

const DB_NAME = 'shimo-images'
const DB_VERSION = 1
const STORE_NAME = 'images'

let dbPromise: Promise<IDBDatabase> | null = null

function openImageDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB not available')); return }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

/**
 * 存储图片，返回引用 ID
 */
export async function saveImage(dataUrl: string): Promise<string> {
  const id = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  try {
    const db = await openImageDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(dataUrl, id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Fallback: return original dataUrl (will be stored inline)
    return dataUrl
  }
  return `shimo-img://${id}`
}

/**
 * 读取图片
 */
export async function loadImage(src: string): Promise<string> {
  if (!src.startsWith('shimo-img://')) return src
  const id = src.replace('shimo-img://', '')
  try {
    const db = await openImageDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(id)
      req.onsuccess = () => resolve(req.result || src)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return src
  }
}

/**
 * 删除图片
 */
export async function deleteImage(src: string): Promise<void> {
  if (!src.startsWith('shimo-img://')) return
  const id = src.replace('shimo-img://', '')
  try {
    const db = await openImageDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch { /* ignore */ }
}

/**
 * 检查 src 是否是图片引用（需要异步加载）
 */
export function isImageRef(src: string): boolean {
  return src.startsWith('shimo-img://')
}
