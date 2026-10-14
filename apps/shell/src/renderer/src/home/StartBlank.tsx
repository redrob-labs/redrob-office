import type { ReactElement } from 'react'
import { useI18n } from '../locale'
import { type StartKind } from './formats'
import { FormatIcon } from './FormatIcon'

export interface StartBlankProps {
  /** open a blank file of this kind */
  onStart: (kind: StartKind) => void
  /** open a file from disk (kept in props for the hero's composer "add" affordance) */
  onOpenFile: () => void
}

/**
 * The blank-file launcher below the headline: Apple-style vertical tiles
 * (icon on top, name below), one per format. No "Or start blank" heading and
 * no per-tile extension line — just the six formats.
 *
 * Order is explicit here (Documents, Spreadsheet, Presentation, PDF, Hangul,
 * Markdown) rather than the START_FORMATS order, which groups by product.
 */
const TILE_ORDER: readonly StartKind[] = ['docx', 'xlsx', 'pptx', 'pdf', 'hwp', 'md']

const TILE_LABEL: Record<StartKind, string> = {
  docx: 'fmtDocument',
  xlsx: 'fmtSpreadsheet',
  pptx: 'fmtPresentation',
  pdf: 'fmtPdf',
  hwp: 'fmtHangul',
  md: 'fmtMarkdown',
}

export function StartBlank({ onStart }: StartBlankProps): ReactElement {
  const { t } = useI18n()
  return (
    <div className="home-tiles" role="group" aria-label={t('homeStartBlank')}>
      {TILE_ORDER.map((kind) => (
        <button
          key={kind}
          type="button"
          className="home-tile"
          aria-label={t(TILE_LABEL[kind] as Parameters<typeof t>[0])}
          onClick={() => onStart(kind)}
        >
          <FormatIcon kind={kind} size={40} />
          <span className="home-tile__name">{t(TILE_LABEL[kind] as Parameters<typeof t>[0])}</span>
        </button>
      ))}
    </div>
  )
}
