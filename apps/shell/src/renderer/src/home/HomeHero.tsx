import { useEffect, useState, type ReactElement } from 'react'
import { Button, Composer, Icon } from '@genoffice/ui'
import type { IdentityApi } from '@genoffice/identity'
import { useI18n } from '../locale'
import { greetingKeyFor } from './formats'
import { StartBlank, type StartBlankProps } from './StartBlank'

export interface HomeHeroProps extends StartBlankProps {
  /** account first name for the greeting; omitted when signed out */
  name?: string
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
 * The headline: one short line, the greeting by time of day (Good morning /
 * afternoon / evening) and the account name when present. The last file is
 * not named here; Recent below already lists it.
 */
function useGreetingLine(name: string | undefined, hour: number): string {
  const { t } = useI18n()
  return name
    ? t(`${greetingKeyFor(hour)}Name` as Parameters<typeof t>[0], { name })
    : t(greetingKeyFor(hour))
}

/** localStorage key: the first-run guide was dismissed on this computer */
const GUIDE_DISMISSED_KEY = 'redrob-office.home-guide-dismissed'

function guideDismissed(): boolean {
  try {
    return window.localStorage.getItem(GUIDE_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * The three things a new person does first — open a file, create one, ask the
 * AI — in one dismissable card. Dismissed once, it never returns.
 */
function HomeGuide(): ReactElement | null {
  const { t } = useI18n()
  const [shown, setShown] = useState(() => !guideDismissed())
  if (!shown) return null
  const dismiss = () => {
    setShown(false)
    try {
      window.localStorage.setItem(GUIDE_DISMISSED_KEY, '1')
    } catch {
      // storage unavailable: the guide simply shows again next time
    }
  }
  const steps: [string, string][] = [
    [t('guideStep1Title'), t('guideStep1Body')],
    [t('guideStep2Title'), t('guideStep2Body')],
    [t('guideStep3Title'), t('guideStep3Body')],
  ]
  return (
    <section className="home-guide" aria-label={t('guideTitle')} data-testid="home-guide">
      <h2 className="home-guide__title">{t('guideTitle')}</h2>
      <Button size="sm" variant="ghost" onClick={dismiss} aria-label={t('guideDismiss')}>
        {t('guideDismiss')}
      </Button>
      <ol className="home-guide__steps">
        {steps.map(([title, body], i) => (
          <li key={title} className="home-guide__step">
            <span className="home-guide__num" aria-hidden="true">
              {i + 1}
            </span>
            <span>
              <b>{title}</b> {body}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

type IdentityStatus = Awaited<ReturnType<IdentityApi['identityStatus']>>

/**
 * Who is signed in, top right of the hero, and the way to Console (billing,
 * API keys). Signed out it is a Sign-in call to action that opens Settings on
 * the account pane (the same IdentityPane; the flow itself lives there).
 */
function useIdentityStatus(): IdentityStatus | null {
  const api: IdentityApi | undefined = window.aiOfficeIdentity
  const [status, setStatus] = useState<IdentityStatus | null>(null)
  useEffect(() => {
    if (!api) return
    let live = true
    const reload = () => void api.identityStatus().then((s) => live && setStatus(s))
    reload()
    const off = api.onIdentityChanged(() => reload())
    return () => {
      live = false
      off()
    }
  }, [api])
  return status
}

function HomeAccountBar({ status }: { status: IdentityStatus | null }): ReactElement {
  const { t } = useI18n()
  const openAccount = () =>
    window.dispatchEvent(new CustomEvent('redrob:open-settings', { detail: { section: 'identity' } }))
  return (
    <div className="home-hero__account" data-testid="home-account">
      {status?.signedIn ? (
        <button type="button" className="home-hero__account-who" onClick={openAccount}>
          {t('idSignedInAs', { name: status.name ?? '' })}
        </button>
      ) : (
        <Button size="sm" variant="primary" onClick={openAccount}>
          {t('idSignIn')}
        </Button>
      )}
      <Button
        size="sm"
        variant="secondary"
        iconLeft={<Icon name="external" size={14} />}
        onClick={() => void window.aiOffice?.openConsole?.()}
      >
        {t('homeBillingConsole')}
      </Button>
    </div>
  )
}

/**
 * Home starts from the job: a dynamic greeting, the format tiles, one composer,
 * then the capability signals and a bottom AI disclaimer. Centered in the
 * content area. (Tiles sit ABOVE the composer, under the headline.)
 */
export function HomeHero({ name, onAsk, hour, ...blank }: HomeHeroProps): ReactElement {
  const { t } = useI18n()
  const [prompt, setPrompt] = useState('')
  const identity = useIdentityStatus()
  // the Redrob account's first name ("Janghoon Lee" -> "Janghoon"), else the
  // name Home passed in
  const firstName = identity?.signedIn ? identity.name?.trim().split(/\s+/)[0] : undefined
  const line = useGreetingLine(firstName || name, hour ?? new Date().getHours())
  const ask = (value: string | undefined) => {
    const text = (value ?? '').trim()
    if (!text) return
    onAsk(text)
    setPrompt('')
  }
  return (
    <section className="home-hero" aria-labelledby="home-hero-ask">
      <HomeAccountBar status={identity} />
      <HomeGuide />
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
