import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { Accordion, Alert, Badge, Select, Switch } from '@genoffice/ui'
import type { CrossCheckLevel, OfficePrefs } from '@genoffice/electron-utils/office-prefs'
import type { StringKey, TFunc } from '../locale'

/** a setting row: what it is, what it does, then its control */
function Row({
  id,
  title,
  desc,
  control,
  htmlFor,
}: {
  id: string
  title: string
  desc: string
  control: ReactNode
  /** the control's id, when the title should label it */
  htmlFor?: string
}): ReactElement {
  return (
    <div className="set-field set-row">
      <div className="set-field-text">
        <div className="set-field-stack">
          {htmlFor ? (
            <label className="set-field-label" id={`${id}-label`} htmlFor={htmlFor}>
              {title}
            </label>
          ) : (
            <div className="set-field-label" id={`${id}-label`}>
              {title}
            </div>
          )}
          <div className="set-field-desc" id={`${id}-desc`}>
            {desc}
          </div>
        </div>
      </div>
      {control}
    </div>
  )
}

const LEVELS: readonly { value: CrossCheckLevel; labelKey: StringKey }[] = [
  { value: 'off', labelKey: 'setLevelOff' },
  { value: 'auto', labelKey: 'setLevelAuto' },
  { value: 'always', labelKey: 'setLevelAlways' },
]

export interface RedrobPaneProps {
  t: TFunc
  prefs: OfficePrefs
  onChange: (patch: Partial<OfficePrefs>) => void
  /** the Console key form and Connect Redrob, behind "For developers" */
  developer: ReactNode
}

/**
 * Settings, Redrob AI (handoff 09-settings): whether Redrob is connected,
 * the model for new files, privacy protection (read-only: an admin sets it),
 * Memory, Fact check, Challenge and Plan or Run. The Console key form sits
 * under For developers.
 */
export function RedrobPane({ t, prefs, onChange, developer }: RedrobPaneProps): ReactElement {
  const [connected, setConnected] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    void window.aiOffice
      .getAiSettings?.()
      .then((s) => {
        if (!alive) return
        const keys = Object.values(s?.providers ?? {}).map((p) => p?.apiKey ?? '')
        setConnected(s?.engineConnected === true || keys.some((k) => k.trim().length > 0))
      })
      .catch(() => alive && setConnected(false))
    return () => {
      alive = false
    }
  }, [])

  const levelOptions = LEVELS.map((l) => ({ value: l.value, label: t(l.labelKey) }))

  return (
    <>
      <h3 className="set-pane-title">{t('setSecRedrob')}</h3>
      {connected !== null && (
        <Alert
          className="set-connected"
          tone={connected ? 'success' : 'info'}
          title={connected ? t('setRedrobConnected') : t('setRedrobNotConnected')}
        >
          {connected ? t('setRedrobConnectedBody') : t('setRedrobNotConnectedBody')}
        </Alert>
      )}

      <Row
        id="set-model"
        htmlFor="set-model-select"
        title={t('setModelTitle')}
        desc={t('setModelDesc')}
        control={
          <Select
            id="set-model-select"
            className="set-select"
            size="sm"
            value="auto"
            options={[{ value: 'auto', label: 'Redrob Auto' }]}
          />
        }
      />

      <Row
        id="set-privacy"
        title={t('setPrivacyTitle')}
        desc={t('setPrivacyDesc')}
        control={
          // read-only: the level is set by an admin, and this computer does not run
          // the on-device check yet, so it says so rather than claim protection
          <Badge tone="neutral" dot>
            {t('setPrivacyNotHere')}
          </Badge>
        }
      />

      <Row
        id="set-memory"
        title={t('setMemoryTitle')}
        desc={t('setMemoryDesc')}
        control={
          <Switch
            className="set-switch"
            checked={prefs.memory}
            aria-label={t('setMemoryTitle')}
            onChange={() => onChange({ memory: !prefs.memory })}
          />
        }
      />

      <Row
        id="set-factcheck"
        htmlFor="set-factcheck-select"
        title={t('setFactCheckTitle')}
        desc={t('setFactCheckDesc')}
        control={
          <Select
            id="set-factcheck-select"
            className="set-select"
            size="sm"
            value={prefs.factCheck}
            options={levelOptions}
            onChange={(_e, o) => o && onChange({ factCheck: o.value as CrossCheckLevel })}
          />
        }
      />

      <Row
        id="set-challenge"
        htmlFor="set-challenge-select"
        title={t('setChallengeTitle')}
        desc={t('setChallengeDesc')}
        control={
          <Select
            id="set-challenge-select"
            className="set-select"
            size="sm"
            value={prefs.challenge}
            options={levelOptions}
            onChange={(_e, o) => o && onChange({ challenge: o.value as CrossCheckLevel })}
          />
        }
      />

      <Row
        id="set-planrun"
        htmlFor="set-planrun-select"
        title={t('setPlanRunTitle')}
        desc={t('setPlanRunDesc')}
        control={
          <Select
            id="set-planrun-select"
            className="set-select"
            size="sm"
            value={prefs.composerMode}
            options={[
              { value: 'plan', label: t('setPlan') },
              { value: 'run', label: t('setRun') },
            ]}
            onChange={(_e, o) => o && onChange({ composerMode: o.value === 'plan' ? 'plan' : 'run' })}
          />
        }
      />

      <Accordion
        key={String(connected)}
        className="set-dev"
        defaultOpen={connected === false ? 'dev' : undefined}
        items={[{ id: 'dev', title: t('setForDevelopers'), content: developer }]}
      />
    </>
  )
}
