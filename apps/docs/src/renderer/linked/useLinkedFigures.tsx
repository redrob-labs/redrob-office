import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { Editor } from '@tiptap/core'
import type { FrameTool } from '@genoffice/ui'
import { isLinkedFigureId } from '@genoffice/docx-engine'
import type { FigurePart } from '@genoffice/facts'
import { collectFigures, figureCss, figureRewrites, figureUse, keptText, syncUsesCommands, type DocFigure } from './figures'
import { FigureCard } from './FigureCard'
import { InsertFigureDialog } from './InsertFigureDialog'
import { SourcesRail } from './SourcesRail'
import { figT } from './strings'
import { useDocFacts } from './useDocFacts'
import './linked.css'

export interface LinkedFiguresInput {
  editor: Editor | null
  /** null until the document has been saved once */
  filePath: string | null
  /** no unsaved changes: the file on disk says what the editor says */
  clean: boolean
  editable: boolean
  setStatus: (msg: string) => void
}

export interface LinkedFigures {
  /** paper styles for waiting and out-of-date figures */
  css: string
  /** the Sources rail, when open */
  rail: ReactElement | undefined
  /** the card and the insert dialog */
  overlay: ReactElement
  tools: FrameTool[]
}

interface CardAt {
  fact: string
  part: FigurePart
  anchor: { left: number; top: number; bottom: number }
}

/** Linked figures in Docs: the index, the figures in the document, their card and the Sources rail. */
export function useLinkedFigures({ editor, filePath, clean, editable, setStatus }: LinkedFiguresInput): LinkedFigures {
  const facts = useDocFacts(typeof window === 'undefined' ? undefined : window.desktop)
  const [figures, setFigures] = useState<DocFigure[]>([])
  const [card, setCard] = useState<CardAt | null>(null)
  const [inserting, setInserting] = useState(false)
  const [railOpen, setRailOpen] = useState(false)

  // the figures in the document, re-read on every change
  useEffect(() => {
    if (!editor) return
    const read = () => setFigures(collectFigures(editor.state.doc))
    read()
    editor.on('update', read)
    editor.on('create', read)
    return () => {
      editor.off('update', read)
      editor.off('create', read)
    }
  }, [editor])

  // each figure reads what this file keeps: a kept update rewrites it here
  useEffect(() => {
    if (!editor || !facts.state || !filePath) return
    const rewrites = figureRewrites(facts.state, filePath, figures)
    if (rewrites.length === 0) return
    let tr = editor.state.tr
    for (const r of rewrites) {
      const node = tr.doc.nodeAt(r.pos)
      if (node?.type.name !== 'docLinkedFigure') continue
      tr = tr.setNodeMarkup(r.pos, undefined, { ...node.attrs, text: r.text })
    }
    if (tr.docChanged) editor.view.dispatch(tr.setMeta('linkedFigureSync', true))
  }, [editor, facts.state, filePath, figures])

  // the index says which files use which fact: keep it in step with the saved file
  const syncing = useRef(false)
  useEffect(() => {
    if (!clean || !filePath || !facts.state || syncing.current) return
    const cmds = syncUsesCommands(facts.state, filePath, figures)
    if (cmds.length === 0) return
    syncing.current = true
    void (async () => {
      try {
        for (const c of cmds) await facts.command(c)
      } catch {
        // the index is rebuilt from the file on the next clean state; the file is the record
      } finally {
        syncing.current = false
      }
    })()
  }, [clean, filePath, facts, figures])

  const openAt = useCallback((el: HTMLElement) => {
    const fact = el.getAttribute('data-linked-fact')
    if (!fact) return
    const r = el.getBoundingClientRect()
    setCard({
      fact,
      part: el.getAttribute('data-linked-part') === 'sentence' ? 'sentence' : 'figures',
      anchor: { left: r.left, top: r.top, bottom: r.bottom },
    })
  }, [])

  // a figure opens its card on click, Enter or Space
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom as HTMLElement
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('.doc-fig') as HTMLElement | null
      if (el) openAt(el)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      const { selection } = editor.state
      const node = 'node' in selection ? (selection as { node?: { type: { name: string } } }).node : undefined
      if (node?.type.name !== 'docLinkedFigure') return
      const el = editor.view.nodeDOM(selection.from) as HTMLElement | null
      if (!el) return
      e.preventDefault()
      openAt(el)
    }
    dom.addEventListener('click', onClick)
    dom.addEventListener('keydown', onKey)
    return () => {
      dom.removeEventListener('click', onClick)
      dom.removeEventListener('keydown', onKey)
    }
  }, [editor, openAt])

  const insert = useCallback(
    (fact: string, part: FigurePart) => {
      setInserting(false)
      if (!editor || !filePath || !facts.state || !isLinkedFigureId(fact)) return
      const text = keptText(facts.state, filePath, fact, part) ??
        (part === 'sentence' ? '' : String(facts.state.values[fact] ?? ''))
      const at = editor.state.selection.from
      editor
        .chain()
        .focus()
        .insertContent({ type: 'docLinkedFigure', attrs: { fact, part, text } })
        .run()
      const paragraph = editor.state.doc.resolve(Math.min(at, editor.state.doc.content.size)).index(0) + 1
      facts
        .command({ type: 'useFact', file: filePath, use: figureUse({ fact, part, pos: at, text, paragraph }) })
        .catch(() => setStatus(figT('figFailed')))
    },
    [editor, filePath, facts, setStatus],
  )

  const pick = useCallback(
    (f: DocFigure) => {
      if (!editor) return
      editor.chain().focus().setNodeSelection(f.pos).scrollIntoView().run()
      const el = editor.view.nodeDOM(f.pos) as HTMLElement | null
      if (el) openAt(el)
    },
    [editor, openAt],
  )

  const tools = useMemo<FrameTool[]>(
    () => [
      {
        id: 'linked-insert',
        label: figT('toolInsert'),
        keywords: ['figure', 'link', 'fact', 'number'],
        disabled: !editable || !facts.available,
        run: () => {
          if (!filePath) setStatus(figT('figSaveFirst'))
          else setInserting(true)
        },
      },
      {
        id: 'linked-sources',
        label: figT('toolSources'),
        keywords: ['linked', 'figures', 'facts'],
        run: () => setRailOpen((v) => !v),
      },
    ],
    [editable, facts.available, filePath, setStatus],
  )

  const css = figureCss(facts.state, filePath, figures)
  const rail = railOpen ? (
    <SourcesRail state={facts.state} file={filePath} figures={figures} onPick={pick} onClose={() => setRailOpen(false)} />
  ) : undefined
  const overlay = (
    <>
      {card && facts.state && filePath && (
        <FigureCard
          state={facts.state}
          file={filePath}
          fact={card.fact}
          part={card.part}
          anchor={card.anchor}
          command={facts.command}
          readOnly={!editable}
          onClose={() => setCard(null)}
        />
      )}
      {inserting && <InsertFigureDialog state={facts.state} onInsert={insert} onClose={() => setInserting(false)} />}
    </>
  )
  return { css, rail, overlay, tools }
}
