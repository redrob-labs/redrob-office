import { useEffect, useId, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { Alert, Button, Icon, IconButton } from '@genoffice/ui'
import {
  figState,
  filesUsing,
  formatFact,
  sameValue,
  sentenceFor,
  type FactsCommand,
  type FactsState,
  type FigurePart,
} from '@genoffice/facts'
import { figureLook } from './figures'
import { figT } from './strings'

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p

export interface FigureCardProps {
  state: FactsState
  /** this document's path */
  file: string
  fact: string
  part: FigurePart
  /** where to place the card: the figure's box on screen */
  anchor: { left: number; top: number; bottom: number }
  command: (cmd: FactsCommand) => Promise<unknown>
  onClose: () => void
  /** the document cannot be edited (Viewing, protected): show, never change */
  readOnly?: boolean
}

const WIDTH = 340
const HEIGHT = 330

/**
 * A linked figure's card: where it came from, which files use it, and one
 * field to change it everywhere. While an update waits it offers the two
 * decisions instead.
 */
export function FigureCard({ state, file, fact, part, anchor, command, onClose, readOnly }: FigureCardProps): ReactElement | null {
  const ref = useRef<HTMLDivElement>(null)
  const inputId = useId()
  const hintId = useId()
  const titleId = useId()
  const def = state.facts[fact]
  const current = state.values[fact]
  const [val, setVal] = useState(() => (current === undefined ? '' : String(current)))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => {
      const input = ref.current?.querySelector('input')
      ;(input ?? ref.current)?.focus()
    }, 0)
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    const out = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (ref.current && target && !ref.current.contains(target) && !target.closest?.('.doc-fig')) onClose()
    }
    document.addEventListener('keydown', esc, true)
    document.addEventListener('mousedown', out)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('keydown', esc, true)
      document.removeEventListener('mousedown', out)
    }
  }, [onClose])

  const s = figState(state, fact, file, part)
  const look = figureLook(s)
  const label = def?.label ?? fact
  const show = (v: number) => (part === 'sentence' ? (sentenceFor(def, v) ?? '') : formatFact(def, v))

  const run = (cmd: FactsCommand) => {
    setFailed(false)
    command(cmd).then(onClose, () => setFailed(true))
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = Number.parseFloat(val.replace(/[^0-9.+-]/g, ''))
    if (!Number.isFinite(v) || current === undefined || sameValue(v, current)) return
    run({ type: 'editSource', fact, file, to: v })
  }

  const using = filesUsing(state, fact)
  const last = state.updates.find((u) => u.fact === fact)
  const left = Math.min(Math.max(8, anchor.left), Math.max(8, window.innerWidth - WIDTH - 8))
  const below = anchor.bottom + 8 + HEIGHT < window.innerHeight
  const top = below ? anchor.bottom + 8 : Math.max(8, anchor.top - 8 - HEIGHT)
  const statusLabel =
    look === 'wait' ? figT('figWaiting') : look === 'stale' ? figT('figStale') : look === 'ok' ? figT('figUpToDate') : figT('figUnknown')

  return (
    <div
      ref={ref}
      className="doc-figcard"
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={{ left, top, width: WIDTH }}
    >
      <div className="doc-figcard__h">
        <Icon name="link" size={14} />
        <b id={titleId}>{label}</b>
        <span className={`doc-figcard__st doc-figcard__st--${look}`}>{statusLabel}</span>
        <IconButton size="sm" variant="ghost" label={figT('figClose')} onClick={onClose}>
          <Icon name="close" size={14} />
        </IconButton>
      </div>
      {s && (
        <div className="doc-figcard__v">
          {s.upd ? (
            <>
              <del>{show(s.kept)}</del> <ins>{show(s.upd.to)}</ins>
            </>
          ) : (
            show(s.kept)
          )}
        </div>
      )}
      <dl className="doc-figcard__dl">
        {def && (
          <>
            <dt>{figT('figSource')}</dt>
            <dd>
              {baseName(def.source.file)}, {def.source.ref}
            </dd>
          </>
        )}
        {last && (
          <>
            <dt>{figT('figLastChanged')}</dt>
            <dd>
              {last.by}, {Number.isNaN(Date.parse(last.at)) ? last.at : new Date(last.at).toLocaleString()}
            </dd>
          </>
        )}
        <dt>{figT('figUsedIn')}</dt>
        <dd>
          {using.length === 1 ? figT('figOneFile') : figT('figFiles', { n: using.length })}: {using.map(baseName).join(', ')}
        </dd>
      </dl>
      {failed && <Alert tone="danger" title={figT('figFailed')} />}
      {readOnly || !s ? null : s.upd ? (
        <div className="doc-figcard__act">
          <Button
            size="sm"
            variant="primary"
            onClick={() => run({ type: part === 'sentence' ? 'keepSentence' : 'keepFile', update: s.upd!.id, file })}
          >
            {part === 'sentence' ? figT('figKeepSentence') : figT('figKeep')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => run({ type: part === 'sentence' ? 'declineSentence' : 'keepOld', update: s.upd!.id, file })}
          >
            {part === 'sentence' ? figT('figKeepOldSentence') : figT('figKeepOld')}
          </Button>
        </div>
      ) : part === 'sentence' ? (
        <p className="doc-figcard__note">{figT('figSentenceNote')}</p>
      ) : (
        <form className="doc-figcard__form" onSubmit={submit}>
          <label htmlFor={inputId}>{figT('figChange')}</label>
          <div className="doc-figcard__row">
            {def?.display?.prefix && <span aria-hidden="true">{def.display.prefix}</span>}
            <input
              id={inputId}
              inputMode="decimal"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              aria-describedby={hintId}
            />
            {def?.display?.suffix && <span aria-hidden="true">{def.display.suffix}</span>}
            <Button size="sm" variant="primary" type="submit">
              {figT('figUpdate')}
            </Button>
          </div>
          <p id={hintId} className="doc-figcard__note">
            {figT('figChangeHint')}
          </p>
        </form>
      )}
    </div>
  )
}
