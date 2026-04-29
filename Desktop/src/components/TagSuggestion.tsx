import { useState, useEffect, useMemo } from 'react'
import { useStore } from '../store'
import { extractText } from '@notepro/shared'
import type { Note } from '@notepro/shared'

interface Props {
  note: Note
  onAddTag: (tag: string) => void
}

/**
 * Suggest tags based on existing tags in the user's notes and current note content
 */
export default function TagSuggestion({ note, onAddTag }: Props) {
  const { state } = useStore()
  const [suggestions, setSuggestions] = useState<string[]>([])

  // Build a frequency map of all tags
  const allTags = useMemo(() => {
    const map = new Map<string, number>()
    state.notes.forEach(n => n.tags.forEach(t => map.set(t, (map.get(t) || 0) + 1)))
    return map
  }, [state.notes])

  useEffect(() => {
    if (!note.content) { setSuggestions([]); return }

    const text = extractText(note.content).toLowerCase() + ' ' + note.title.toLowerCase()
    const currentTags = new Set(note.tags)

    // Score each existing tag by how relevant it is to current content
    const scored: Array<{ tag: string; score: number }> = []
    for (const [tag, freq] of allTags) {
      if (currentTags.has(tag)) continue // already applied
      let score = 0
      // Check if tag text appears in content
      if (text.includes(tag.toLowerCase())) score += 3
      // Frequency bonus (popular tags more likely)
      score += Math.min(freq * 0.5, 2)
      // Co-occurrence: if notes with this tag share other tags with current note
      const notesWithTag = state.notes.filter(n => n.tags.includes(tag))
      const sharedTagCount = notesWithTag.reduce((acc, n) => {
        return acc + n.tags.filter(t => currentTags.has(t)).length
      }, 0)
      score += sharedTagCount * 0.5

      if (score > 1) scored.push({ tag, score })
    }

    scored.sort((a, b) => b.score - a.score)
    setSuggestions(scored.slice(0, 3).map(s => s.tag))
  }, [note.content, note.title, note.tags, allTags, state.notes])

  if (suggestions.length === 0) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 0',
    }}>
      <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-num)', flexShrink: 0 }}>
        建议标签
      </span>
      {suggestions.map(tag => (
        <button
          key={tag}
          onClick={() => onAddTag(tag)}
          style={{
            padding: '2px 8px',
            fontSize: 11,
            background: 'var(--bg-secondary)',
            border: '1px dashed var(--border-medium)',
            borderRadius: 4,
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.color = 'var(--accent)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border-medium)'
            e.currentTarget.style.color = 'var(--text-tertiary)'
          }}
        >
          +#{tag}
        </button>
      ))}
    </div>
  )
}