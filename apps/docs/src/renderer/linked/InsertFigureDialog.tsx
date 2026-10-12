import { useState, type ReactElement } from 'react'
import { Button, Dialog } from '@genoffice/ui'
import { formatFact, type FactsState, type FigurePart } from '@genoffice/facts'
import { figT } from './strings'

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p

export interface InsertFigureDialogProps {
  state: FactsState | null
  onInsert: (fact: string, part: FigurePart) => void
  onClose: () => void
}

/** Pick a fact from the index and insert it as a value or as its sentence. */
export function InsertFigureDialog({ state, onInsert, onClose }: InsertFigureDialogProps): ReactElement {
  const facts = state ? Object.values(state.facts) : []
  const [picked, setPicked] = useState<string | null>(facts[0]?.id ?? null)
  const def = picked ? state?.facts[picked] : undefined
  return (
    <Dialog
      title={figT('insertTitle')}
      closeLabel={figT('insertCancel')}
      onClose={onClose}
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={onClose}>
            {figT('insertCancel')}
          </Button>
          {def?.bands?.length ? (
            <Button size="sm" variant="secondary" onClick={() => onInsert(def.id, 'sentence')}>
              {figT('insertSentence')}
            </Button>
          ) : null}
          <Button size="sm" variant="primary" disabled={!def} onClick={() => def && onInsert(def.id, 'figures')}>
            {figT('insertValue')}
          </Button>
        </>
      }
    >
      {facts.length === 0 ? (
        <p>{figT('insertEmpty')}</p>
      ) : (
        <ul className="doc-figpick" role="listbox" aria-label={figT('insertTitle')}>
          {facts.map((f) => (
            <li
              key={f.id}
              role="option"
              aria-selected={picked === f.id}
              tabIndex={0}
              className={`doc-figpick__o${picked === f.id ? ' is-on' : ''}`}
              onClick={() => setPicked(f.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setPicked(f.id)
                }
              }}
            >
              <b>{f.label}</b>
              <span>{formatFact(f, state!.values[f.id] ?? 0)}</span>
              <span className="doc-figpick__src">
                {baseName(f.source.file)}, {f.source.ref}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}
