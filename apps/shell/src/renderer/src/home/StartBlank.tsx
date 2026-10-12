import type { ReactElement } from 'react'
import { Icon } from '@genoffice/ui'
import { useI18n } from '../locale'
import { START_FORMATS, type StartKind } from './formats'
import { FormatIcon } from './FormatIcon'

export interface StartBlankProps {
  /** open a blank file of this kind */
  onStart: (kind: StartKind) => void
  /** open a file from disk */
  onOpenFile: () => void
}

/** "Or start blank": every format newest first, then Open a file */
export function StartBlank({ onStart, onOpenFile }: StartBlankProps): ReactElement {
  const { t } = useI18n()
  return (
    <div className="home-blank" role="group" aria-labelledby="home-blank-label">
      <span id="home-blank-label" className="home-blank__label">
        {t('homeStartBlank')}
      </span>
      {START_FORMATS.map((f) => (
        <button
          key={f.kind}
          type="button"
          className="home-blank__btn"
          aria-label={`${t(f.label)} ${f.exts.join(' ')}`}
          onClick={() => onStart(f.kind)}
        >
          <FormatIcon kind={f.kind} />
          <span className="home-blank__name">{t(f.label)}</span>
          <span className="home-blank__ext" aria-hidden="true">
            {f.exts.join(' ')}
          </span>
        </button>
      ))}
      <button type="button" className="home-blank__btn" onClick={onOpenFile}>
        <span className="home-fmt-icon" aria-hidden="true">
          <Icon name="folder" size={14} />
        </span>
        <span className="home-blank__name">{t('homeOpenFile')}</span>
      </button>
    </div>
  )
}
