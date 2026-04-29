import type { Note } from '../types'
import { v4 as uuid } from 'uuid'

// === EXPORT ===

function tiptapToMarkdown(json: unknown): string {
  if (!json || typeof json !== 'object') return ''
  const node = json as { type?: string; content?: unknown[]; text?: string; attrs?: Record<string, unknown>; marks?: { type: string }[] }

  if (node.text) {
    let text = node.text
    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type === 'bold') text = `**${text}**`
        else if (mark.type === 'italic') text = `*${text}*`
        else if (mark.type === 'strike') text = `~~${text}~~`
        else if (mark.type === 'code') text = `\`${text}\``
      }
    }
    return text
  }

  const children = (node.content || []).map(c => tiptapToMarkdown(c)).join('')

  switch (node.type) {
    case 'doc': return children
    case 'paragraph': return children + '\n\n'
    case 'heading': return '#'.repeat((node.attrs?.level as number) || 1) + ' ' + children + '\n\n'
    case 'bulletList': return children
    case 'orderedList': return children
    case 'listItem': return '- ' + children
    case 'taskList': return children
    case 'taskItem': return `- [${node.attrs?.checked ? 'x' : ' '}] ` + children
    case 'blockquote': return '> ' + children.replace(/\n/g, '\n> ') + '\n'
    case 'codeBlock': return '```' + (node.attrs?.language || '') + '\n' + children + '```\n\n'
    case 'horizontalRule': return '---\n\n'
    case 'hardBreak': return '\n'
    case 'image': return `![${node.attrs?.alt || ''}](${node.attrs?.src || ''})\n\n`
    default: return children
  }
}

export function noteToMarkdown(note: Note): string {
  let md = ''
  if (note.title) md += `# ${note.title}\n\n`
  if (note.tags.length) md += `Tags: ${note.tags.map(t => `#${t}`).join(' ')}\n\n`

  if (note.content) {
    try {
      const json = JSON.parse(note.content)
      md += tiptapToMarkdown(json)
    } catch (err) {
      console.warn('Failed to parse note content for markdown export:', err)
    }
  }
  return md.trim() + '\n'
}

export function exportNoteAsFile(note: Note) {
  const md = noteToMarkdown(note)
  const blob = new Blob([md], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${note.title || 'Untitled'}.md`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportAllNotes(notes: Note[]) {
  const files = notes.map(n => ({
    name: `${n.title || 'Untitled'}.md`,
    content: noteToMarkdown(n),
  }))
  // Simple: export as a single concatenated file with separators
  const combined = files.map(f => `<!-- ${f.name} -->\n${f.content}`).join('\n---\n\n')
  const blob = new Blob([combined], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'Shimo-export.md'
  a.click()
  URL.revokeObjectURL(url)
}

// === IMPORT ===

function markdownToTiptapJSON(md: string): object {
  const content: object[] = []
  const lines = md.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headingMatch) {
      content.push({
        type: 'heading',
        attrs: { level: headingMatch[1].length },
        content: [{ type: 'text', text: headingMatch[2] }],
      })
      i++
      continue
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      content.push({ type: 'horizontalRule' })
      i++
      continue
    }

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      content.push({
        type: 'codeBlock',
        attrs: { language: lang || null },
        content: codeLines.length ? [{ type: 'text', text: codeLines.join('\n') }] : [],
      })
      continue
    }

    // Task item
    const taskMatch = line.match(/^- \[([ x])\]\s+(.+)/)
    if (taskMatch) {
      const items: object[] = []
      while (i < lines.length) {
        const tm = lines[i].match(/^- \[([ x])\]\s+(.+)/)
        if (!tm) break
        items.push({
          type: 'taskItem',
          attrs: { checked: tm[1] === 'x' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: tm[2] }] }],
        })
        i++
      }
      content.push({ type: 'taskList', content: items })
      continue
    }

    // Bullet list
    if (line.match(/^[-*]\s+/)) {
      const items: object[] = []
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: lines[i].replace(/^[-*]\s+/, '') }] }],
        })
        i++
      }
      content.push({ type: 'bulletList', content: items })
      continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2))
        i++
      }
      content.push({
        type: 'blockquote',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: quoteLines.join('\n') }] }],
      })
      continue
    }

    // Empty line
    if (line.trim() === '') {
      i++
      continue
    }

    // Regular paragraph — collect consecutive non-empty lines
    const paraLines: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].match(/^#{1,3}\s/) && !lines[i].startsWith('```') && !lines[i].startsWith('> ') && !lines[i].match(/^[-*]\s/) && !lines[i].match(/^- \[/)) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length) {
      const text = paraLines.join(' ')
      // Parse inline marks
      const inlineContent = parseInlineMarks(text)
      content.push({ type: 'paragraph', content: inlineContent })
    }
  }

  return { type: 'doc', content }
}

function parseInlineMarks(text: string): object[] {
  // Simple inline parsing: bold, italic, code, strikethrough
  const result: object[] = []
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|~~(.+?)~~)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    }
    if (match[2]) result.push({ type: 'text', text: match[2], marks: [{ type: 'bold' }] })
    else if (match[3]) result.push({ type: 'text', text: match[3], marks: [{ type: 'italic' }] })
    else if (match[4]) result.push({ type: 'text', text: match[4], marks: [{ type: 'code' }] })
    else if (match[5]) result.push({ type: 'text', text: match[5], marks: [{ type: 'strike' }] })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    result.push({ type: 'text', text: text.slice(lastIndex) })
  }

  return result.length ? result : [{ type: 'text', text }]
}

export function importMarkdownToNote(md: string, folderId: string | null = null): Note {
  const lines = md.split('\n')
  let title = ''
  let startLine = 0
  const tags: string[] = []

  // Extract title from first heading
  if (lines[0]?.match(/^#\s+/)) {
    title = lines[0].replace(/^#\s+/, '')
    startLine = 1
  }

  // Extract tags line
  if (lines[startLine]?.trim() === '') startLine++
  const tagLine = lines[startLine]
  if (tagLine?.startsWith('Tags:')) {
    const tagMatches = tagLine.match(/#(\w+)/g)
    if (tagMatches) tags.push(...tagMatches.map(t => t.slice(1)))
    startLine++
  }

  const body = lines.slice(startLine).join('\n').trim()
  const content = markdownToTiptapJSON(body)

  return {
    id: uuid(),
    title,
    content: JSON.stringify(content),
    tags,
    folderId,
    pinned: false,
    favorited: false,
    locked: false,
    hidden: false,
    deletedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
}