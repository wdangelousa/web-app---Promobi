import { Mark, mergeAttributes } from '@tiptap/core'

export const TranslatorNote = Mark.create({
  name: 'translatorNote',

  parseHTML() {
    return [{ tag: 'span.translator-note' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({
      class: 'translator-note bg-blue-50 text-blue-700 italic px-1.5 py-0.5 rounded text-[0.9em] border border-blue-200 shadow-sm'
    }, HTMLAttributes), 0]
  },
})
