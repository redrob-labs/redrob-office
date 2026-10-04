/**
 * How the editor frame shares the window between the rail, the page and the
 * Redrob panel. The page never goes under PAGE_MIN; the panel lives between
 * PANEL_MIN and PANEL_MAX and gives way first: it shrinks toward PANEL_MIN,
 * and when even that would squeeze the page it closes.
 */
export const PANEL_MIN = 320
export const PANEL_MAX = 720
export const PANEL_DEFAULT = 380
export const PAGE_MIN = 460

export interface FrameLayoutInput {
  /** width the frame has, in px */
  width: number
  /** rail width when shown, 0 when hidden */
  rail: number
  /** the width the person dragged the panel to */
  preferred: number
  /** the person wants the panel open */
  open: boolean
}

export interface FrameLayout {
  /** the panel is shown at all */
  panelOpen: boolean
  /** panel width in px (0 when closed) */
  panel: number
  /** what is left for the page */
  page: number
  /** the panel was closed or shrunk to keep the page at its minimum */
  constrained: boolean
}

export function clampPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return PANEL_DEFAULT
  return Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, width)))
}

export function frameLayout({ width, rail, preferred, open }: FrameLayoutInput): FrameLayout {
  const w = Math.max(0, Math.floor(width))
  const r = Math.max(0, Math.floor(rail))
  if (!open) return { panelOpen: false, panel: 0, page: Math.max(0, w - r), constrained: false }
  const want = clampPanelWidth(preferred)
  const room = w - r - PAGE_MIN
  if (room >= want) return { panelOpen: true, panel: want, page: w - r - want, constrained: false }
  if (room >= PANEL_MIN) return { panelOpen: true, panel: room, page: w - r - room, constrained: true }
  return { panelOpen: false, panel: 0, page: Math.max(0, w - r), constrained: true }
}
