/**
 * Live Sheets: cell contents typed in one window reach everyone else with the
 * file open, through the shared "cells" map of the file's live room (see
 * @genoffice/sync-client/live-models). Values and formulas only: formatting,
 * rows and columns, charts and sheets themselves still travel with the next
 * saved version. Univer's open-source edition has no collaboration of its
 * own, so this is a binding on its set-range-values mutation.
 *
 * Someone else's cell is applied as the same mutation a paste applies, so it
 * goes into this window's edit journal (a save here writes it too) but not
 * into its undo history, and it is never sent back.
 */
import { useEffect, useRef } from 'react'
import { useLiveRoom, type LiveFace } from '@genoffice/live-text/room'
import { bindCells, type CellsBinding, type LiveCell } from '@genoffice/sync-client/live-models'
import type { LiveApi } from '@genoffice/sync-client'
import type { UniverRuntime } from '../univer-state'

export const SET_RANGE_VALUES_MUTATION_ID = 'sheet.mutation.set-range-values'
export const SET_RANGE_VALUES_COMMAND_ID = 'sheet.command.set-range-values'

/** set while this window applies someone else's cells, so they are not sent back */
export const liveRemote = { active: false }

type CellData = { v?: unknown; f?: unknown; p?: unknown } | null | undefined

/** The content changes in a set-range-values payload (style-only entries carry nothing to share). */
export function cellsFromMutation(sheetId: string, cellValue: unknown): LiveCell[] {
  if (!sheetId || typeof cellValue !== 'object' || cellValue === null) return []
  const out: LiveCell[] = []
  for (const [rowKey, row] of Object.entries(cellValue as Record<string, unknown>)) {
    const r = Number(rowKey)
    if (!Number.isInteger(r) || r < 0 || typeof row !== 'object' || row === null) continue
    for (const [colKey, raw] of Object.entries(row as Record<string, CellData>)) {
      const c = Number(colKey)
      if (!Number.isInteger(c) || c < 0) continue
      // a cleared cell is null; a content edit carries v or f
      if (raw === null) {
        out.push({ sheetId, row: r, col: c, v: null })
        continue
      }
      if (!raw || !('v' in raw || 'f' in raw)) continue
      const v = raw.v === undefined || raw.v === null ? null : ['string', 'number', 'boolean'].includes(typeof raw.v) ? (raw.v as LiveCell['v']) : null
      const f = typeof raw.f === 'string' && raw.f ? raw.f : undefined
      out.push(f ? { sheetId, row: r, col: c, v, f } : { sheetId, row: r, col: c, v })
    }
  }
  return out
}

/** Someone else's cells as one set-range-values payload per sheet. */
export function mutationsFor(cells: readonly LiveCell[]): Map<string, Record<number, Record<number, { v: LiveCell['v']; f?: string }>>> {
  const bySheet = new Map<string, Record<number, Record<number, { v: LiveCell['v']; f?: string }>>>()
  for (const c of cells) {
    const sheet = bySheet.get(c.sheetId) ?? {}
    sheet[c.row] ??= {}
    sheet[c.row]![c.col] = c.f ? { v: c.v, f: c.f } : { v: c.v }
    bySheet.set(c.sheetId, sheet)
  }
  return bySheet
}

function applyRemote(runtime: UniverRuntime, cells: readonly LiveCell[]): void {
  const workbook = runtime.univerAPI.getActiveWorkbook()
  const unitId = workbook?.getId()
  if (!workbook || !unitId) return
  liveRemote.active = true
  try {
    for (const [sheetId, cellValue] of mutationsFor(cells)) {
      // a sheet this copy does not have (added since its version) waits for the next saved version
      if (!workbook.getSheetBySheetId(sheetId)) continue
      runtime.univerAPI.syncExecuteCommand(SET_RANGE_VALUES_MUTATION_ID, { unitId, subUnitId: sheetId, cellValue })
    }
  } finally {
    liveRemote.active = false
  }
}

export function useLiveCells({
  api,
  path,
  runtime,
}: {
  api: Partial<LiveApi> | undefined
  path: string | null
  runtime: () => UniverRuntime | null
}): { live: boolean; readOnly: boolean; faces: LiveFace[] } {
  const room = useLiveRoom({ api, path })
  const runtimeRef = useRef(runtime)
  runtimeRef.current = runtime
  const state = room.state

  useEffect(() => {
    if (state.kind !== 'live') return
    const rt = runtimeRef.current()
    if (!rt) return
    const { doc, readOnly } = state
    const binding: CellsBinding = bindCells(doc, {
      readOnly,
      onRemote: (cells) => {
        const r = runtimeRef.current()
        if (r) applyRemote(r, cells)
      },
    })
    // what others typed since the version this computer has
    applyRemote(rt, binding.all())
    const sent = rt.univerAPI.addEvent(rt.univerAPI.Event.CommandExecuted, (event) => {
      if (event.id !== SET_RANGE_VALUES_MUTATION_ID || liveRemote.active) return
      const options = event.options as { fromFormula?: boolean } | undefined
      const params = event.params as { subUnitId?: string; cellValue?: unknown; __splitChunk__?: boolean } | undefined
      // engine-derived results and copy-sheet chunks are not anyone's typing
      if (options?.fromFormula || params?.__splitChunk__ || !params?.subUnitId) return
      binding.push(cellsFromMutation(params.subUnitId, params.cellValue))
    })
    // a view or comment role sees changes as they come but cannot change cells
    const guard = readOnly
      ? rt.univerAPI.addEvent(rt.univerAPI.Event.BeforeCommandExecute, (event) => {
          if (liveRemote.active) return
          const options = event.options as { fromFormula?: boolean } | undefined
          if (options?.fromFormula) return
          if (event.id === SET_RANGE_VALUES_COMMAND_ID || event.id === SET_RANGE_VALUES_MUTATION_ID) event.cancel = true
        })
      : null
    return () => {
      sent.dispose()
      guard?.dispose()
      binding.destroy()
    }
  }, [state])

  return {
    live: state.kind === 'live',
    readOnly: state.kind === 'live' && state.readOnly,
    faces: room.faces,
  }
}
