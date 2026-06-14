/**
 * Styled HTML Export — generates a beautiful standalone HTML page
 * matching the 山水 (ink wash) aesthetic of Shimo.
 *
 * The exported HTML is fully self-contained with inline CSS and
 * can be opened in any browser or shared directly.
 */

import type { Note } from '@notepro/shared'
import { extractText } from '@notepro/shared'

interface TipTapNode {
  type: string
  text?: string
  content?: TipTapNode[]
  attrs?: Record<string, unknown>
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim().toLowerCase()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('mailto:') || trimmed.startsWith('#')) {
    return url
  }
  return ''
}

function sanitizeImageSrc(src: string): string {
  const trimmed = src.trim().toLowerCase()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/')) {
    return src
  }
  return ''
}

function renderMarks(text: string, marks: Array<{ type: string; attrs?: Record<string, unknown> }> = []): string {
  let html = escapeHtml(text)
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold': html = `<strong>${html}</strong>`; break
      case 'italic': html = `<em>${html}</em>`; break
      case 'underline': html = `<u>${html}</u>`; break
      case 'strike': html = `<del>${html}</del>`; break
      case 'code': html = `<code>${html}</code>`; break
      case 'link': {
        const href = sanitizeUrl(String(mark.attrs?.href || ''))
        html = href ? `<a href="${escapeHtml(href)}">${html}</a>` : html
        break
      }
      case 'highlight': html = `<mark>${html}</mark>`; break
    }
  }
  return html
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderNode(node: TipTapNode): string {
  if (node.text) {
    return renderMarks(node.text, node.marks)
  }

  const children = (node.content || []).map(renderNode).join('')

  switch (node.type) {
    case 'doc': return children
    case 'paragraph': return `<p>${children || '&nbsp;'}</p>`
    case 'heading': {
      const level = node.attrs?.level || 1
      return `<h${level}>${children}</h${level}>`
    }
    case 'bulletList': return `<ul>${children}</ul>`
    case 'orderedList': return `<ol>${children}</ol>`
    case 'listItem': return `<li>${children}</li>`
    case 'taskList': return `<ul class="task-list">${children}</ul>`
    case 'taskItem': {
      const checked = node.attrs?.checked ? 'checked' : ''
      const cls = node.attrs?.checked ? ' class="done"' : ''
      return `<li${cls}><input type="checkbox" ${checked} disabled />${children}</li>`
    }
    case 'blockquote': return `<blockquote>${children}</blockquote>`
    case 'codeBlock': return `<pre><code>${children}</code></pre>`
    case 'horizontalRule': return `<hr />`
    case 'image': {
      const src = sanitizeImageSrc(String(node.attrs?.src || ''))
      return src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(String(node.attrs?.alt || ''))}" />` : ''
    }
    case 'table': return `<table>${children}</table>`
    case 'tableRow': return `<tr>${children}</tr>`
    case 'tableCell': return `<td>${children}</td>`
    case 'tableHeader': return `<th>${children}</th>`
    case 'hardBreak': return `<br />`
    default: return children
  }
}

const STYLED_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Noto Serif SC', 'STSong', 'SimSun', serif;
    background: #F7F3EC;
    color: #1A1208;
    line-height: 1.9;
    padding: 60px 32px;
    min-height: 100vh;
  }
  .container {
    max-width: 680px;
    margin: 0 auto;
  }
  .header {
    text-align: center;
    margin-bottom: 48px;
    padding-bottom: 24px;
    border-bottom: 2px solid #B5341A;
  }
  .header h1 {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: 2px;
    color: #1A1208;
    margin-bottom: 8px;
  }
  .header .meta {
    font-size: 12px;
    color: #A89880;
    font-family: 'Inter', sans-serif;
  }
  .header .tags {
    margin-top: 12px;
    display: flex;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .header .tag {
    font-size: 11px;
    color: #B5341A;
    background: rgba(181, 52, 26, 0.07);
    padding: 2px 10px;
    border-radius: 4px;
    font-family: 'Noto Sans SC', sans-serif;
  }
  p { margin-bottom: 0.6em; }
  h1 { font-size: 24px; font-weight: 700; margin: 1.6em 0 0.5em; letter-spacing: 1px; }
  h2 { font-size: 20px; font-weight: 600; margin: 1.4em 0 0.4em; }
  h3 { font-size: 16px; font-weight: 600; margin: 1.2em 0 0.3em; color: #4A3828; font-family: 'Noto Sans SC', sans-serif; }
  strong { font-weight: 650; }
  em { font-style: italic; }
  mark { background: rgba(200, 168, 75, 0.25); border-radius: 3px; padding: 0 3px; }
  a { color: #B5341A; text-decoration: underline; text-underline-offset: 2px; }
  blockquote {
    border-left: 2px solid #B5341A;
    padding-left: 18px;
    color: #7A6248;
    font-style: italic;
    margin: 1em 0;
  }
  code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.88em;
    background: #EFE9DC;
    border-radius: 4px;
    padding: 2px 5px;
    color: #8C2614;
  }
  pre {
    background: #EFE9DC;
    border-radius: 8px;
    padding: 20px;
    margin: 1em 0;
    overflow-x: auto;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    line-height: 1.6;
  }
  pre code { background: none; padding: 0; color: #1A1208; }
  hr { border: none; border-top: 1px solid rgba(139, 94, 60, 0.15); margin: 2em 0; }
  ul, ol { padding-left: 24px; margin: 0.5em 0; }
  li { margin: 0.2em 0; }
  .task-list { list-style: none; padding-left: 0; }
  .task-list li { display: flex; align-items: flex-start; gap: 8px; margin: 0.3em 0; }
  .task-list li input[type="checkbox"] {
    appearance: none; width: 14px; height: 14px;
    border: 1.5px solid #A89880; border-radius: 3px;
    margin-top: 5px; flex-shrink: 0; position: relative;
  }
  .task-list li input[type="checkbox"]:checked {
    background: #B5341A; border-color: #B5341A;
  }
  .task-list li input[type="checkbox"]:checked::after {
    content: '✓'; position: absolute; top: -2px; left: 1px;
    font-size: 10px; color: white; font-weight: 700;
  }
  .task-list li.done { color: #A89880; text-decoration: line-through; }
  img { max-width: 100%; border-radius: 6px; margin: 1em 0; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 14px; }
  td, th { border: 1px solid rgba(139, 94, 60, 0.18); padding: 8px 12px; vertical-align: top; }
  th { background: #EFE9DC; font-weight: 600; font-size: 13px; }
  .footer {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid rgba(139, 94, 60, 0.1);
    text-align: center;
    font-size: 11px;
    color: #A89880;
    font-family: 'Inter', sans-serif;
  }
`

export function exportAsStyledHTML(note: Note): string {
  let bodyHtml = ''
  try {
    const doc = JSON.parse(note.content) as TipTapNode
    bodyHtml = renderNode(doc)
  } catch {
    bodyHtml = `<p>${escapeHtml(extractText(note.content))}</p>`
  }

  const date = new Date(note.updatedAt).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  const wordCountEst = extractText(note.content).replace(/\s+/g, '').length

  const tagsHtml = note.tags.length > 0
    ? `<div class="tags">${note.tags.map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(note.title || '拾墨笔记')}</title>
  <style>${STYLED_CSS}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtml(note.title || '无标题')}</h1>
      <div class="meta">${date} · ${wordCountEst} 字</div>
      ${tagsHtml}
    </div>
    <div class="content">
      ${bodyHtml}
    </div>
    <div class="footer">
      由 拾墨 Shimo 导出
    </div>
  </div>
</body>
</html>`
}

/** Download a note as styled HTML file */
export function downloadStyledHTML(note: Note) {
  const html = exportAsStyledHTML(note)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${note.title || '拾墨笔记'}.html`
  a.click()
  URL.revokeObjectURL(url)
}

/** Copy styled HTML to clipboard (for pasting into email/docs) */
export async function copyStyledHTML(note: Note) {
  const html = exportAsStyledHTML(note)
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([extractText(note.content)], { type: 'text/plain' }),
      })
    ])
  } catch {
    // Fallback: copy plain text
    await navigator.clipboard.writeText(extractText(note.content))
  }
}
