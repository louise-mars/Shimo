import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// 高亮 @人名、#话题、!! 重要项
export const MeetingHighlight = Extension.create({
  name: 'meetingHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('meetingHighlight'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            const doc = state.doc

            doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return

              const text = node.text

              // @人名
              const atRegex = /@[\u4e00-\u9fa5\w]+/g
              let match
              while ((match = atRegex.exec(text)) !== null) {
                decorations.push(
                  Decoration.inline(pos + match.index, pos + match.index + match[0].length, {
                    class: 'meeting-mention',
                  })
                )
              }

              // #话题
              const hashRegex = /#[\u4e00-\u9fa5\w]+/g
              while ((match = hashRegex.exec(text)) !== null) {
                decorations.push(
                  Decoration.inline(pos + match.index, pos + match.index + match[0].length, {
                    class: 'meeting-topic',
                  })
                )
              }

              // !! 重要
              const importantRegex = /!!(.*?)!!/g
              while ((match = importantRegex.exec(text)) !== null) {
                decorations.push(
                  Decoration.inline(pos + match.index, pos + match.index + match[0].length, {
                    class: 'meeting-important',
                  })
                )
              }
            })

            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})