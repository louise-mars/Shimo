import type { Note } from '@notepro/shared'
import { noteToMarkdown } from '@notepro/shared'

/**
 * Export all notes as JSON backup
 */
export function exportAsJSON(notes: Note[]) {
  const data = JSON.stringify({ notes, exportedAt: new Date().toISOString(), app: 'shimo', version: '1.0' }, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `shimo-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Export all notes as individual Markdown files in a zip (or single combined file)
 */
export function exportAsMarkdown(notes: Note[]) {
  const files = notes.map(n => ({
    name: `${n.title || '无标题'}.md`,
    content: noteToMarkdown(n),
  }))
  const combined = files.map(f => `<!-- ${f.name} -->\n${f.content}`).join('\n---\n\n')
  const blob = new Blob([combined], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `shimo-export-${new Date().toISOString().slice(0, 10)}.md`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Export a single note as PDF using browser print
 */
export function exportAsPDF(note: Note) {
  const md = noteToMarkdown(note)
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${note.title || '无标题'}</title>
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
  <h1>${note.title || '无标题'}</h1>
  ${md.split('\n').map(line => {
    if (line.startsWith('# ')) return '' // title already shown
    if (line.startsWith('Tags:')) return `<p class="tag">${line}</p>`
    if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`
    if (line.startsWith('### ')) return `<h3>${line.slice(4)}</h3>`
    if (line.startsWith('> ')) return `<blockquote>${line.slice(2)}</blockquote>`
    if (line.startsWith('- [x]')) return `<p>☑ ${line.slice(6)}</p>`
    if (line.startsWith('- [ ]')) return `<p>☐ ${line.slice(6)}</p>`
    if (line.startsWith('- ')) return `<li>${line.slice(2)}</li>`
    if (line.startsWith('---')) return '<hr>'
    if (line.trim() === '') return '<br>'
    return `<p>${line}</p>`
  }).join('\n')}
  <div class="meta">
    导出自拾墨 · ${new Date().toLocaleDateString('zh-CN')}
  </div>
</body>
</html>`

  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.onload = () => {
    printWindow.print()
  }
}