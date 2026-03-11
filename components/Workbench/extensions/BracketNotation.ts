import { Node, mergeAttributes } from '@tiptap/core'

export const BracketNotation = Node.create({
  name: 'bracketNotation',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: false,

  addAttributes() {
    return {
      class: {
        default: 'bracket-notation bg-gray-100 text-gray-500 italic px-1.5 py-0.5 rounded text-[0.9em] border border-gray-200 select-all',
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'span.bracket-notation' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})
