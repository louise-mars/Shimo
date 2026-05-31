import type { Note } from '@notepro/shared'
import { noteToMarkdown } from '@notepro/shared'

/**
 * Export all notes as JSON backup file download.
 * Includes metadata: exportedAt, app name, version.
 * Requirements: 15.1
 */
export function exportAsJSON(notes: Note[]): void {
  const data = JSON.stringify(
    { notes, exportedAt: new Date().toISOString(), app: 'shimo', version: '1.0' },
    null,
    2
  )
  const blob = new Blob([data], { type: 'application/json' })
  triggerDownload(blob, `shimo-backup-${datestamp()}.json`)
}

/**
 * Export notes as Markdown file download.
 * Supports single note or all notes as a combined .md file.
 * Requirements: 15.2
 */
export function exportAsMarkdown(notes: Note | Note[]): void {
  const noteArray = Array.isArray(notes) ? notes : [notes]
  if (noteArray.length === 1) {
    const note = noteArray[0]
    const md = noteToMarkdown(note)
    const blob = new Blob([md], { type: 'text/markdown' })
    const filename = `${sanitizeFilename(note.title || '无标题')}.md`
    triggerDownload(blob, filename)
  } else {
    const combined = noteArray
      .map((n) => `<!-- ${n.title || '无标题'} -->\n${noteToMarkdown(n)}`)
      .join('\n---\n\n')
    const blob = new Blob([combined], { type: 'text/markdown' })
    triggerDownload(blob, `shimo-export-${datestamp()}.md`)
  }
}

/**
 * Export a single note as PDF using the browser print dialog.
 * Opens a new window with print-friendly HTML and triggers print.
 * Requirements: 15.3
 */
export function exportAsPDF(note: Note): void {
  const md = noteToMarkdown(note)
  const title = note.title || '无标题'
  const html = buildPrintHTML(title, md)

  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.onload = () => {
    printWindow.print()
  }
}

/**
 * Copy a note's content to the clipboard as Markdown.
 * Requirements: 15.4
 */
export async function copyToClipboard(note: Note): Promise<boolean> {
  const md = noteToMarkdown(note)
  try {
    await navigator.clipboard.writeText(md)
    return true
  } catch {
    // Fallback for older browsers or permission denied
    return fallbackCopyToClipboard(md)
  }
}

/**
 * Share a note using the Web Share API if available,
 * otherwise falls back to copying Markdown to clipboard.
 * Requirements: 15.5
 */
export async function shareNote(note: Note): Promise<'shared' | 'copied' | 'failed'> {
  const md = noteToMarkdown(note)
  const title = note.title || '无标题'

  if (navigator.share) {
    try {
      await navigator.share({
        title,
        text: md,
      })
      return 'shared'
    } catch (err) {
      // User cancelled or share failed — fall back to clipboard
      if (err instanceof Error && err.name === 'AbortError') {
        return 'failed'
      }
    }
  }

  // Fallback: copy to clipboard
  const copied = await copyToClipboard(note)
  return copied ? 'copied' : 'failed'
}

// --- Internal helpers ---

function datestamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').slice(0, 100)
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function fallbackCopyToClipboard(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    const success = document.execCommand('copy')
    return success
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

function buildPrintHTML(title: string, md: string): string {
  const bodyContent = md
    .split('\n')
    .map((line) => {
      if (line.startsWith('# ')) return '' // title already shown in h1
      if (line.startsWith('Tags:')) return `<p class="tag">${escapeHtml(line)}</p>`
      if (line.startsWith('### ')) return `<h3>${escapeHtml(line.slice(4))}</h3>`
      if (line.startsWith('## ')) return `<h2>${escapeHtml(line.slice(3))}</h2>`
      if (line.startsWith('> ')) return `<blockquote>${escapeHtml(line.slice(2))}</blockquote>`
      if (line.startsWith('- [x]')) return `<p>☑ ${escapeHtml(line.slice(6))}</p>`
      if (line.startsWith('- [ ]')) return `<p>☐ ${escapeHtml(line.slice(6))}</p>`
      if (line.startsWith('- ')) return `<li>${escapeHtml(line.slice(2))}</li>`
      if (line.startsWith('---')) return '<hr>'
      if (line.trim() === '') return '<br>'
      return `<p>${escapeHtml(line)}</p>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: 'Noto Serif SC', 'STSong', serif; max-width: 680px; margin: 40px auto; padding: 0 20px; color: #1A1208; line-height: 1.8; }
    h1 { font-size: 24px; border-bottom: 2px solid #B5341A; padding-bottom: 8px; margin-bottom: 16px; }
    h2 { font-size: 18px; margin-top: 24px; }
    h3 { font-size: 16px; color: #4A3828; }
    blockquote { border-left: 3px solid #B5341A; padding-left: 16px; color: #7A6248; font-style: italic; }
    code { background: #EFE9DC; padding: 2px 5px; border-radius: 3px; font-family: 'JetBrains Mono', monospace; font-size: 0.9em; }
    pre { background: #EFE9DC; padding: 16px; border-radius: 6px; overflow-x: auto; }
    hr { border: none; border-top: 1px solid #ddd; margin: 24px 0; }
    .tag { color: #B5341A; font-weight: 500; }
    .meta { font-size: 12px; color: #A89880; margin-top: 32px; border-top: 1px solid #eee; padding-top: 8px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${bodyContent}
  <div class="meta">
    导出自拾墨 · ${new Date().toLocaleDateString('zh-CN')}
  </div>
</body>
</html>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
