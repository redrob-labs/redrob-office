import type { ReactElement } from 'react'
import { Icon, IconButton } from '@genoffice/ui'
import { figState, formatFact, sentenceFor, type FactsState } from '@genoffice/facts'
import { figureLook, type DocFigure } from './figures'
import { figT } from './strings'

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p

export interface SourcesRailProps {
  state: FactsState | null
  file: string | null
  figures: readonly DocFigure[]
  /** move to the figure and open its card */
  onPick: (figure: DocFigure) => void
  onClose: () => void
}

/** Sources: every linked figure in the document, where it comes from, and its state. */
export function SourcesRail({ state, file, figures, onPick, onClose }: SourcesRailProps): ReactElement {
  return (
    <nav className="doc-sources" aria-label={figT('sourcesTitle')}>
      <div className="doc-sources__h">
        <h2>{figT('sourcesTitle')}</h2>
        <IconButton size="sm" variant="ghost" label={figT('sourcesClose')} onClick={onClose}>
          <Icon name="close" size={14} />
        </IconButton>
      </div>
      {figures.length === 0 ? (
        <p className="doc-sources__empty">{figT('sourcesEmpty')}</p>
      ) : (
        <ul className="doc-sources__list">
          {figures.map((f) => {
            const def = state?.facts[f.fact]
            const s = state && file ? figState(state, f.fact, file, f.part) : null
            const look = figureLook(s)
            const now = s ? (f.part === 'sentence' ? sentenceFor(def, s.kept) : formatFact(def, s.kept)) : f.text
            const status =
              look === 'wait' ? figT('figWaiting') : look === 'stale' ? figT('figStale') : look === 'ok' ? figT('figUpToDate') : figT('figUnknown')
            return (
              <li key={f.pos}>
                <button type="button" className="doc-sources__item" onClick={() => onPick(f)}>
                  <span className="doc-sources__label">{def?.label ?? f.fact}</span>
                  <span className="doc-sources__value">{now}</span>
                  <span className="doc-sources__meta">
                    {def ? `${baseName(def.source.file)}, ${def.source.ref}` : f.fact}
                  </span>
                  <span className={`doc-sources__st doc-sources__st--${look}`}>{status}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </nav>
  )
}
