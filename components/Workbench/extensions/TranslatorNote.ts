import { Node, mergeAttributes } from '@tiptap/core'

export const TranslatorNote = Node.create({
  name: 'translatorNote',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: false,

  addAttributes() {
    return {
      class: {
        default: 'translator-note bg-blue-50 text-blue-700 italic px-1.5 py-0.5 rounded text-[0.9em] border border-blue-200 select-all',
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'span.translator-note' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})
