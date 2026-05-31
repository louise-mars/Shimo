/**
 * Tests for Image Compression Pipeline
 *
 * Tests threshold detection functions and the compressImage pipeline.
 * Canvas-based compression uses mocked createImageBitmap and OffscreenCanvas.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  compressImage,
  shouldCompress,
  shouldUseNativeStorage,
  COMPRESS_THRESHOLD,
  NATIVE_STORAGE_THRESHOLD,
  TARGET_SIZE,
} from './compression'

// ─── Constants ───────────────────────────────────────────────────────────────

describe('compression constants', () => {
  it('COMPRESS_THRESHOLD is 5MB', () => {
    expect(COMPRESS_THRESHOLD).toBe(5 * 1024 * 1024)
  })

  it('NATIVE_STORAGE_THRESHOLD is 100KB', () => {
    expect(NATIVE_STORAGE_THRESHOLD).toBe(100 * 1024)
  })

  it('TARGET_SIZE is 2MB', () => {
    expect(TARGET_SIZE).toBe(2 * 1024 * 1024)
  })
})

// ─── shouldCompress ──────────────────────────────────────────────────────────

describe('shouldCompress', () => {
  it('returns true for blobs larger than 5MB', () => {
    const blob = new Blob([new ArrayBuffer(COMPRESS_THRESHOLD + 1)])
    expect(shouldCompress(blob)).toBe(true)
  })

  it('returns false for blobs exactly 5MB', () => {
    const blob = new Blob([new ArrayBuffer(COMPRESS_THRESHOLD)])
    expect(shouldCompress(blob)).toBe(false)
  })

  it('returns false for blobs smaller than 5MB', () => {
    const blob = new Blob([new ArrayBuffer(COMPRESS_THRESHOLD - 1)])
    expect(shouldCompress(blob)).toBe(false)
  })

  it('returns false for empty blobs', () => {
    const blob = new Blob([])
    expect(shouldCompress(blob)).toBe(false)
  })

  it('returns true for a 6MB blob', () => {
    const blob = new Blob([new ArrayBuffer(6 * 1024 * 1024)])
    expect(shouldCompress(blob)).toBe(true)
  })
})

// ─── shouldUseNativeStorage ──────────────────────────────────────────────────

describe('shouldUseNativeStorage', () => {
  it('returns true for blobs larger than 100KB', () => {
    const blob = new Blob([new ArrayBuffer(NATIVE_STORAGE_THRESHOLD + 1)])
    expect(shouldUseNativeStorage(blob)).toBe(true)
  })

  it('returns false for blobs exactly 100KB', () => {
    const blob = new Blob([new ArrayBuffer(NATIVE_STORAGE_THRESHOLD)])
    expect(shouldUseNativeStorage(blob)).toBe(false)
  })

  it('returns false for blobs smaller than 100KB', () => {
    const blob = new Blob([new ArrayBuffer(NATIVE_STORAGE_THRESHOLD - 1)])
    expect(shouldUseNativeStorage(blob)).toBe(false)
  })

  it('returns false for empty blobs', () => {
    const blob = new Blob([])
    expect(shouldUseNativeStorage(blob)).toBe(false)
  })

  it('returns true for a 1MB blob', () => {
    const blob = new Blob([new ArrayBuffer(1024 * 1024)])
    expect(shouldUseNativeStorage(blob)).toBe(true)
  })
})

// ─── compressImage ───────────────────────────────────────────────────────────

describe('compressImage', () => {
  let mockConvertToBlob: ReturnType<typeof vi.fn>
  let mockClose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockClose = vi.fn()

    // Mock createImageBitmap
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({
      width: 1920,
      height: 1080,
      close: mockClose,
    }))

    // Mock OffscreenCanvas as a class
    mockConvertToBlob = vi.fn()
    const MockOffscreenCanvas = vi.fn().mockImplementation(function (this: Record<string, unknown>, width: number, height: number) {
      this.width = width
      this.height = height
      this.getContext = () => ({
        drawImage: vi.fn(),
      })
      this.convertToBlob = mockConvertToBlob
    })
    vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns original blob if already under target size', async () => {
    const blob = new Blob([new ArrayBuffer(1024 * 1024)]) // 1MB, under 2MB target
    const result = await compressImage(blob)
    expect(result).toBe(blob)
    // Should not call createImageBitmap since blob is already small
    expect(vi.mocked(createImageBitmap)).not.toHaveBeenCalled()
  })

  it('compresses a blob larger than target size', async () => {
    const largeBlob = new Blob([new ArrayBuffer(6 * 1024 * 1024)]) // 6MB
    const compressedBlob = new Blob([new ArrayBuffer(1.5 * 1024 * 1024)]) // 1.5MB result

    mockConvertToBlob.mockResolvedValue(compressedBlob)

    const result = await compressImage(largeBlob)

    expect(result).toBe(compressedBlob)
    expect(result.size).toBeLessThan(largeBlob.size)
    expect(vi.mocked(createImageBitmap)).toHaveBeenCalledWith(largeBlob)
    expect(mockClose).toHaveBeenCalled()
  })

  it('iteratively reduces quality until target is met', async () => {
    const largeBlob = new Blob([new ArrayBuffer(6 * 1024 * 1024)]) // 6MB

    // First attempt at 80% quality: still too large (3MB)
    // Second attempt at 70% quality: still too large (2.5MB)
    // Third attempt at 60% quality: under target (1.8MB)
    const tooLarge1 = new Blob([new ArrayBuffer(3 * 1024 * 1024)])
    const tooLarge2 = new Blob([new ArrayBuffer(2.5 * 1024 * 1024)])
    const smallEnough = new Blob([new ArrayBuffer(1.8 * 1024 * 1024)])

    mockConvertToBlob
      .mockResolvedValueOnce(tooLarge1)
      .mockResolvedValueOnce(tooLarge2)
      .mockResolvedValueOnce(smallEnough)

    const result = await compressImage(largeBlob)

    expect(result).toBe(smallEnough)
    expect(mockConvertToBlob).toHaveBeenCalledTimes(3)

    // Verify quality reduction: 0.8, 0.7, 0.6
    expect(mockConvertToBlob).toHaveBeenNthCalledWith(1, { type: 'image/jpeg', quality: 0.8 })
    expect(mockConvertToBlob).toHaveBeenNthCalledWith(2, { type: 'image/jpeg', quality: expect.closeTo(0.7, 5) })
    expect(mockConvertToBlob).toHaveBeenNthCalledWith(3, { type: 'image/jpeg', quality: expect.closeTo(0.6, 5) })
  })

  it('stops reducing quality at 10% minimum', async () => {
    const largeBlob = new Blob([new ArrayBuffer(6 * 1024 * 1024)]) // 6MB

    // Always returns something too large - should stop at quality 0.1
    const stillLarge = new Blob([new ArrayBuffer(3 * 1024 * 1024)])
    mockConvertToBlob.mockResolvedValue(stillLarge)

    const result = await compressImage(largeBlob)

    // Should still return the compressed result even if over target
    // (it's smaller than original since 3MB < 6MB)
    expect(result).toBe(stillLarge)

    // Quality steps: initial 0.8, then 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1 = 9 calls total
    expect(mockConvertToBlob).toHaveBeenCalledTimes(9)
  })

  it('returns original blob if compression fails', async () => {
    const largeBlob = new Blob([new ArrayBuffer(6 * 1024 * 1024)])

    vi.mocked(createImageBitmap).mockRejectedValue(new Error('Decode failed'))

    const result = await compressImage(largeBlob)
    expect(result).toBe(largeBlob)
  })

  it('returns original blob if compressed result is larger', async () => {
    const largeBlob = new Blob([new ArrayBuffer(3 * 1024 * 1024)]) // 3MB (over 2MB target)

    // Compressed result is somehow larger than original (edge case)
    const biggerResult = new Blob([new ArrayBuffer(4 * 1024 * 1024)])
    mockConvertToBlob.mockResolvedValue(biggerResult)

    const result = await compressImage(largeBlob)
    expect(result).toBe(largeBlob)
  })

  it('uses custom maxSizeBytes option', async () => {
    const blob = new Blob([new ArrayBuffer(3 * 1024 * 1024)]) // 3MB
    const compressedBlob = new Blob([new ArrayBuffer(500 * 1024)]) // 500KB

    mockConvertToBlob.mockResolvedValue(compressedBlob)

    // Custom target: 1MB
    const result = await compressImage(blob, { maxSizeBytes: 1 * 1024 * 1024 })
    expect(result).toBe(compressedBlob)
  })

  it('uses custom initialQuality option', async () => {
    const blob = new Blob([new ArrayBuffer(6 * 1024 * 1024)]) // 6MB
    const compressedBlob = new Blob([new ArrayBuffer(1.5 * 1024 * 1024)])

    mockConvertToBlob.mockResolvedValue(compressedBlob)

    await compressImage(blob, { initialQuality: 0.6 })

    // Should start at 0.6 quality instead of default 0.8
    expect(mockConvertToBlob).toHaveBeenCalledWith({ type: 'image/jpeg', quality: 0.6 })
  })

  it('closes ImageBitmap after use', async () => {
    const largeBlob = new Blob([new ArrayBuffer(6 * 1024 * 1024)])
    const compressedBlob = new Blob([new ArrayBuffer(1 * 1024 * 1024)])

    mockConvertToBlob.mockResolvedValue(compressedBlob)

    await compressImage(largeBlob)
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('returns original blob if canvas context is null', async () => {
    const largeBlob = new Blob([new ArrayBuffer(6 * 1024 * 1024)])

    // Override OffscreenCanvas to return null context
    vi.stubGlobal('OffscreenCanvas', vi.fn().mockImplementation((width: number, height: number) => ({
      width,
      height,
      getContext: () => null,
      convertToBlob: mockConvertToBlob,
    })))

    const result = await compressImage(largeBlob)
    expect(result).toBe(largeBlob)
    expect(mockClose).toHaveBeenCalled() // ImageBitmap should still be closed
  })
})
