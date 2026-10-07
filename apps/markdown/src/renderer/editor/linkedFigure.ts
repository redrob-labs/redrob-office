import { Node, mergeAttributes } from '@tiptap/core'
import { isFactId } from '@genoffice/facts'

/**
 * A linked figure in Markdown: an ordinary link whose target names the fact,
 * `[₩3.86bn](redrob-fact:q3-revenue)` (or `#sentence` for the fact's
 * dependent sentence). Any other Markdown viewer shows the text it last read;
 * here it is an atom whose text follows the shell's linked-figure index.
 */
export const FIGURE_SCHEME = 'redrob-fact:'

const FIGURE_RE = /^\[((?:\\.|[^\]\\\n]){0,500})\]\(redrob-fact:([A-Za-z0-9_-]{1,120})(#sentence)?\)/

export const escapeFigureText = (s: string) => s.replace(/[\\[\]]/g, (c) => `\\${c}`)
const unescape = (s: string) => s.replace(/\\(.)/g, '$1')

/** The figure Markdown for a fact and the text it reads. */
export function figureMarkdown(fact: string, part: 'figures' | 'sentence', text: string): string {
  return `[${escapeFigureText(text)}](${FIGURE_SCHEME}${fact}${part === 'sentence' ? '#sentence' : ''})`
}

/** Parse one figure at the start of `src` (the tokenizer's job, exported for tests). */
export function matchFigure(src: string): { raw: string; fact: string; part: 'figures' | 'sentence'; text: string } | null {
  const m = FIGURE_RE.exec(src)
  if (!m || !isFactId(m[2])) return null
  return { raw: m[0], fact: m[2]!, part: m[3] ? 'sentence' : 'figures', text: unescape(m[1] ?? '') }
}

export const LinkedFigure = Node.create({
  name: 'mdLinkedFigure',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      fact: { default: '' },
      part: { default: 'figures' },
      text: { default: '' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-linked-fact]',
        getAttrs: (el) => {
          const fact = (el as HTMLElement).getAttribute('data-linked-fact')
          if (!isFactId(fact)) return false
          return {
            fact,
            part: (el as HTMLElement).getAttribute('data-linked-part') === 'sentence' ? 'sentence' : 'figures',
            text: (el as HTMLElement).textContent ?? '',
          }
        },
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'md-fig',
        'data-linked-fact': String(node.attrs.fact),
        'data-linked-part': String(node.attrs.part),
        tabindex: '0',
      }),
      String(node.attrs.text),
    ]
  },

  renderText({ node }) {
    return String(node.attrs.text)
  },

  markdownTokenizer: {
    name: 'mdLinkedFigure',
    level: 'inline',
    start: (src: string) => {
      const m = /\[(?:\\.|[^\]\\\n]){0,500}\]\(redrob-fact:/.exec(src)
      return m ? m.index : -1
    },
    tokenize: (src: string) => {
      const m = matchFigure(src)
      return m ? { type: 'mdLinkedFigure', raw: m.raw, fact: m.fact, part: m.part, text: m.text } : undefined
    },
  },

  parseMarkdown: (token, helpers) =>
    helpers.createNode('mdLinkedFigure', {
      fact: String((token as { fact?: unknown }).fact ?? ''),
      part: (token as { part?: unknown }).part === 'sentence' ? 'sentence' : 'figures',
      text: String((token as { text?: unknown }).text ?? ''),
    }),

  renderMarkdown: (node) =>
    figureMarkdown(
      String(node.attrs?.fact ?? ''),
      node.attrs?.part === 'sentence' ? 'sentence' : 'figures',
      String(node.attrs?.text ?? ''),
    ),
})
