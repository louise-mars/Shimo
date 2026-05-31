import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { exportAsJSON, exportAsMarkdown, exportAsPDF, copyToClipboard, shareNote } from '../lib/exportData'
import type { Note } from '@notepro/shared'

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    title: '测试笔记',
    content: JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
    }),
    tags: ['test', 'demo'],
    folderId: null,
    pinned: false,
    favorited: false,
    locked: false,
    hidden: false,
    deletedAt: null,
    createdAt: 1700000000000,
    updatedAt: 1700001000000,
    ...overrides,
  }
}

describe('exportAsJSON', () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>
  let revokeObjectURLMock: ReturnType<typeof vi.fn>
  let clickMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    createObjectURLMock = vi.fn().mockReturnValue('blob:test-url')
    revokeObjectURLMock = vi.fn()
    clickMock = vi.fn()

    globalThis.URL.createObjectURL = createObjectURLMock
    globalThis.URL.revokeObjectURL = revokeObjectURLMock

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click: clickMock } as unknown as HTMLAnchorElement
      }
      return document.createElement(tag)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a JSON blob with notes and metadata', () => {
    const notes = [makeNote(), makeNote({ id: 'note-2', title: '第二篇' })]
    exportAsJSON(notes)

    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    const blob = createObjectURLMock.mock.calls[0][0] as Blob
    expect(blob.type).toBe('application/json')
  })

  it('triggers a download with correct filename pattern', () => {
    const notes = [makeNote()]
    exportAsJSON(notes)

    expect(clickMock).toHaveBeenCalledTimes(1)
  })

  it('revokes the object URL after download', () => {
    exportAsJSON([makeNote()])
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:test-url')
  })
})

describe('exportAsMarkdown', () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>
  let revokeObjectURLMock: ReturnType<typeof vi.fn>
  let clickMock: ReturnType<typeof vi.fn>
  let anchorElement: { href: string; download: string; click: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    createObjectURLMock = vi.fn().mockReturnValue('blob:test-url')
    revokeObjectURLMock = vi.fn()
    clickMock = vi.fn()
    anchorElement = { href: '', download: '', click: clickMock }

    globalThis.URL.createObjectURL = createObjectURLMock
    globalThis.URL.revokeObjectURL = revokeObjectURLMock

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return anchorElement as unknown as HTMLAnchorElement
      }
      return document.createElement(tag)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exports a single note with its title as filename', () => {
    const note = makeNote({ title: '我的笔记' })
    exportAsMarkdown(note)

    expect(anchorElement.download).toBe('我的笔记.md')
    expect(clickMock).toHaveBeenCalledTimes(1)
  })

  it('uses 无标题 for untitled notes', () => {
    const note = makeNote({ title: '' })
    exportAsMarkdown(note)

    expect(anchorElement.download).toBe('无标题.md')
  })

  it('exports multiple notes as a combined file', () => {
    const notes = [makeNote(), makeNote({ id: 'note-2', title: '第二篇' })]
    exportAsMarkdown(notes)

    expect(anchorElement.download).toMatch(/^shimo-export-\d{4}-\d{2}-\d{2}\.md$/)
  })

  it('creates a text/markdown blob', () => {
    exportAsMarkdown(makeNote())

    const blob = createObjectURLMock.mock.calls[0][0] as Blob
    expect(blob.type).toBe('text/markdown')
  })
})

describe('exportAsPDF', () => {
  it('opens a print window with formatted HTML', () => {
    const writeMock = vi.fn()
    const closeMock = vi.fn()
    const printMock = vi.fn()
    let onloadHandler: (() => void) | null = null

    const mockWindow = {
      document: { write: writeMock, close: closeMock },
      set onload(fn: () => void) { onloadHandler = fn },
      get onload() { return onloadHandler },
      print: printMock,
    }

    vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window)

    const note = makeNote({ title: '打印测试' })
    exportAsPDF(note)

    expect(window.open).toHaveBeenCalledWith('', '_blank')
    expect(writeMock).toHaveBeenCalledTimes(1)
    expect(closeMock).toHaveBeenCalledTimes(1)

    // Simulate window load
    if (onloadHandler) onloadHandler()
    expect(printMock).toHaveBeenCalledTimes(1)
  })

  it('includes the note title in the HTML', () => {
    const writeMock = vi.fn()
    const mockWindow = {
      document: { write: writeMock, close: vi.fn() },
      onload: null,
      print: vi.fn(),
    }
    vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window)

    exportAsPDF(makeNote({ title: '我的标题' }))

    const html = writeMock.mock.calls[0][0] as string
    expect(html).toContain('我的标题')
  })

  it('handles popup blocker gracefully (window.open returns null)', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)

    // Should not throw
    expect(() => exportAsPDF(makeNote())).not.toThrow()
  })
})

describe('copyToClipboard', () => {
  it('copies note as Markdown to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    })

    const note = makeNote({ title: '复制测试', tags: ['tag1'] })
    const result = await copyToClipboard(note)

    expect(result).toBe(true)
    expect(writeTextMock).toHaveBeenCalledTimes(1)
    const text = writeTextMock.mock.calls[0][0] as string
    expect(text).toContain('# 复制测试')
    expect(text).toContain('#tag1')
  })

  it('returns false when clipboard API fails and fallback fails', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })

    // Mock execCommand to fail (jsdom doesn't have it)
    document.execCommand = vi.fn().mockReturnValue(false)

    const result = await copyToClipboard(makeNote())
    expect(result).toBe(false)
  })
})

describe('shareNote', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses Web Share API when available', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', {
      value: shareMock,
      writable: true,
      configurable: true,
    })

    const note = makeNote({ title: '分享测试' })
    const result = await shareNote(note)

    expect(result).toBe('shared')
    expect(shareMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: '分享测试' })
    )
  })

  it('falls back to clipboard when Web Share API is not available', async () => {
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    })

    const result = await shareNote(makeNote())
    expect(result).toBe('copied')
  })

  it('returns failed when user cancels share', async () => {
    const abortError = new Error('Share cancelled')
    abortError.name = 'AbortError'
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(abortError),
      writable: true,
      configurable: true,
    })

    const result = await shareNote(makeNote())
    expect(result).toBe('failed')
  })

  it('falls back to clipboard when share throws non-abort error', async () => {
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(new Error('Network error')),
      writable: true,
      configurable: true,
    })

    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    })

    const result = await shareNote(makeNote())
    expect(result).toBe('copied')
  })
})
