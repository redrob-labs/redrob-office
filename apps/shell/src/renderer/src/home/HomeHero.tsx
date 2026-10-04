import { useState, type ReactElement } from 'react'
import { Composer, Icon, PromptSuggestions } from '@genoffice/ui'
import { useI18n } from '../locale'
import { HOME_SUGGESTIONS, greetingKeyFor } from './formats'
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
 * Home starts from the job, not the file: a greeting, one composer, three
 * starters, then "Or start blank". The Office wash behind it is location
 * only; everything a person acts on is Redrob Blue.
 */
export function HomeHero({ name, onAsk, hour, ...blank }: HomeHeroProps): ReactElement {
  const { t } = useI18n()
  const [prompt, setPrompt] = useState('')
  const greeting = t(greetingKeyFor(hour ?? new Date().getHours()))
  const ask = (value: string | undefined) => {
    const text = (value ?? '').trim()
    if (!text) return
    onAsk(text)
    setPrompt('')
  }
  return (
    <section className="home-hero" aria-labelledby="home-hero-ask">
      <p className="home-hero__hi">
        <Icon name="sparkle" size={16} />
        <span>{name ? `${greeting}, ${name}` : greeting}</span>
      </p>
      <h1 id="home-hero-ask" className="home-hero__ask">
        {t('homeAskLine')}
      </h1>
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
      <PromptSuggestions
        className="home-hero__try"
        label={t('homeTry')}
        items={HOME_SUGGESTIONS.map((key) => t(key))}
        onSelect={(value) => ask(value)}
      />
      <StartBlank {...blank} />
    </section>
  )
}
