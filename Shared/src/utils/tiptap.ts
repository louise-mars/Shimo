import type { TipTapNode } from '../types'

/**
 * Extract plain text from TipTap JSON content
 */
export function extractText(content: string): string {
  try {
    const walk = (n: TipTapNode): string => n.text || (n.content || []).map(walk).join(' ')
    return walk(JSON.parse(content))
  } catch {
    return ''
  }
}

/**
 * Extract all tags (#hashtags) from TipTap JSON content
 */
export function extractTags(content: string): string[] {
  try {
    const tags = new Set<string>()
    const walk = (n: TipTapNode) => {
      if (n.text) {
        const re = /#([\u4e00-\u9fa5\w]+)/g
        let m
        while ((m = re.exec(n.text)) !== null) tags.add(m[1])
      }
      ;(n.content || []).forEach(walk)
    }
    walk(JSON.parse(content))
    return Array.from(tags)
  } catch {
    return []
  }
}

/**
 * Get preview text from TipTap JSON content
 */
export function getPreview(content: string, maxLength = 80): string {
  try {
    const walk = (n: TipTapNode): string => n.text || (n.content || []).map(walk).join('')
    return walk(JSON.parse(content)).trim().slice(0, maxLength)
  } catch {
    return ''
  }
}

/**
 * Count words in TipTap JSON content
 */
export function wordCount(content: string): number {
  try {
    const texts: string[] = []
    const walk = (n: TipTapNode) => {
      if (n.text) texts.push(n.text)
      ;(n.content || []).forEach(walk)
    }
    walk(JSON.parse(content))
    return texts.join('').replace(/\s+/g, '').length
  } catch {
    return 0
  }
}

/**
 * Search notes by title and content (case-insensitive)
 */
export function searchNotes(content: string, query: string): boolean {
  try {
    const text = extractText(content).toLowerCase()
    return text.includes(query.toLowerCase())
  } catch {
    return false
  }
}

/**
 * Extract plain text from TipTap JSON content (with newlines)
 */
export function extractPlainText(content: string): string {
  try {
    const texts: string[] = []
    const walk = (n: TipTapNode) => {
      if (n.text) texts.push(n.text)
      ;(n.content || []).forEach(walk)
    }
    walk(JSON.parse(content))
    return texts.join('\n')
  } catch {
    return ''
  }
}