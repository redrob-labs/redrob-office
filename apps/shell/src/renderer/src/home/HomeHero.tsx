import { useState, type ReactElement } from 'react'
import { Composer, Icon } from '@genoffice/ui'
import { useI18n } from '../locale'
import { greetingKeyFor } from './formats'
import { StartBlank, type StartBlankProps } from './StartBlank'

export interface HomeHeroProps extends StartBlankProps {
  /** account first name for the greeting; omitted when signed out */
  name?: string
  /** base name of the most-recently-opened file, for the "pick up where you
   *  left off" clause; omitted when there is no recent file */
  lastFile?: string
  /** submit a request: open the file it is about with Redrob answering */
  onAsk: (prompt: string) => void
  /** for tests: the hour the greeting is for */
  hour?: number
}

/**
 * The three capability signals shown under the composer (static display, like
 * the Cowork home): Privacy, Memory, Cross-check. Not interactive — they
 * report how the suite is set, matching the reference design.
 */
function CapabilityRow(): ReactElement {
  const { t } = useI18n()
  return (
    <div className="home-hero__caps" aria-label={t('homeComposerLabel')}>
      <span className="home-cap">
        <Icon name="shield" size={16} className="home-cap__icon home-cap__icon--privacy" />
        <span className="home-cap__label">{t('capPrivacy')}</span>
        <span className="home-cap__state">{t('capPrivacyState')}</span>
      </span>
      <span className="home-cap">
        <Icon name="book" size={16} className="home-cap__icon home-cap__icon--memory" />
        <span className="home-cap__label">{t('capMemory')}</span>
        <span className="home-cap__state">{t('capMemoryState')}</span>
      </span>
      <span className="home-cap">
        <Icon name="columns" size={16} className="home-cap__icon home-cap__icon--crosscheck" />
        <span className="home-cap__label">{t('capCrosscheck')}</span>
        <span className="home-cap__state">{t('capCrosscheckState')}</span>
      </span>
    </div>
  )
}

/**
 * Build the dynamic headline. BOTH clauses vary:
 *  - the greeting by time of day (Good morning / afternoon / evening) and the
 *    account name when present;
 *  - the question by whether there is a previous task: when a recent file
 *    exists it invites picking it back up by name, otherwise it asks what to
 *    create. Fully localised (en/ko) via keyed strings with {name}/{file}.
 */
function useGreetingLine(name: string | undefined, lastFile: string | undefined, hour: number): string {
  const { t } = useI18n()
  const greeting = name
    ? t(`${greetingKeyFor(hour)}Name` as Parameters<typeof t>[0], { name })
    : t(greetingKeyFor(hour))
  const question = lastFile ? t('homeAskResume', { file: lastFile }) : t('homeAskLine')
  return `${greeting} ${question}`
}

/**
 * Home starts from the job: a dynamic greeting, the format tiles, one composer,
 * then the capability signals and a bottom AI disclaimer. Centered in the
 * content area. (Tiles sit ABOVE the composer, under the headline.)
 */
export function HomeHero({ name, lastFile, onAsk, hour, ...blank }: HomeHeroProps): ReactElement {
  const { t } = useI18n()
  const [prompt, setPrompt] = useState('')
  const line = useGreetingLine(name, lastFile, hour ?? new Date().getHours())
  const ask = (value: string | undefined) => {
    const text = (value ?? '').trim()
    if (!text) return
    onAsk(text)
    setPrompt('')
  }
  return (
    <section className="home-hero" aria-labelledby="home-hero-ask">
      <h1 id="home-hero-ask" className="home-hero__ask">
        {line}
      </h1>
      <StartBlank {...blank} />
      <div className="home-hero__compose">
        <Composer
          value={prompt}
          onChange={setPrompt}
          onSubmit={ask}
          label={t('homeComposerLabel')}
          placeholder={t('homeComposerPlaceholder')}
          submitLabel={t('homeComposerSubmit')}
          addLabel={t('homeOpenFile')}
          onAdd={blank.onOpenFile}
        />
      </div>
      <CapabilityRow />
      <p className="home-hero__disclaimer">{t('homeDisclaimer')}</p>
    </section>
  )
}
