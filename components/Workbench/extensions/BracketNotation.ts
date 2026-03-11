import { Mark, mergeAttributes } from '@tiptap/core'

export const BracketNotation = Mark.create({
  name: 'bracketNotation',

  parseHTML() {
    return [{ tag: 'span.bracket-notation' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({
      class: 'bracket-notation bg-gray-100 text-gray-500 italic px-1.5 py-0.5 rounded text-[0.9em] border border-gray-200 shadow-sm'
    }, HTMLAttributes), 0]
  },
})
