/**
 * Image Compression Pipeline
 *
 * Provides canvas-based image compression with iterative quality reduction.
 * Images > 5MB are compressed down to ≤ 2MB starting at 80% quality.
 * Images > 100KB should use native storage instead of inline base64.
 *
 * Requirements: 2.3, 14.3
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Images larger than this threshold should be compressed before storage (5MB) */
export const COMPRESS_THRESHOLD = 5 * 1024 * 1024

/** Images larger than this threshold should use native file storage (100KB) */
export const NATIVE_STORAGE_THRESHOLD = 100 * 1024

/** Target maximum size after compression (2MB) */
export const TARGET_SIZE = 2 * 1024 * 1024

// ─── Threshold Detection ─────────────────────────────────────────────────────

/**
 * Determine if a blob should be compressed before storage.
 * Returns true if the blob exceeds 5MB.
 */
export function shouldCompress(blob: Blob): boolean {
  return blob.size > COMPRESS_THRESHOLD
}

/**
 * Determine if a blob should use native file storage instead of inline base64.
 * Returns true if the blob exceeds 100KB.
 */
export function shouldUseNativeStorage(blob: Blob): boolean {
  return blob.size > NATIVE_STORAGE_THRESHOLD
}

// ─── Compression Pipeline ────────────────────────────────────────────────────

export interface CompressImageOptions {
  /** Maximum size in bytes for the compressed output. Default: 2MB */
  maxSizeBytes?: number
  /** Initial JPEG quality (0-1). Default: 0.8 */
  initialQuality?: number
}

/**
 * Compress an image blob using canvas-based lossy compression.
 *
 * Algorithm:
 * 1. Decode the image using createImageBitmap
 * 2. Draw onto a canvas (OffscreenCanvas if available, otherwise HTMLCanvasElement)
 * 3. Export as JPEG at the initial quality (default 80%)
 * 4. If still over target size, iteratively reduce quality by 10% until target is met
 * 5. Stop reducing at 10% quality minimum to avoid unacceptable degradation
 *
 * Returns the original blob if:
 * - It's already under the target size
 * - Compression fails for any reason
 * - The compressed result is somehow larger than the original
 */
export async function compressImage(
  blob: Blob,
  options?: CompressImageOptions
): Promise<Blob> {
  const maxSizeBytes = options?.maxSizeBytes ?? TARGET_SIZE
  const initialQuality = options?.initialQuality ?? 0.8

  // If already under target, return as-is
  if (blob.size <= maxSizeBytes) {
    return blob
  }

  try {
    // Decode the image
    const imageBitmap = await createImageBitmap(blob)
    const { width, height } = imageBitmap

    // Create canvas for rendering
    const canvas = createCanvas(width, height)
    const ctx = getCanvasContext(canvas)

    if (!ctx) {
      // Cannot get context, return original
      imageBitmap.close()
      return blob
    }

    ctx.drawImage(imageBitmap, 0, 0)
    imageBitmap.close()

    // Iteratively compress with reducing quality
    let currentQuality = initialQuality
    const minQuality = 0.1
    const qualityStep = 0.1

    let result = await canvasToBlob(canvas, 'image/jpeg', currentQuality)

    while (result.size > maxSizeBytes && currentQuality > minQuality) {
      currentQuality = Math.max(currentQuality - qualityStep, minQuality)
      result = await canvasToBlob(canvas, 'image/jpeg', currentQuality)
    }

    // If compressed result is larger than original, return original
    if (result.size >= blob.size) {
      return blob
    }

    return result
  } catch {
    // If compression fails for any reason, return the original blob
    return blob
  }
}

// ─── Canvas Helpers ──────────────────────────────────────────────────────────

type CanvasLike = OffscreenCanvas | HTMLCanvasElement

/**
 * Create a canvas of the given dimensions.
 * Prefers OffscreenCanvas for better performance in workers,
 * falls back to HTMLCanvasElement in DOM environments.
 */
function createCanvas(width: number, height: number): CanvasLike {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }

  // Fallback to HTMLCanvasElement (DOM environment)
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }

  // Last resort: try OffscreenCanvas anyway (should not reach here)
  return new (OffscreenCanvas as unknown as new (w: number, h: number) => OffscreenCanvas)(width, height)
}

/**
 * Get a 2D rendering context from a canvas.
 */
function getCanvasContext(
  canvas: CanvasLike
): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null {
  return canvas.getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null
}

/**
 * Convert a canvas to a Blob.
 * Uses convertToBlob for OffscreenCanvas, toBlob for HTMLCanvasElement.
 */
async function canvasToBlob(
  canvas: CanvasLike,
  type: string,
  quality: number
): Promise<Blob> {
  // Check for convertToBlob method (OffscreenCanvas)
  if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type, quality })
  }

  // HTMLCanvasElement uses callback-based toBlob
  return new Promise<Blob>((resolve, reject) => {
    ;(canvas as HTMLCanvasElement).toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Canvas toBlob returned null'))
        }
      },
      type,
      quality
    )
  })
}
