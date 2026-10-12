// UI-ONLY BUILD: @genoffice/font-metrics originally located system fonts and
// extracted vertical metrics via node:fs (Electron main process) - backend,
// removed. The renderer only needs the FaceVerticalMetrics TYPE, referenced by
// the docs IPC contract, so this UI-only slice ships just that plain-data type.
export interface FaceVerticalMetrics {
  unitsPerEm: number
  hheaAscender: number
  hheaDescender: number
  hheaLineGap: number
  typoAscender: number | null
  typoDescender: number | null
  typoLineGap: number | null
  winAscent: number | null
  winDescent: number | null
  /** OS/2 fsSelection bit 7 (USE_TYPO_METRICS) */
  useTypoMetrics: boolean
}
