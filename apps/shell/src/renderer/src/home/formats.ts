import type { StringKey } from '../locale'

/** a file kind Home can start blank */
export type StartKind = 'docx' | 'xlsx' | 'pptx' | 'hwp' | 'md' | 'pdf'

export interface StartFormat {
  kind: StartKind
  /** the format's plain name, e.g. Document */
  label: StringKey
  /** extensions it opens, newest first: the format a blank file is saved in comes first */
  exts: readonly string[]
}

/**
 * "Or start blank", in the product's format order: documents, sheets, decks,
 * Hangul, then Markdown and PDF. Within each, the newer format first.
 */
export const START_FORMATS: readonly StartFormat[] = [
  { kind: 'docx', label: 'fmtDocument', exts: ['.docx', '.doc'] },
  { kind: 'xlsx', label: 'fmtSpreadsheet', exts: ['.xlsx', '.xls'] },
  { kind: 'pptx', label: 'fmtPresentation', exts: ['.pptx', '.ppt'] },
  { kind: 'hwp', label: 'fmtHangul', exts: ['.hwpx', '.hwp'] },
  { kind: 'md', label: 'fmtMarkdown', exts: ['.md'] },
  { kind: 'pdf', label: 'fmtPdf', exts: ['.pdf'] },
]

/** the three starters under Home's composer (no sample people or files) */
export const HOME_SUGGESTIONS: readonly StringKey[] = [
  'homeAskNda',
  'homeAskBoardMemo',
  'homeAskUpdateDeck',
]

/** Home's greeting key for the hour of the day */
export function greetingKeyFor(hour: number): StringKey {
  if (hour >= 5 && hour < 12) return 'greetMorning'
  if (hour >= 12 && hour < 18) return 'greetAfternoon'
  return 'greetEvening'
}
