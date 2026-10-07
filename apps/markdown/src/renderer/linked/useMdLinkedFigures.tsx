/**
 * Linked figures in Markdown: insert a figure from the shell's index, keep
 * each figure reading what this file keeps, and keep the index in step with
 * what the saved file contains. The figure itself is the mdLinkedFigure atom
 * (editor/linkedFigure.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { FIGURE_STRINGS, LinkedFigurePicker, useFactsIndex, type FrameTool } from '@genoffice/ui'
import '@genoffice/ui/figures.css'
import {
  factChoices,
  figureInsertText,
  isFactId,
  placedFigureRewrites,
  syncPlacedUses,
  type FactsCommand,
  type FactsState,
  type FigurePart,
  type PlacedFigure,
} from '@genoffice/facts'

export interface MdFigure extends PlacedFigure {
  pos: number
}

/** Every figure in document order; `where` is its top-level block, as Docs counts paragraphs. */
export function collectMdFigures(doc: PmNode): MdFigure[] {
  const out: MdFigure[] = []
  doc.forEach((block, offset, index) => {
    if (block.isLeaf) return
    block.descendants((node, pos) => {
      if (node.type.name !== 'mdLinkedFigure') return true
      out.push({
        fact: String(node.attrs.fact),
        part: node.attrs.part === 'sentence' ? 'sentence' : 'figures',
        text: String(node.attrs.text),
        where: `Paragraph ${index + 1}`,
        pos: offset + 1 + pos,
      })
      return false
    })
  })
  return out
}

type FactsApi = {
  getFacts?: () => Promise<FactsState | null>
  factsCommand?: (cmd: FactsCommand) => Promise<FactsState>
  onFactsChanged?: (handler: (state: FactsState) => void) => () => void
}

export function useMdLinkedFigures({
  api,
  editor,
  filePath,
  clean,
  editable,
  notify,
}: {
  api: FactsApi | undefined
  editor: Editor | null
  filePath: string | null
  /** no unsaved changes: the file on disk says what the editor says */
  clean: boolean
  editable: boolean
  notify: (msg: string) => void
}): { tools: FrameTool[]; overlay: ReactElement | null } {
  const facts = useFactsIndex<FactsState, FactsCommand>(api)
  const [figures, setFigures] = useState<MdFigure[]>([])
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    if (!editor) return
    const read = () => setFigures(collectMdFigures(editor.state.doc))
    read()
    editor.on('update', read)
    return () => {
      editor.off('update', read)
    }
  }, [editor])

  // each figure reads what this file keeps: a kept update rewrites it (an edit, so the file is saved with it)
  useEffect(() => {
    if (!editor || !facts.state || !filePath || !editable) return
    const rewrites = placedFigureRewrites(facts.state, filePath, figures)
    if (rewrites.length === 0) return
    let tr = editor.state.tr
    for (const r of rewrites) {
      const f = figures[r.index]!
      const node = tr.doc.nodeAt(f.pos)
      if (node?.type.name !== 'mdLinkedFigure') continue
      tr = tr.setNodeMarkup(f.pos, undefined, { ...node.attrs, text: r.text })
    }
    if (tr.docChanged) editor.view.dispatch(tr)
  }, [editor, facts.state, filePath, figures, editable])

  // the index says which files use which fact: keep it in step with the saved file
  const syncing = useRef(false)
  useEffect(() => {
    if (!clean || !filePath || !facts.state || syncing.current) return
    const cmds = syncPlacedUses(facts.state, filePath, figures)
    if (cmds.length === 0) return
    syncing.current = true
    void (async () => {
      try {
        for (const c of cmds) await facts.command(c)
      } catch {
        // the file is the record: the next clean state tries again
      } finally {
        syncing.current = false
      }
    })()
  }, [clean, filePath, facts, figures])

  const insert = useCallback(
    (fact: string, part: FigurePart) => {
      setPicking(false)
      if (!editor || !filePath || !facts.state || !isFactId(fact)) return
      const text = figureInsertText(facts.state, filePath, fact, part)
      editor.chain().focus().insertContent({ type: 'mdLinkedFigure', attrs: { fact, part, text } }).run()
      const at = editor.state.selection.from
      const paragraph = editor.state.doc.resolve(Math.min(at, editor.state.doc.content.size)).index(0) + 1
      facts
        .command({ type: 'useFact', file: filePath, use: { fact, kind: part === 'sentence' ? 'sentence' : 'value', where: `Paragraph ${paragraph}` } })
        .catch(() => notify(FIGURE_STRINGS.failed))
    },
    [editor, filePath, facts, notify],
  )

  const tools = useMemo<FrameTool[]>(
    () => [
      {
        id: 'linked-insert',
        label: FIGURE_STRINGS.tool,
        keywords: ['figure', 'link', 'fact', 'number'],
        disabled: !editable || !facts.available,
        run: () => {
          if (!filePath) notify(FIGURE_STRINGS.saveFirst)
          else setPicking(true)
        },
      },
    ],
    [editable, facts.available, filePath, notify],
  )

  const overlay = picking ? (
    <LinkedFigurePicker
      choices={factChoices(facts.state)}
      strings={FIGURE_STRINGS}
      onInsert={insert}
      onClose={() => setPicking(false)}
    />
  ) : null
  return { tools, overlay }
}
