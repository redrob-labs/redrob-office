import { useState, type ReactElement } from 'react'
import { Alert, Button, EmptyState, Icon, Redline } from '@genoffice/ui'
import {
  formatFact,
  sentenceFor,
  type Decision,
  type FactsState,
  type FactUpdate,
  type FileDecision,
} from '@genoffice/facts'
import type { FactsCommand } from '../../../shared/facts-api'
import { useI18n, type TFunc } from '../locale'
import type { FactsHook } from './useFacts'

/** The file's name and the folder it sits in, from a path either separator spells. */
export function splitFilePath(path: string): { name: string; dir: string } {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (i < 0) return { name: path, dir: '' }
  const dir = path.slice(0, i)
  const j = Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\'))
  return { name: path.slice(i + 1), dir: j < 0 ? dir : dir.slice(j + 1) }
}

const isOpen = (d: FileDecision) => d.figures === 'open' || d.sentence === 'open'

function statusOf(d: FileDecision, t: TFunc): { label: string; wait: boolean } {
  if (isOpen(d)) return { label: t('updatesWaiting'), wait: true }
  if (d.figures === 'self') return { label: t('updatesChangedHere'), wait: false }
  if (d.figures === 'undone') return { label: t('updatesKeptOld'), wait: false }
  if (d.figures === 'replaced') return { label: t('updatesReplaced'), wait: false }
  return { label: t('updatesUpdated'), wait: false }
}

function redlineState(d: Decision): 'open' | 'kept' | 'reverted' {
  return d === 'open' ? 'open' : d === 'kept' ? 'kept' : 'reverted'
}

export interface UpdatesViewProps {
  facts: FactsHook
  openPath: (path: string) => void
}

/**
 * Updates: one changed figure, every file that uses it, each kept by a person.
 * Newest first; an older change shows what was decided, or that a newer one
 * replaced it.
 */
export function UpdatesView({ facts, openPath }: UpdatesViewProps): ReactElement {
  const { t } = useI18n()
  const { state } = facts
  const [failed, setFailed] = useState(false)

  const decide = (cmd: FactsCommand) => {
    setFailed(false)
    facts.command(cmd).catch(() => setFailed(true))
  }

  let body: ReactElement
  if (facts.loadFailed) {
    body = (
      <Alert
        tone="danger"
        title={t('updatesLoadFailed')}
        action={
          <Button size="sm" variant="secondary" onClick={facts.retry}>
            {t('updatesRetry')}
          </Button>
        }
      >
        {t('updatesLoadFailedBody')}
      </Alert>
    )
  } else if (!state || state.updates.length === 0) {
    body = (
      <EmptyState
        className="updates-empty"
        icon={<Icon name="refresh" size={20} />}
        title={t('updatesEmptyTitle')}
        description={t('updatesEmptyBody')}
      />
    )
  } else {
    body = (
      <div className="updates-list">
        {failed && <Alert tone="danger" title={t('updatesDecideFailed')} />}
        {state.updates.map((u, i) => (
          <UpdateCard key={u.id} state={state} update={u} older={i > 0} decide={decide} openPath={openPath} />
        ))}
      </div>
    )
  }

  return (
    <main className="content updates" aria-labelledby="updates-title">
      <header className="updates-head">
        <h1 id="updates-title" className="updates-title">
          {t('navUpdates')}
        </h1>
        <p className="updates-sub">{t('updatesSub')}</p>
      </header>
      {body}
    </main>
  )
}

interface UpdateCardProps {
  state: FactsState
  update: FactUpdate
  older: boolean
  decide: (cmd: FactsCommand) => void
  openPath: (path: string) => void
}

function UpdateCard({ state, update: u, older, decide, openPath }: UpdateCardProps): ReactElement {
  const { t, dateLocale } = useI18n()
  const def = state.facts[u.fact]
  const label = def?.label ?? u.fact
  const files = Object.keys(u.files)
  const openN = files.filter((f) => isOpen(u.files[f]!)).length
  const at = Number.isNaN(Date.parse(u.at))
    ? u.at
    : new Date(u.at).toLocaleString(dateLocale, { dateStyle: 'medium', timeStyle: 'short' })
  const where = splitFilePath(u.where).name
  const titleId = `upd-${u.id}`

  return (
    <section className={`upd${older ? ' upd--old' : ''}`} aria-labelledby={titleId}>
      <div className="upd__h">
        <p className="upd__k">
          <Icon name="link" size={14} />
          {label}
        </p>
        <h2 className="upd__t" id={titleId}>
          <del>{formatFact(def, u.from)}</del> <Icon name="arrowRight" size={18} /> <ins>{formatFact(def, u.to)}</ins>
        </h2>
        <p className="upd__m">
          {t('updatesChangedBy', { name: u.by, file: where, at })}{' '}
          {openN === 0 ? t('updatesAllDecided') : openN === 1 ? t('updatesWaitOne') : t('updatesWaitN', { n: openN })}
        </p>
      </div>
      <ol className="upd__files">
        {files.map((file) => {
          const d = u.files[file]!
          const { name, dir } = splitFilePath(file)
          const st = statusOf(d, t)
          const uses = (state.uses[file] ?? []).filter((x) => x.fact === u.fact)
          const figures = uses.filter((x) => x.kind !== 'sentence')
          const sentence = uses.find((x) => x.kind === 'sentence')
          const wordsWere = state.keptWords[u.fact]?.[file]
          return (
            <li key={file} className="updf">
              <div className="updf__h">
                <b className="updf__n">{name}</b>
                {dir && <span className="updf__dir">{dir}</span>}
                <span className={`updf__s updf__s--${st.wait ? 'wait' : 'done'}`}>{st.label}</span>
                <Button size="sm" variant="ghost" onClick={() => openPath(file)} aria-label={`${t('updatesOpen')} ${name}`}>
                  {t('updatesOpen')}
                </Button>
              </div>
              {figures.length > 0 && (
                <table className="updf__tbl">
                  <thead>
                    <tr>
                      <th scope="col">{label}</th>
                      <th scope="col" className="num">
                        {t('updatesWas')}
                      </th>
                      <th scope="col" className="num">
                        {t('updatesNow')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {figures.map((x) => (
                      <tr key={`${x.kind}:${x.where}`}>
                        <td>{x.where}</td>
                        <td className="num">
                          <del>{formatFact(def, u.from)}</del>
                        </td>
                        <td className="num">
                          <ins>{formatFact(def, u.to)}</ins>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {d.figures === 'open' && (
                <div className="updf__act">
                  <Button size="sm" variant="primary" onClick={() => decide({ type: 'keepFile', update: u.id, file })}>
                    {t('updatesKeep')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => decide({ type: 'keepOld', update: u.id, file })}>
                    {t('updatesKeepOldBtn')}
                  </Button>
                </div>
              )}
              {d.sentence && (
                <Redline
                  label={sentence ? `${t('updatesSentence')}, ${sentence.where}` : t('updatesSentence')}
                  source={t('updatesRewritten')}
                  parts={[
                    { kind: 'out', text: sentenceFor(def, d.sentence === 'open' && wordsWere !== undefined ? wordsWere : u.from) ?? '' },
                    { kind: 'in', text: sentenceFor(def, u.to) ?? '' },
                  ]}
                  why={t('updatesSentenceWhy', { a: formatFact(def, u.from), b: formatFact(def, u.to) })}
                  state={redlineState(d.sentence)}
                  {...(d.sentence === 'replaced' ? { stateLabel: t('updatesReplaced') } : {})}
                  keepLabel={t('updatesKeepSentence')}
                  revertLabel={t('updatesKeepOldSentence')}
                  onKeep={() => decide({ type: 'keepSentence', update: u.id, file })}
                  onRevert={() => decide({ type: 'declineSentence', update: u.id, file })}
                />
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
