import type { Note } from '../types'
import { v4 as uuid } from 'uuid'

// === EXPORT ===

interface TipTapNode {
  type?: string
  content?: TipTapNode[]
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

/**
 * Render inline text content (text nodes with marks) to Markdown.
 * Handles bold, italic, strikethrough, and code marks.
 */
function renderInlineContent(nodes: TipTapNode[]): string {
  return nodes.map(node => {
    if (node.type === 'hardBreak') return '\n'
    if (!node.text) return ''
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
  }).join('')
}

/**
 * Convert a TipTap JSON document to Markdown syntax.
 * Supports headings, paragraphs, bullet lists, ordered lists, task lists,
 * blockquotes, code blocks, horizontal rules, images, hard breaks,
 * and inline marks (bold, italic, code, strikethrough).
 *
 * Handles nested lists with proper indentation.
 */
function tiptapToMarkdown(json: unknown, indent: string = ''): string {
  if (!json || typeof json !== 'object') return ''
  const node = json as TipTapNode

  // Text nodes are handled by renderInlineContent, but handle standalone text
  if (node.text) {
    return renderInlineContent([node])
  }

  switch (node.type) {
    case 'doc': {
      return (node.content || []).map(c => tiptapToMarkdown(c, indent)).join('')
    }

    case 'paragraph': {
      const inline = renderInlineContent(node.content || [])
      return indent + inline + '\n\n'
    }

    case 'heading': {
      const level = (node.attrs?.level as number) || 1
      const inline = renderInlineContent(node.content || [])
      return '#'.repeat(level) + ' ' + inline + '\n\n'
    }

    case 'bulletList': {
      return (node.content || []).map(item => {
        return renderListItem(item, indent, '- ')
      }).join('') + (indent === '' ? '\n' : '')
    }

    case 'orderedList': {
      return (node.content || []).map((item, idx) => {
        return renderListItem(item, indent, `${idx + 1}. `)
      }).join('') + (indent === '' ? '\n' : '')
    }

    case 'taskList': {
      return (node.content || []).map(item => {
        const checked = (item as TipTapNode).attrs?.checked ? 'x' : ' '
        return renderListItem(item, indent, `- [${checked}] `)
      }).join('') + (indent === '' ? '\n' : '')
    }

    case 'blockquote': {
      const innerContent = (node.content || []).map(c => tiptapToMarkdown(c, '')).join('')
      // Add > prefix to each line, trim trailing empty lines
      const lines = innerContent.replace(/\n+$/, '').split('\n')
      return lines.map(line => indent + '> ' + line).join('\n') + '\n\n'
    }

    case 'codeBlock': {
      const lang = (node.attrs?.language as string) || ''
      const code = (node.content || []).map(c => (c as TipTapNode).text || '').join('')
      return indent + '```' + lang + '\n' + code + '\n' + indent + '```\n\n'
    }

    case 'horizontalRule': {
      return indent + '---\n\n'
    }

    case 'hardBreak': {
      return '\n'
    }

    case 'image': {
      const alt = (node.attrs?.alt as string) || ''
      const src = (node.attrs?.src as string) || ''
      return indent + `![${alt}](${src})\n\n`
    }

    default: {
      // Unknown node type — try to render children
      return (node.content || []).map(c => tiptapToMarkdown(c, indent)).join('')
    }
  }
}

/**
 * Render a list item (bulletList, orderedList, or taskList item).
 * Handles nested content: paragraphs become inline text, nested lists get indented.
 */
function renderListItem(item: unknown, indent: string, prefix: string): string {
  const node = item as TipTapNode
  const children = node.content || []
  let result = ''
  let firstBlock = true

  for (const child of children) {
    if (child.type === 'paragraph') {
      const inline = renderInlineContent(child.content || [])
      if (firstBlock) {
        result += indent + prefix + inline + '\n'
        firstBlock = false
      } else {
        // Continuation paragraph in a list item — indent to align with content
        result += indent + ' '.repeat(prefix.length) + inline + '\n'
      }
    } else if (child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'taskList') {
      // Nested list — increase indentation
      if (firstBlock) {
        // Edge case: list item starts with a nested list (no text)
        result += indent + prefix + '\n'
        firstBlock = false
      }
      result += tiptapToMarkdown(child, indent + '  ')
    } else {
      // Other block content inside list item
      const rendered = tiptapToMarkdown(child, indent + '  ')
      if (firstBlock) {
        result += indent + prefix + rendered.trimStart()
        firstBlock = false
      } else {
        result += rendered
      }
    }
  }

  // If no children were processed, output just the prefix
  if (firstBlock) {
    result += indent + prefix + '\n'
  }

  return result
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

/**
 * Parse inline markdown marks (bold, italic, code, strikethrough) into TipTap text nodes.
 * Supports nested marks and handles edge cases like empty matches.
 */
function parseInlineMarks(text: string): object[] {
  const result: object[] = []
  // Process inline marks with a regex that handles bold (**), italic (*), code (`), strikethrough (~~)
  // Order matters: bold (**) must be checked before italic (*) to avoid conflicts
  const regex = /(\*\*(.+?)\*\*|~~(.+?)~~|`(.+?)`|\*(.+?)\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    // Add plain text before this match
    if (match.index > lastIndex) {
      result.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    }

    if (match[2]) {
      // Bold: **text**
      result.push({ type: 'text', text: match[2], marks: [{ type: 'bold' }] })
    } else if (match[3]) {
      // Strikethrough: ~~text~~
      result.push({ type: 'text', text: match[3], marks: [{ type: 'strike' }] })
    } else if (match[4]) {
      // Code: `text`
      result.push({ type: 'text', text: match[4], marks: [{ type: 'code' }] })
    } else if (match[5]) {
      // Italic: *text*
      result.push({ type: 'text', text: match[5], marks: [{ type: 'italic' }] })
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining plain text
  if (lastIndex < text.length) {
    result.push({ type: 'text', text: text.slice(lastIndex) })
  }

  return result.length ? result : [{ type: 'text', text }]
}

/**
 * Parse a markdown string into a TipTap JSON document structure.
 * Supports: headings, paragraphs, bullet lists, ordered lists, task lists,
 * blockquotes, code blocks, horizontal rules, images, and inline marks.
 */
function markdownToTiptapJSON(md: string): object {
  const content: object[] = []
  const lines = md.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Heading (# to ###)
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headingMatch) {
      content.push({
        type: 'heading',
        attrs: { level: headingMatch[1].length },
        content: parseInlineMarks(headingMatch[2]),
      })
      i++
      continue
    }

    // Horizontal rule (---, ***, ___)
    if (/^(---+|\*\*\*+|___+)\s*$/.test(line.trim())) {
      content.push({ type: 'horizontalRule' })
      i++
      continue
    }

    // Code block (``` with optional language)
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
        attrs: { language: lang || '' },
        content: codeLines.length ? [{ type: 'text', text: codeLines.join('\n') }] : [],
      })
      continue
    }

    // Image (standalone on a line): ![alt](src)
    const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/)
    if (imageMatch) {
      content.push({
        type: 'image',
        attrs: { src: imageMatch[2], alt: imageMatch[1] || undefined },
      })
      i++
      continue
    }

    // Task list items: - [ ] or - [x]
    const taskMatch = line.match(/^[-*]\s+\[([ x])\]\s+(.*)/)
    if (taskMatch) {
      const items: object[] = []
      while (i < lines.length) {
        const tm = lines[i].match(/^[-*]\s+\[([ x])\]\s+(.*)/)
        if (!tm) break
        items.push({
          type: 'taskItem',
          attrs: { checked: tm[1] === 'x' },
          content: [{ type: 'paragraph', content: parseInlineMarks(tm[2]) }],
        })
        i++
      }
      content.push({ type: 'taskList', content: items })
      continue
    }

    // Ordered list items: 1. text, 2. text, etc.
    const orderedMatch = line.match(/^\d+\.\s+(.+)/)
    if (orderedMatch) {
      const items: object[] = []
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        const itemText = lines[i].replace(/^\d+\.\s+/, '')
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInlineMarks(itemText) }],
        })
        i++
      }
      content.push({ type: 'orderedList', content: items })
      continue
    }

    // Bullet list items: - text or * text
    if (line.match(/^[-*]\s+/)) {
      const items: object[] = []
      while (i < lines.length && lines[i].match(/^[-*]\s+/) && !lines[i].match(/^[-*]\s+\[([ x])\]/)) {
        const itemText = lines[i].replace(/^[-*]\s+/, '')
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInlineMarks(itemText) }],
        })
        i++
      }
      content.push({ type: 'bulletList', content: items })
      continue
    }

    // Blockquote: > text
    if (line.startsWith('> ')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2))
        i++
      }
      // Parse blockquote content as paragraphs
      const quoteContent: object[] = []
      for (const ql of quoteLines) {
        quoteContent.push({ type: 'paragraph', content: parseInlineMarks(ql) })
      }
      content.push({
        type: 'blockquote',
        content: quoteContent,
      })
      continue
    }

    // Empty line — skip
    if (line.trim() === '') {
      i++
      continue
    }

    // Regular paragraph — collect consecutive non-special lines
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^#{1,3}\s/) &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('> ') &&
      !lines[i].match(/^[-*]\s/) &&
      !lines[i].match(/^\d+\.\s/) &&
      !lines[i].match(/^(---+|\*\*\*+|___+)\s*$/) &&
      !lines[i].match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/)
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length) {
      const text = paraLines.join(' ')
      const inlineContent = parseInlineMarks(text)
      content.push({ type: 'paragraph', content: inlineContent })
    }
  }

  return { type: 'doc', content }
}

/**
 * Extract title, tags, and body from raw markdown text.
 * - Title: extracted from first H1 heading (or first non-empty line if no heading)
 * - Tags: extracted from a line matching `Tags: tag1, tag2` or `标签: tag1, tag2`
 *   (supports both #tag and plain comma-separated formats)
 */
function extractMetadata(md: string): { title: string; tags: string[]; body: string } {
  const lines = md.split('\n')
  let title = ''
  let startLine = 0
  const tags: string[] = []

  // Extract title from first H1 heading
  if (lines[0]?.match(/^#\s+/)) {
    title = lines[0].replace(/^#\s+/, '').trim()
    startLine = 1
  } else if (lines[0]?.trim()) {
    // Use first non-empty line as title if no heading
    title = lines[0].trim()
    startLine = 1
  }

  // Skip blank lines after title
  while (startLine < lines.length && lines[startLine]?.trim() === '') {
    startLine++
  }

  // Extract tags line (supports Tags: and 标签:)
  const tagLine = lines[startLine]
  if (tagLine && /^(Tags|标签)\s*[:：]\s*/i.test(tagLine)) {
    // Try #tag format first
    const hashTagMatches = tagLine.match(/#([\w\u4e00-\u9fff]+)/g)
    if (hashTagMatches && hashTagMatches.length > 0) {
      tags.push(...hashTagMatches.map(t => t.slice(1)))
    } else {
      // Fall back to comma-separated format
      const afterPrefix = tagLine.replace(/^(Tags|标签)\s*[:：]\s*/i, '')
      const commaTags = afterPrefix.split(/[,，]/).map(t => t.trim()).filter(Boolean)
      tags.push(...commaTags)
    }
    startLine++
  }

  const body = lines.slice(startLine).join('\n').trim()
  return { title, tags, body }
}

/**
 * Parse a markdown string into structured note data.
 * Returns title, stringified TipTap JSON content, and extracted tags.
 *
 * @param markdown - Raw markdown text to parse
 * @returns Object with title, content (stringified TipTap JSON), and tags array
 */
export function parseMarkdown(markdown: string): { title: string; content: string; tags: string[] } {
  const { title, tags, body } = extractMetadata(markdown)
  const tiptapDoc = markdownToTiptapJSON(body)
  return {
    title,
    content: JSON.stringify(tiptapDoc),
    tags,
  }
}

/**
 * Import a markdown string as a full Note object.
 * Extracts title from first heading, tags from Tags:/标签: line,
 * and converts the body to TipTap JSON.
 *
 * @param md - Raw markdown text
 * @param folderId - Optional folder to assign the note to
 * @returns A complete Note object ready for storage
 */
export function importMarkdownToNote(md: string, folderId: string | null = null): Note {
  const { title, content, tags } = parseMarkdown(md)

  return {
    id: uuid(),
    title,
    content,
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
