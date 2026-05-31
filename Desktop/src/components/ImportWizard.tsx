import { useState, useRef, useCallback } from 'react'
import { useStore } from '../store'
import {
  importMarkdownToNote,
  readFileAsText,
  compressImage,
  shouldCompress,
  COMPRESS_THRESHOLD,
} from '@notepro/shared'
import type { Note } from '@notepro/shared'
import { v4 as uuid } from 'uuid'

type Step = 'choose' | 'importing' | 'done' | 'error'

interface ImportProgress {
  current: number
  total: number
  currentFile: string
}

interface ImportResult {
  noteCount: number
  compressedImages: string[]
  errors: FileError[]
}

interface FileError {
  filename: string
  message: string
}

/**
 * Resolve a relative image path from markdown content.
 * Attempts to read the image file relative to the source markdown file.
 * Returns a Blob if successful, null otherwise.
 */
async function resolveImageFile(
  imagePath: string,
  sourceFile: File
): Promise<Blob | null> {
  try {
    // In a browser/Tauri context, we can't directly resolve relative paths
    // from a File object. We rely on the file input's webkitRelativePath or
    // attempt to use the File System Access API if available.
    // For now, we strip the image reference if we can't resolve it.
    // In Tauri, this would use the fs plugin to read relative to the source.
    if ('path' in sourceFile && typeof (sourceFile as unknown as { path: string }).path === 'string') {
      // Tauri provides a `path` property on File objects
      const sourcePath = (sourceFile as unknown as { path: string }).path
      const dir = sourcePath.substring(0, sourcePath.lastIndexOf(/[/\\]/.test(sourcePath) ? sourcePath.match(/[/\\]/g)!.pop()! : '/'))
      const fullPath = `${dir}/${imagePath.replace(/^\.\//, '')}`

      // Try using Tauri's fs API
      try {
        const { readFile } = await import('@tauri-apps/plugin-fs')
        const data = await readFile(fullPath)
        return new Blob([data])
      } catch {
        return null
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Process image references in TipTap JSON content.
 * Resolves relative image paths, compresses large images, and returns
 * updated content with asset URIs or stripped references.
 */
async function processImagesInContent(
  content: string,
  sourceFile: File,
  compressedImages: string[],
  unresolvedImages: string[]
): Promise<string> {
  try {
    const doc = JSON.parse(content)
    if (doc.content) {
      await processNodes(doc.content, sourceFile, compressedImages, unresolvedImages)
    }
    return JSON.stringify(doc)
  } catch {
    return content
  }
}

async function processNodes(
  nodes: Array<{ type?: string; attrs?: Record<string, unknown>; content?: unknown[] }>,
  sourceFile: File,
  compressedImages: string[],
  unresolvedImages: string[]
): Promise<void> {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (node.type === 'image' && node.attrs?.src) {
      const src = node.attrs.src as string
      // Only process relative paths (not URLs or data URIs)
      if (!src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('asset://')) {
        const blob = await resolveImageFile(src, sourceFile)
        if (blob) {
          // Compress if needed
          let finalBlob = blob
          if (shouldCompress(blob)) {
            finalBlob = await compressImage(blob)
            compressedImages.push(src)
          }
          // Store as data URI for now (ImageStore integration happens at editor level)
          const reader = new FileReader()
          const dataUri = await new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string)
            reader.readAsDataURL(finalBlob)
          })
          node.attrs.src = dataUri
        } else {
          // Cannot resolve - strip the image reference
          unresolvedImages.push(src)
          // Replace image node with empty paragraph
          nodes[i] = { type: 'paragraph', content: [] }
        }
      }
    }
    // Recurse into child nodes
    if (node.content && Array.isArray(node.content)) {
      await processNodes(
        node.content as Array<{ type?: string; attrs?: Record<string, unknown>; content?: unknown[] }>,
        sourceFile,
        compressedImages,
        unresolvedImages
      )
    }
  }
}

/**
 * Create a Note from plain text content.
 * Wraps the text in a TipTap paragraph node structure.
 */
function createTextNote(filename: string, text: string): Note {
  const title = filename.replace(/\.(txt|text)$/i, '')
  const paragraphs = text.split(/\n\n+/).filter(Boolean)
  const content = JSON.stringify({
    type: 'doc',
    content: paragraphs.map(para => ({
      type: 'paragraph',
      content: [{ type: 'text', text: para.replace(/\n/g, ' ') }],
    })),
  })

  return {
    id: uuid(),
    title,
    content,
    tags: [],
    folderId: null,
    pinned: false,
    favorited: false,
    locked: false,
    hidden: false,
    deletedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

/**
 * Parse a JSON backup file into an array of Note objects.
 * Supports both array format and { notes: Note[] } format.
 */
function parseJsonBackup(text: string): Note[] {
  const data = JSON.parse(text)
  const notes: Note[] = Array.isArray(data) ? data : data.notes || []

  // Validate and ensure required fields
  return notes.map(note => ({
    id: note.id || uuid(),
    title: note.title || '',
    content: note.content || '',
    tags: Array.isArray(note.tags) ? note.tags : [],
    folderId: note.folderId ?? null,
    pinned: note.pinned ?? false,
    favorited: note.favorited ?? false,
    locked: note.locked ?? false,
    hidden: note.hidden ?? false,
    deletedAt: note.deletedAt ?? null,
    createdAt: note.createdAt || Date.now(),
    updatedAt: note.updatedAt || Date.now(),
  }))
}

export default function ImportWizard({ onClose }: { onClose: () => void }) {
  const { dispatch } = useStore()
  const [step, setStep] = useState<Step>('choose')
  const [progress, setProgress] = useState<ImportProgress>({ current: 0, total: 0, currentFile: '' })
  const [result, setResult] = useState<ImportResult>({ noteCount: 0, compressedImages: [], errors: [] })
  const mdRef = useRef<HTMLInputElement>(null)
  const txtRef = useRef<HTMLInputElement>(null)
  const jsonRef = useRef<HTMLInputElement>(null)

  const handleMarkdownFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setStep('importing')

    const fileArray = Array.from(files)
    const notes: Note[] = []
    const errors: FileError[] = []
    const compressedImages: string[] = []

    setProgress({ current: 0, total: fileArray.length, currentFile: '' })

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i]
      setProgress({ current: i + 1, total: fileArray.length, currentFile: file.name })

      try {
        const text = await readFileAsText(file)
        const note = importMarkdownToNote(text, null)

        // Process image references in the content
        const unresolvedImages: string[] = []
        const processedContent = await processImagesInContent(
          note.content,
          file,
          compressedImages,
          unresolvedImages
        )
        note.content = processedContent

        // Report unresolved images as warnings (not fatal errors)
        if (unresolvedImages.length > 0) {
          errors.push({
            filename: file.name,
            message: `无法解析图片: ${unresolvedImages.join(', ')}`,
          })
        }

        notes.push(note)
      } catch (err) {
        errors.push({
          filename: file.name,
          message: err instanceof Error ? err.message : '解析失败',
        })
      }
    }

    if (notes.length > 0) {
      dispatch({ type: 'IMPORT_NOTES', notes })
    }

    setResult({ noteCount: notes.length, compressedImages, errors })
    setStep(notes.length > 0 || errors.length > 0 ? 'done' : 'error')

    // Reset file input
    if (mdRef.current) mdRef.current.value = ''
  }, [dispatch])

  const handleTxtFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setStep('importing')

    const fileArray = Array.from(files)
    const notes: Note[] = []
    const errors: FileError[] = []

    setProgress({ current: 0, total: fileArray.length, currentFile: '' })

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i]
      setProgress({ current: i + 1, total: fileArray.length, currentFile: file.name })

      try {
        const text = await readFileAsText(file)
        notes.push(createTextNote(file.name, text))
      } catch (err) {
        errors.push({
          filename: file.name,
          message: err instanceof Error ? err.message : '读取失败',
        })
      }
    }

    if (notes.length > 0) {
      dispatch({ type: 'IMPORT_NOTES', notes })
    }

    setResult({ noteCount: notes.length, compressedImages: [], errors })
    setStep(notes.length > 0 || errors.length > 0 ? 'done' : 'error')

    if (txtRef.current) txtRef.current.value = ''
  }, [dispatch])

  const handleJsonImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setStep('importing')
    setProgress({ current: 1, total: 1, currentFile: file.name })

    try {
      const text = await readFileAsText(file)
      const notes = parseJsonBackup(text)

      if (notes.length === 0) {
        setResult({ noteCount: 0, compressedImages: [], errors: [{ filename: file.name, message: 'JSON 文件中没有找到笔记数据' }] })
        setStep('done')
        return
      }

      dispatch({ type: 'IMPORT_NOTES', notes })
      setResult({ noteCount: notes.length, compressedImages: [], errors: [] })
      setStep('done')
    } catch (err) {
      setResult({
        noteCount: 0,
        compressedImages: [],
        errors: [{ filename: file.name, message: err instanceof Error ? err.message : 'JSON 格式错误' }],
      })
      setStep('error')
    }

    if (jsonRef.current) jsonRef.current.value = ''
  }, [dispatch])

  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
    background: 'var(--bg-secondary)', border: '1.5px solid var(--border-light)',
    borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%',
    transition: 'all 150ms', fontFamily: 'var(--font-sans)',
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <div style={{
        width: 440, maxHeight: '80vh', background: 'var(--bg-elevated)', borderRadius: 14,
        border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden', animation: 'fadeIn 150ms ease-out',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-light)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)' }}>导入笔记</span>
          <button onClick={onClose} aria-label="关闭" style={{ border: 'none', background: 'none', fontSize: 18, color: 'var(--text-faint)', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Content */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          {step === 'choose' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>选择导入来源</p>

              <button onClick={() => mdRef.current?.click()} style={btnStyle}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}>
                <span style={{ fontSize: 24 }}>📝</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Markdown 文件</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>导入 .md 文件（支持多选）</div>
                </div>
              </button>

              <button onClick={() => txtRef.current?.click()} style={btnStyle}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}>
                <span style={{ fontSize: 24 }}>📄</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>纯文本文件</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>导入 .txt 文件（支持多选）</div>
                </div>
              </button>

              <button onClick={() => jsonRef.current?.click()} style={btnStyle}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}>
                <span style={{ fontSize: 24 }}>📦</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>JSON 备份</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>导入拾墨导出的 JSON 文件</div>
                </div>
              </button>

              <input ref={mdRef} type="file" accept=".md,.markdown" multiple style={{ display: 'none' }} onChange={handleMarkdownFiles} aria-label="选择 Markdown 文件" />
              <input ref={txtRef} type="file" accept=".txt,.text" multiple style={{ display: 'none' }} onChange={handleTxtFiles} aria-label="选择文本文件" />
              <input ref={jsonRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleJsonImport} aria-label="选择 JSON 文件" />
            </div>
          )}

          {step === 'importing' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', gap: 12 }}>
              <div style={{ fontSize: 32, animation: 'spin 1s linear infinite' }}>⏳</div>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>正在导入...</p>
              {progress.total > 0 && (
                <>
                  <div style={{
                    width: '100%', maxWidth: 280, height: 6, borderRadius: 3,
                    background: 'var(--bg-tertiary)', overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      background: 'var(--accent)',
                      width: `${Math.round((progress.current / progress.total) * 100)}%`,
                      transition: 'width 200ms ease',
                    }} />
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {progress.current} / {progress.total} — {progress.currentFile}
                  </p>
                </>
              )}
            </div>
          )}

          {step === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', gap: 12 }}>
              <div style={{ fontSize: 36 }}>✅</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>导入完成</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                成功导入 {result.noteCount} 条笔记
              </p>

              {/* Compressed images notification */}
              {result.compressedImages.length > 0 && (
                <div style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
                  marginTop: 4,
                }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                    📦 已压缩 {result.compressedImages.length} 张超过 {Math.round(COMPRESS_THRESHOLD / 1024 / 1024)}MB 的图片
                  </p>
                </div>
              )}

              {/* Per-file errors/warnings */}
              {result.errors.length > 0 && (
                <div style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  background: 'var(--bg-secondary)', border: '1px solid var(--warning, #e6a700)',
                  marginTop: 4, maxHeight: 120, overflowY: 'auto',
                }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
                    ⚠️ 部分文件导入时出现问题:
                  </p>
                  {result.errors.map((err, idx) => (
                    <p key={idx} style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 0' }}>
                      <strong>{err.filename}</strong>: {err.message}
                    </p>
                  ))}
                </div>
              )}

              <button onClick={onClose} style={{
                marginTop: 8, padding: '8px 24px', background: 'var(--accent)', color: 'white',
                border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              }}>完成</button>
            </div>
          )}

          {step === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', gap: 12 }}>
              <div style={{ fontSize: 36 }}>❌</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>导入失败</p>

              {/* Per-file error display */}
              {result.errors.length > 0 && (
                <div style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  background: 'var(--bg-secondary)', border: '1px solid var(--error, #e53e3e)',
                  maxHeight: 120, overflowY: 'auto',
                }}>
                  {result.errors.map((err, idx) => (
                    <p key={idx} style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0' }}>
                      <strong>{err.filename}</strong>: {err.message}
                    </p>
                  ))}
                </div>
              )}

              <button onClick={() => { setStep('choose'); setResult({ noteCount: 0, compressedImages: [], errors: [] }) }} style={{
                marginTop: 8, padding: '8px 24px', background: 'var(--accent)', color: 'white',
                border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              }}>重试</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
