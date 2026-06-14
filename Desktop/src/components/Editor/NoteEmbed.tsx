/**
 * NoteEmbed — TipTap Node extension for embedding notes inline.
 *
 * Syntax: ![[note title]]
 * Renders as a read-only block showing the embedded note's content.
 * Clicking the embed navigates to the source note.
 *
 * Implementation:
 * - Custom TipTap Node (block-level)
 * - React NodeView for rendering the embed content
 * - Auto-resolves note by title from the store
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { useAppStore } from '@notepro/shared'
import { getPreview, extractText } from '@notepro/shared'
import type { Note } from '@notepro/shared'

// ─── TipTap Node Extension ──────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteEmbed: {
      insertNoteEmbed: (title: string) => ReturnType
    }
  }
}

export interface NoteEmbedOptions {
  onNavigate?: (noteTitle: string) => void
}

export const NoteEmbedExtension = Node.create<NoteEmbedOptions>({
  name: 'noteEmbed',
  group: 'block',
  atom: true, // Cannot be edited directly

  addOptions() {
    return { onNavigate: undefined }
  },

  addAttributes() {
    return {
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-embed-title') || '',
        renderHTML: (attributes) => ({ 'data-embed-title': attributes.title }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="note-embed"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'note-embed' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoteEmbedView)
  },

  addCommands() {
    return {
      insertNoteEmbed:
        (title: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: 'noteEmbed',
            attrs: { title },
          })
        },
    }
  },
})

// ─── React NodeView ──────────────────────────────────────────────────────────

function NoteEmbedView({ node }: { node: any }) {
  const title = node.attrs.title as string
  const notes = useAppStore((s) => s.notes)
  const setActiveNote = useAppStore((s) => s.setActiveNote)

  // Resolve the embedded note
  const embeddedNote = notes.find(
    (n: Note) => !n.deletedAt && n.title.toLowerCase() === title.toLowerCase()
  )

  const handleClick = () => {
    if (embeddedNote) {
      setActiveNote(embeddedNote.id)
    }
  }

  if (!embeddedNote) {
    return (
      <NodeViewWrapper>
        <div
          style={{
            padding: '12px 16px',
            margin: '8px 0',
            borderRadius: 8,
            border: '1px dashed var(--border-medium)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-faint)',
            fontSize: 13,
            fontFamily: 'var(--font-sans)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
          contentEditable={false}
        >
          <span style={{ fontSize: 16, opacity: 0.5 }}>📄</span>
          <span>未找到笔记「{title}」</span>
        </div>
      </NodeViewWrapper>
    )
  }

  // Extract content preview (first ~200 chars of text)
  let preview = ''
  let fullText = ''
  let wordCount = 0
  try {
    preview = getPreview(embeddedNote.content, 200)
    fullText = extractText(embeddedNote.content)
    wordCount = fullText.replace(/\s+/g, '').length
  } catch {
    preview = '（内容加载失败）'
  }

  return (
    <NodeViewWrapper>
      <div
        className="note-embed"
        onClick={handleClick}
        contentEditable={false}
        style={{
          padding: '14px 18px',
          margin: '12px 0',
          borderRadius: 10,
          border: '1px solid var(--border-light)',
          background: 'var(--bg-secondary)',
          cursor: 'pointer',
          transition: 'all 0.15s',
          position: 'relative',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--accent)'
          e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-light)'
          e.currentTarget.style.boxShadow = 'none'
        }}
        title="点击打开笔记"
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 8,
        }}>
          <span style={{
            fontSize: 12, color: 'var(--accent)',
            fontFamily: 'var(--font-num)',
            background: 'var(--accent-light)',
            padding: '2px 8px', borderRadius: 4,
            fontWeight: 500,
          }}>
            ↗ 嵌入
          </span>
          <span style={{
            fontSize: 14, fontWeight: 600,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-serif)',
            flex: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {embeddedNote.title}
          </span>
          <span style={{
            fontSize: 10, color: 'var(--text-faint)',
            fontFamily: 'var(--font-num)',
          }}>
            {wordCount} 字
          </span>
        </div>

        {/* Content preview */}
        <div style={{
          fontSize: 13,
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-serif)',
          lineHeight: 1.7,
          maxHeight: 100,
          overflow: 'hidden',
          position: 'relative',
        }}>
          {preview || '（空笔记）'}
          {/* Fade out at the bottom */}
          {fullText.length > 200 && (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              height: 32,
              background: 'linear-gradient(transparent, var(--bg-secondary))',
              pointerEvents: 'none',
            }} />
          )}
        </div>

        {/* Tags */}
        {embeddedNote.tags.length > 0 && (
          <div style={{
            display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap',
          }}>
            {embeddedNote.tags.slice(0, 4).map((t: string) => (
              <span key={t} style={{
                fontSize: 10, color: 'var(--text-faint)',
                fontFamily: 'var(--font-sans)',
              }}>
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

export default NoteEmbedExtension
