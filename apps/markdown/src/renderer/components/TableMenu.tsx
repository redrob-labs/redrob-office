import { useEffect, useState } from 'react'
import { Toolbar, ToolbarButton, ToolbarGroup } from '@genoffice/ui'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useI18n } from '../i18n/locale'
import {
  IconColDelete,
  IconColInsertLeft,
  IconColInsertRight,
  IconHeaderRow,
  IconRowDelete,
  IconRowInsertAbove,
  IconRowInsertBelow,
  IconTableDelete,
} from './icons'

interface Props {
  editor: Editor | null
  /** scroll container of the editor canvas, for repositioning on scroll */
  scrollRef: React.RefObject<HTMLElement | null>
  /** Reposition the viewport-anchored menu after document zoom changes. */
  zoom: number
}

/**
 * Floating table toolbar shown while the caret is inside a table, docked to
 * the table's top-right corner. Only markdown-expressible operations: row/
 * column insert & delete, header-row toggle, delete table (no merge — GFM
 * tables cannot serialize spans).
 */
export function TableMenu({ editor, scrollRef, zoom }: Props) {
  const { t } = useI18n()
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null)

  const inTable = useEditorState({
    editor,
    selector: ({ editor: e }) => Boolean(e?.isActive('table')),
  })

  useEffect(() => {
    if (!editor || !inTable) {
      setRect(null)
      return
    }
    const reposition = () => {
      const { from } = editor.state.selection
      const dom = editor.view.domAtPos(from).node
      const el = dom instanceof HTMLElement ? dom : dom.parentElement
      const table = el?.closest('table')
      if (!table) {
        setRect(null)
        return
      }
      const r = table.getBoundingClientRect()
      setRect({ top: r.top - 40, left: Math.max(8, r.right - 8) })
    }
    reposition()
    editor.on('selectionUpdate', reposition)
    editor.on('update', reposition)
    const scroller = scrollRef.current
    scroller?.addEventListener('scroll', reposition, { passive: true })
    window.addEventListener('resize', reposition)
    return () => {
      editor.off('selectionUpdate', reposition)
      editor.off('update', reposition)
      scroller?.removeEventListener('scroll', reposition)
      window.removeEventListener('resize', reposition)
    }
  }, [editor, inTable, scrollRef, zoom])

  if (!editor || !inTable || !rect) return null
  const run = (fn: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) =>
    fn(editor.chain().focus()).run()
  const ICON = 15

  return (
    <div
      className="table-menu"
      style={{ position: 'fixed', top: rect.top, left: rect.left, transform: 'translateX(-100%)' }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Toolbar label={t('tableToolbar')}>
        <ToolbarGroup>
          <ToolbarButton
            label={t('tableRowAbove')}
            icon={<IconRowInsertAbove size={ICON} />}
            onClick={() => run((c) => c.addRowBefore())}
          />
          <ToolbarButton
            label={t('tableRowBelow')}
            icon={<IconRowInsertBelow size={ICON} />}
            onClick={() => run((c) => c.addRowAfter())}
          />
          <ToolbarButton
            className="tm-danger"
            label={t('tableDeleteRow')}
            icon={<IconRowDelete size={ICON} />}
            onClick={() => run((c) => c.deleteRow())}
          />
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarButton
            label={t('tableColLeft')}
            icon={<IconColInsertLeft size={ICON} />}
            onClick={() => run((c) => c.addColumnBefore())}
          />
          <ToolbarButton
            label={t('tableColRight')}
            icon={<IconColInsertRight size={ICON} />}
            onClick={() => run((c) => c.addColumnAfter())}
          />
          <ToolbarButton
            className="tm-danger"
            label={t('tableDeleteCol')}
            icon={<IconColDelete size={ICON} />}
            onClick={() => run((c) => c.deleteColumn())}
          />
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarButton
            label={t('tableToggleHeaderRow')}
            icon={<IconHeaderRow size={ICON} />}
            onClick={() => run((c) => c.toggleHeaderRow())}
          />
          <ToolbarButton
            className="tm-danger"
            label={t('tableDeleteTable')}
            icon={<IconTableDelete size={ICON} />}
            onClick={() => run((c) => c.deleteTable())}
          />
        </ToolbarGroup>
      </Toolbar>
    </div>
  )
}
