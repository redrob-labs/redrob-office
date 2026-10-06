// JSON shapes returned by the core's queries. The core returns JSON strings;
// the wrapper decodes them once so callers never parse by hand.
//
// Coordinates are CSS pixels at 96 dpi, page-top-left, y down (the core's
// `coordinateSystem: "page-top-left-y-down"`). 1 inch = 7200 HWPUNIT = 96 px.

export const HWPUNIT_PER_PX = 75

export type HwpFormat = 'hwp' | 'hwpx'

export interface DocumentInfo {
  version: string
  sectionCount: number
  pageCount: number
  encrypted: boolean
  hwp3Variant: boolean
  fallbackFont: string
  fontsUsed: string[]
  fontSubstitutions: FontSubstitution[]
}

export interface FontSubstitution {
  requested?: string
  resolved?: string
  [key: string]: unknown
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface PageInfo {
  pageIndex: number
  pageNumber: number
  width: number
  height: number
  sectionIndex: number
  marginLeft: number
  marginRight: number
  marginTop: number
  marginBottom: number
  marginHeader: number
  marginFooter: number
  headerArea: Rect
  footerArea: Rect
  bodyLeft: number
  bodyRight: number
  [key: string]: unknown
}

export interface CursorRect {
  pageIndex: number
  x: number
  y: number
  height: number
}

export interface SelectionRect extends Rect {
  pageIndex: number
}

/** A cell path step: which control, which cell, which paragraph inside it. */
export interface CellPathStep {
  controlIndex: number
  cellIndex: number
  cellParaIndex: number
}

export interface HitTestResult {
  sectionIndex: number
  paragraphIndex: number
  charOffset: number
  parentParaIndex?: number
  controlIndex?: number
  cellIndex?: number
  cellParaIndex?: number
  cellPath?: CellPathStep[]
  cursorRect?: CursorRect
  [key: string]: unknown
}

export interface SearchResult {
  found: boolean
  wrapped?: boolean
  sec?: number
  para?: number
  charOffset?: number
  length?: number
  totalMatchCount?: number
}

export interface EditResult {
  ok: boolean
  charOffset?: number
  paraIdx?: number
  error?: string
  [key: string]: unknown
}

export interface CharProperties {
  fontFamily: string
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  textColor: string
  [key: string]: unknown
}

export interface ParaProperties {
  alignment: string
  lineSpacing: number
  lineSpacingType: string
  marginLeft: number
  marginRight: number
  indent: number
  spacingBefore: number
  spacingAfter: number
  paraShapeId: number
  [key: string]: unknown
}
