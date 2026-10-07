/**
 * Units for the 글자 모양 / 문단 모양 dialogs (spec task 2.3). The dialogs speak
 * points, as 한글's do; the engine reads paragraph lengths back in px (96 dpi)
 * and takes them in two different write units, measured against the engine in
 * tests/shape-dialogs.test.tsx:
 *   - margins and indent: 1/200 pt (HWP stores paragraph margins doubled);
 *   - spacing before and after: 1/100 pt;
 *   - line spacing other than percent (fixed, space only, minimum): 1/200 pt.
 * Font size is 1/100 pt both ways. 자간, 장평, relative size and offset are
 * percentages, one per script.
 */
export const SCRIPTS = 7

export const pxToPt = (px: number): number => Math.round(((px * 72) / 96) * 10) / 10

export type ParaLength = 'marginLeft' | 'marginRight' | 'indent' | 'spacingBefore' | 'spacingAfter'

const WRITE_PER_PT: Record<ParaLength, number> = {
  marginLeft: 200,
  marginRight: 200,
  indent: 200,
  spacingBefore: 100,
  spacingAfter: 100,
}

export function paraLengthToEngine(field: ParaLength, pt: number): number {
  return Math.round(pt * WRITE_PER_PT[field])
}

/** Line spacing as the dialog shows it: percent, or pt for the other kinds. */
export function lineSpacingForDialog(type: string, engineValue: number): number {
  return type === 'Percent' ? engineValue : pxToPt(engineValue)
}

export function lineSpacingToEngine(type: string, value: number): number {
  return type === 'Percent' ? Math.round(value) : Math.round(value * 200)
}

/** Line spacing kinds the engine accepts, in 한글's dialog order. */
export const LINE_SPACING_TYPES = ['Percent', 'Fixed', 'SpaceOnly', 'Minimum'] as const
export type LineSpacingType = (typeof LINE_SPACING_TYPES)[number]

export const ALIGNMENTS = ['justify', 'left', 'right', 'center', 'distribute', 'split'] as const
export type Alignment = (typeof ALIGNMENTS)[number]

/** Bounds 한글 allows, used to clamp dialog input. */
export const LIMITS = {
  fontSizePt: [1, 4096],
  ratio: [50, 200],
  spacing: [-50, 50],
  relativeSize: [10, 250],
  offset: [-100, 100],
  lineSpacingPercent: [0, 500],
  lengthPt: [-1000, 1000],
} as const

export function clamp(v: number, [lo, hi]: readonly [number, number]): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo))
}

/** Replace one script's value, or all of them when `script` is 'all'. */
export function setPerScript(values: readonly number[] | undefined, script: number | 'all', v: number): number[] {
  const base = values && values.length === SCRIPTS ? [...values] : new Array<number>(SCRIPTS).fill(v)
  if (script === 'all') return base.map(() => v)
  base[script] = v
  return base
}
