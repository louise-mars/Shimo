/**
 * WikiLink TipTap Extension
 *
 * Renders [[note title]] as clickable inline links that navigate to the referenced note.
 * Uses a ProseMirror Mark to wrap the text between [[ and ]].
 */

import { Mark } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface WikiLinkOptions {
  HTMLAttributes: Record<string, unknown>
  onNavigate?: (noteTitle: string) => void
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikiLink: {
      insertWikiLink: (title: string) => ReturnType
    }
  }
}

/**
 * WikiLink highlight decoration — renders [[...]] with special styling.
 * This uses decorations (not marks) to avoid modifying the document structure.
 */
export const WikiLinkHighlight = Mark.create<WikiLinkOptions>({
  name: 'wikiLinkHighlight',

  addOptions() {
    return {
      HTMLAttributes: {},
      onNavigate: undefined,
    }
  },

  addProseMirrorPlugins() {
    const onNavigate = this.options.onNavigate

    return [
      new Plugin({
        key: new PluginKey('wikiLinkHighlight'),
        state: {
          init(_, state) {
            return buildWikiLinkDecos(state)
          },
          apply(tr, oldDecos, _oldState, newState) {
            if (!tr.docChanged) return oldDecos
            return buildWikiLinkDecos(newState)
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement
            if (target.classList.contains('wiki-link')) {
              const title = target.getAttribute('data-wiki-title')
              if (title && onNavigate) {
                onNavigate(title)
                return true
              }
            }
            return false
          },
        },
      }),
    ]
  },

  addCommands() {
    return {
      insertWikiLink:
        (title: string) =>
        ({ commands }) => {
          return commands.insertContent(`[[${title}]]`)
        },
    }
  },
})

function buildWikiLinkDecos(state: any): DecorationSet {
  const decos: Decoration[] = []

  state.doc.descendants((node: any, pos: number) => {
    if (!node.isText || !node.text) return

    const re = /\[\[([^\]]+)\]\]/g
    let match
    while ((match = re.exec(node.text)) !== null) {
      const start = pos + match.index
      const end = start + match[0].length
      const title = match[1]

      decos.push(
        Decoration.inline(start, end, {
          class: 'wiki-link',
          'data-wiki-title': title,
          nodeName: 'span',
        })
      )
    }
  })

  return DecorationSet.create(state.doc, decos)
}

export default WikiLinkHighlight
