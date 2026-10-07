import type { Node as PmDocNode } from '@tiptap/pm/model'
import type { CatchUpRevision } from '@genoffice/versions'

/** Every tracked insertion or deletion in the document, with its author, date and position. */
export function collectRevisions(doc: PmDocNode): CatchUpRevision[] {
  const out: CatchUpRevision[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) return true
    for (const m of node.marks) {
      const kind = m.type.name
      if (kind !== 'ins' && kind !== 'del') continue
      const date = m.attrs.date
      out.push({
        kind,
        author: String(m.attrs.author ?? ''),
        ...(typeof date === 'string' && date ? { date } : {}),
        at: pos,
      })
    }
    return true
  })
  return out
}
