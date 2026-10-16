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

export function StartBlank({ onStart, onOpenFile }: StartBlankProps): ReactElement {
  const { t } = useI18n()
  return (
    <div className="home-tiles" role="group" aria-label={t('homeStartBlank')}>
      {TILE_ORDER.map((kind) => {
        const name = t(TILE_LABEL[kind] as Parameters<typeof t>[0])
        return (
          <div key={kind} className="home-tile home-tile--split">
            {/* the tile body creates a new file; the two actions below spell
                out New / Open, which a bare icon did not */}
            <button
              type="button"
              className="home-tile__main"
              aria-label={`${name}: ${t('homeTileNew')}`}
              onClick={() => onStart(kind)}
            >
              <FormatIcon kind={kind} size={40} />
              <span className="home-tile__name">{name}</span>
            </button>
            <div className="home-tile__actions">
              <button type="button" className="home-tile__action" aria-label={`${name}: ${t('homeTileNew')}`} onClick={() => onStart(kind)}>
                {t('homeTileNew')}
              </button>
              <button type="button" className="home-tile__action" aria-label={`${name}: ${t('homeTileOpen')}`} onClick={onOpenFile}>
                {t('homeTileOpen')}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
