/**
 * The properties block (YAML frontmatter) of a live Markdown file. It sits
 * outside the editor's document, so it is shared beside the text: the
 * "frontmatter" key of the shared "markdown" map holds the inner YAML.
 * Last writer wins for the whole block, which is how people edit it (one
 * small panel), and someone else's change never marks this view unsaved.
 */
import type * as Y from 'yjs'

export const MARKDOWN_MAP = 'markdown'
const KEY = 'frontmatter'
const LOCAL = Symbol('frontmatter-local')

export interface FrontmatterBinding {
  /** this person changed the properties */
  push(inner: string): void
  destroy(): void
}

export function bindFrontmatter(
  doc: Y.Doc,
  opts: { initial: string; seed: boolean; readOnly: boolean; onRemote: (inner: string) => void },
): FrontmatterBinding {
  const map = doc.getMap<string>(MARKDOWN_MAP)
  if (opts.seed && !map.has(KEY)) doc.transact(() => map.set(KEY, opts.initial), LOCAL)
  else if (map.has(KEY)) {
    const shared = map.get(KEY) ?? ''
    if (shared !== opts.initial) opts.onRemote(shared)
  }
  const observe = (e: Y.YMapEvent<string>) => {
    if (e.transaction.origin === LOCAL || !e.keysChanged.has(KEY)) return
    opts.onRemote(map.get(KEY) ?? '')
  }
  map.observe(observe)
  return {
    push(inner) {
      // a read-only session never writes the shared document
      if (opts.readOnly || map.get(KEY) === inner) return
      doc.transact(() => map.set(KEY, inner), LOCAL)
    },
    destroy: () => map.unobserve(observe),
  }
}
