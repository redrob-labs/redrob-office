import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { FactsState } from '@genoffice/facts'
import { SET_RANGE_VALUES_MUTATION } from './app-constants'
import { LINKED_CELL_STRINGS, linkCellCommands, linkedCellsIn, sourceEdits, type CellRef } from './linked-cells'
import type { UniverRuntime } from './univer-state'

const fill = (s: string, v: Record<string, string | number>) =>
  Object.entries(v).reduce((out, [k, x]) => out.split(`{${k}}`).join(String(x)), s)

/** how long to wait after the last grid change before reading linked cells (bursts: paste, recalc) */
const SETTLE_MS = 300

export interface LinkedCells {
  /** links the active cell; reports the outcome through `setMessage` */
  linkActiveCell: () => void
  /** facts whose source is a cell in this workbook */
  linkedCount: number
}

/**
 * Linked cells in Sheets: "Link this cell" defines a fact from the active cell,
 * and every settled grid change (typed, pasted or recalculated) sends the new
 * value of each linked cell to the shell, so the documents that use it wait
 * in Updates.
 */
export function useLinkedCells(
  univerRef: MutableRefObject<UniverRuntime | null>,
  workbookPath: string | undefined,
  setMessage: (msg: string) => void,
): LinkedCells {
  const api = typeof window === 'undefined' ? undefined : window.desktopApi
  const [state, setState] = useState<FactsState | null>(null)
  const stateRef = useRef<FactsState | null>(null)
  stateRef.current = state

  useEffect(() => {
    if (!api?.getFacts) return
    let live = true
    api
      .getFacts()
      .then((s) => {
        if (live && s) setState(s)
      })
      .catch(() => undefined)
    const off = api.onFactsChanged?.((s) => setState(s))
    return () => {
      live = false
      off?.()
    }
  }, [api])

  const readCell = useCallback(
    (ref: CellRef): unknown =>
      univerRef.current?.univerAPI.getActiveWorkbook()?.getSheetByName(ref.sheet)?.getRange(ref.a1).getValue(),
    [univerRef],
  )

  // the workbook's linked cells, re-read after each settled burst of value changes
  useEffect(() => {
    const runtime = univerRef.current
    if (!runtime || !workbookPath || !api?.factsCommand) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let sending = false
    const flush = async () => {
      timer = null
      const s = stateRef.current
      if (sending || linkedCellsIn(s, workbookPath).length === 0) return
      const cmds = sourceEdits(s, workbookPath, readCell)
      if (cmds.length === 0) return
      sending = true
      try {
        for (const c of cmds) {
          const next = await api.factsCommand!(c)
          setState(next)
          const u = next.updates[0]
          const waiting = u ? Object.values(u.files).filter((d) => d.figures === 'open' || d.sentence === 'open').length : 0
          const ref = c.type === 'editSource' ? (next.facts[c.fact]?.source.ref ?? '') : ''
          setMessage(waiting === 1 ? fill(LINKED_CELL_STRINGS.sentOne, { ref }) : fill(LINKED_CELL_STRINGS.sent, { ref, n: waiting }))
        }
      } catch {
        setMessage(LINKED_CELL_STRINGS.failed)
      } finally {
        sending = false
      }
    }
    // formula results arrive as the same mutation with fromFormula set; both count
    const disposable = runtime.univerAPI.addEvent(runtime.univerAPI.Event.CommandExecuted, ({ id }) => {
      if (id !== SET_RANGE_VALUES_MUTATION) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void flush(), SETTLE_MS)
    })
    return () => {
      if (timer) clearTimeout(timer)
      disposable.dispose()
    }
  }, [univerRef, workbookPath, api, readCell, setMessage])

  const linkActiveCell = useCallback(() => {
    if (!api?.factsCommand) {
      setMessage(LINKED_CELL_STRINGS.unavailable)
      return
    }
    if (!workbookPath) {
      setMessage(LINKED_CELL_STRINGS.notSaved)
      return
    }
    let ref: CellRef
    let value: unknown
    let labelLeft: unknown
    try {
      const workbook = univerRef.current?.univerAPI.getActiveWorkbook()
      const sheet = workbook?.getActiveSheet()
      const range = workbook?.getActiveRange()
      const bounds = range?.getRange()
      if (!sheet || !range || !bounds || bounds.endRow > bounds.startRow || bounds.endColumn > bounds.startColumn) {
        setMessage(LINKED_CELL_STRINGS.noCell)
        return
      }
      ref = { sheet: sheet.getSheetName(), a1: range.getA1Notation().replace(/\$/g, '').replace(/^.*!/, '') }
      value = range.getValue()
      labelLeft = bounds.startColumn > 0 ? sheet.getRange(bounds.startRow, bounds.startColumn - 1, 1, 1).getValue() : undefined
    } catch {
      setMessage(LINKED_CELL_STRINGS.noCell)
      return
    }
    const result = linkCellCommands({ path: workbookPath, ref, value, labelLeft })
    if (!result.ok) {
      setMessage(result.reason === 'not-saved' ? LINKED_CELL_STRINGS.notSaved : LINKED_CELL_STRINGS.notNumber)
      return
    }
    void (async () => {
      try {
        for (const c of result.commands) setState(await api.factsCommand!(c))
        setMessage(fill(LINKED_CELL_STRINGS.linked, { ref: result.fact.source.ref }))
      } catch {
        setMessage(LINKED_CELL_STRINGS.failed)
      }
    })()
  }, [api, workbookPath, univerRef, setMessage])

  return { linkActiveCell, linkedCount: linkedCellsIn(state, workbookPath).length }
}
