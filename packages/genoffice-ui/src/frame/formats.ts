/**
 * What each format promises when it opens: the format chip in the title bar.
 * Newer formats open and save exactly; an older one opens as it is and is
 * offered a copy in the newer format (the original is never overwritten).
 */
export type FormatTone = 'exact' | 'old'

export interface FormatInfo {
  /** the extension with its dot, lowercase */
  ext: string
  tone: FormatTone
  /** what the chip says, e.g. Word */
  label: string
  /** what the format keeps on open and save */
  note: string
  /** for an older format: the newer one a copy is saved in */
  newer?: string
}

export const FORMATS: Readonly<Record<string, FormatInfo>> = {
  '.docx': {
    ext: '.docx',
    tone: 'exact',
    label: 'Word',
    note: 'Exact Word format. Styles, numbering, tracked changes and comments open and save as Word does.',
  },
  '.doc': {
    ext: '.doc',
    tone: 'old',
    label: 'Word 97-2003',
    note: 'The Word format before 2007. It opens as it is; save a .docx copy to use every feature.',
    newer: '.docx',
  },
  '.xlsx': {
    ext: '.xlsx',
    tone: 'exact',
    label: 'Excel',
    note: 'Exact Excel format. Formulas, formats and charts open and save as Excel does.',
  },
  '.xlsm': {
    ext: '.xlsm',
    tone: 'exact',
    label: 'Excel with macros',
    note: 'Excel format with macros. Macros are kept as they are; they do not run here.',
  },
  '.xls': {
    ext: '.xls',
    tone: 'old',
    label: 'Excel 97-2003',
    note: 'The Excel format before 2007. It opens as it is; save an .xlsx copy to use every feature.',
    newer: '.xlsx',
  },
  '.pptx': {
    ext: '.pptx',
    tone: 'exact',
    label: 'PowerPoint',
    note: 'Exact PowerPoint format. Layouts, notes and charts open and save as PowerPoint does.',
  },
  '.ppt': {
    ext: '.ppt',
    tone: 'old',
    label: 'PowerPoint 97-2003',
    note: 'The PowerPoint format before 2007. It opens as it is; save a .pptx copy to use every feature.',
    newer: '.pptx',
  },
  '.hwpx': {
    ext: '.hwpx',
    tone: 'exact',
    label: 'Hangul',
    note: 'Exact Hangul format, the open standard public bodies use. Tables, fonts and page layout round-trip.',
  },
  '.hwp': {
    ext: '.hwp',
    tone: 'old',
    label: 'Hangul, older',
    note: 'The older Hangul format. It opens as it is; save a .hwpx copy to use every feature.',
    newer: '.hwpx',
  },
  '.md': {
    ext: '.md',
    tone: 'exact',
    label: 'Markdown',
    note: 'Plain Markdown. What you see is the text on disk.',
  },
  '.pdf': {
    ext: '.pdf',
    tone: 'exact',
    label: 'PDF',
    note: 'PDF as it is. Pages, text and form fields open and save in place.',
  },
}

/** the format of a file name or extension; undefined for a format Office does not list */
export function formatOf(nameOrExt: string): FormatInfo | undefined {
  const m = /(\.[a-z0-9]+)$/i.exec(nameOrExt.trim())
  if (!m) return undefined
  const ext = m[1]!.toLowerCase()
  return FORMATS[ext === '.markdown' ? '.md' : ext]
}
