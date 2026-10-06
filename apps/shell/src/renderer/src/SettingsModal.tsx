import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Dialog, Icon, Input, Select, Switch, applyUiTheme } from '@genoffice/ui'
import type { IconName } from '@genoffice/ui'
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  MAX_MAX_OUTPUT_TOKENS,
  MIN_MAX_OUTPUT_TOKENS,
  clampMaxOutputTokens,
} from '@genoffice/ai-provider'
import type { AiSettings } from '@genoffice/ai-provider'
import { isSelectableLang, languageOptions } from '@genoffice/i18n'
import { useI18n } from './locale'
import type { StringKey, TFunc } from './locale'
import type { AccountStatus, OfficePrefs, UiTheme } from '../../shared/home-api'
import { ProviderLogo } from './provider-logos'
import { CLOUD_ACCOUNT_ENABLED } from './cloud-account-flag'
import { RedrobPane } from './settings/RedrobPane'
import { AiProvidersPane, ModelPicker } from './settings/AiProvidersPane'
import { IdentityPane } from './home/IdentityPane'
import './settings.css'

// ── Settings modal (opened from the account menu) ─────────
// Two-pane dialog: section nav on the left, fields on the right. All values go
// through the existing home IPC; nothing is stored locally.
//
// AI runs on the bundled Redrob engine, which keeps every provider credential. A key
// typed here is handed to the engine and never stored by Office; there is no
// configurable inference server URL.

/** The settings slot editors read their model from. It never holds a key. */
const REDROB_ENGINE_SLOT: AiSettings['provider'] = 'genspark'

// selectable languages first, then the ones listed as "Not yet" (shown, never chosen)
const LANG_OPTIONS = languageOptions()

// GenMail's option order: follow-system first, then the manual picks
const THEME_OPTIONS = [
  { value: 'system', labelKey: 'themeSystem' },
  { value: 'light', labelKey: 'themeLight' },
  { value: 'dark', labelKey: 'themeDark' },
] as const satisfies readonly { value: UiTheme; labelKey: StringKey }[]

const CHANNEL_OPTIONS = [
  { value: 'stable', labelKey: 'channelStable' },
  { value: 'beta', labelKey: 'channelBeta' },
] as const satisfies readonly { value: 'stable' | 'beta'; labelKey: StringKey }[]

/** GitHub-style abbreviated stargazer count (2591 → "2.6k") — the number is
 * social proof, not a metric; the cached/exact value would only look stale */
function formatStars(n: number): string {
  if (n < 1000) return String(n)
  const k = n / 1000
  return `${k >= 100 ? Math.round(k) : (Math.round(k * 10) / 10).toString().replace(/\.0$/, '')}k`
}

type SectionId = 'account' | 'aiModel' | 'identity' | 'general' | 'about'

// The "account" section hosts the ported Genspark sign-in / credits, which
// authenticate against genspark.ai. It is only listed when the cloud-account
// surface is enabled; otherwise Settings opens on the AI Model (Redrob Console)
// pane and the account/credits pane is unreachable.
const ALL_SECTIONS: readonly { id: SectionId; labelKey: StringKey }[] = [
  { id: 'account', labelKey: 'setSecAccount' },
  { id: 'aiModel', labelKey: 'setSecRedrob' },
  { id: 'identity', labelKey: 'setSecSignIn' },
  { id: 'general', labelKey: 'setSecGeneral' },
  { id: 'about', labelKey: 'setSecAbout' },
]
const SECTIONS: readonly { id: SectionId; labelKey: StringKey }[] = CLOUD_ACCOUNT_ENABLED
  ? ALL_SECTIONS
  : ALL_SECTIONS.filter((s) => s.id !== 'account')

const SECTION_ICON: Record<SectionId, IconName> = {
  account: 'user',
  aiModel: 'sparkle',
  identity: 'users',
  general: 'sliders',
  about: 'info',
}

/** label-over-value field row with an optional right-aligned action */
function Field({
  label,
  value,
  valueTitle,
  action,
}: {
  label: string
  value: string
  valueTitle?: string
  action?: ReactNode
}) {
  return (
    <div className="set-field">
      <div className="set-field-text">
        <div className="set-field-label">{label}</div>
        <div className="set-field-value" data-tip={valueTitle}>
          {value}
        </div>
      </div>
      {action}
    </div>
  )
}

/**
 * AI model pane. AI runs on the single Redrob engine (Redrob Console): no
 * provider picker, no vendor BYOK, no configurable inference server URL. The one
 * control is the Redrob Console key (issued at console.redrob.ai), stored on this
 * device. The stored settings keep the same shape the editor apps read; the key
 * lives in the single engine slot.
 */
function AiModelPane({ t }: { t: TFunc }) {
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  /** free-typed value of the output-cap field; committed (and clamped) on blur */
  const [maxTokensDraft, setMaxTokensDraft] = useState<string | null>(null)
  /** what the engine says about the Redrob connection; the key itself is never read back */
  const [connection, setConnection] = useState<{ connected: boolean; label?: string; error?: string } | null>(null)
  const refreshConnection = () => {
    void window.aiOffice.engineIntegrations?.().then((r) => {
      if (!r) return
      if (!r.ok) return setConnection({ connected: false, error: r.error })
      const redrob = r.value.find((i) => i.id === 'redrob')
      const stored = redrob?.connections.find((c) => c.type === 'credential')
      const env = redrob?.connections.find((c) => c.type === 'env')
      setConnection({
        connected: !!redrob?.connected,
        label: stored && stored.type === 'credential' ? stored.label : env && env.type === 'env' ? env.name : 'Redrob',
      })
    })
  }
  useEffect(refreshConnection, [])
  /** live Connect Redrob attempt: the code to approve, and the attempt id to cancel */
  const [attempt, setAttempt] = useState<{ id: string; userCode: string; uri: string } | null>(null)
  /** what to tell the person about the last (or running) connect */
  const [connectNote, setConnectNote] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void window.aiOffice.getAiSettings?.().then((s) => {
      if (!alive || !s) return
      // The engine is fixed to Redrob Console; keep the stored provider pinned to
      // the single engine slot so the key the person types is the one every
      // editor reads.
      setSettings({ ...s, provider: REDROB_ENGINE_SLOT })
    })
    return () => {
      alive = false
    }
  }, [])

  if (!settings) return null
  const config = settings.providers[REDROB_ENGINE_SLOT] ?? { apiKey: '', model: '' }

  const touch = () => {
    setDirty(true)
    setSaved(false)
    setTestResult(null)
  }
  const updateKey = (apiKey: string) => {
    setSettings({
      ...settings,
      provider: REDROB_ENGINE_SLOT,
      providers: {
        ...settings.providers,
        [REDROB_ENGINE_SLOT]: { ...config, apiKey },
      },
    })
    touch()
  }
  /** Commit the output-cap input: clamp what was typed and drop a no-op edit */
  const commitMaxTokens = () => {
    if (maxTokensDraft === null) return
    setMaxTokensDraft(null)
    const next = clampMaxOutputTokens(Number.parseInt(maxTokensDraft, 10))
    if (next === (settings.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS)) return
    setSettings({ ...settings, maxOutputTokens: next })
    touch()
  }
  const save = () => {
    window.aiOffice
      .setAiSettings?.(settings)
      .then(async () => {
        setDirty(false)
        setSaved(true)
        // the key went to the engine; re-read so the field shows what is stored (nothing)
        const stored = await window.aiOffice.getAiSettings?.()
        if (stored) setSettings({ ...stored, provider: REDROB_ENGINE_SLOT })
        refreshConnection()
      })
      .catch((error) => {
        window.alert(error instanceof Error ? error.message : String(error))
      })
  }
  const test = () => {
    setTesting(true)
    setTestResult(null)
    window.aiOffice
      .testAiSettings?.(settings)
      .then((r) => setTestResult(r ?? { ok: false }))
      .catch((error) =>
        setTestResult({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      )
      .finally(() => setTesting(false))
  }

  /**
   * Connect Redrob. The main process holds the device code and writes the key it
   * receives, so this only shows the code to approve and reports how it ended. On
   * success the settings are re-read rather than patched locally, because the file
   * the main process wrote is the truth and an unsaved local edit is not.
   */
  const connect = () => {
    setConnectNote(t('setAiConnectWaiting'))
    setTestResult(null)
    void (async () => {
      let started: { id: string; userCode: string; uri: string } | null = null
      try {
        const opened = await window.aiOffice.startRedrobConnect()
        started = { id: opened.id, userCode: opened.userCode, uri: opened.verificationUriComplete }
        setAttempt(started)
        setConnectNote(t('setAiConnectCode', { code: opened.userCode }))

        const result = await window.aiOffice.awaitRedrobConnect(opened.id)
        if (result.status === 'connected') {
          const stored = await window.aiOffice.getAiSettings?.()
          if (stored) setSettings({ ...stored, provider: REDROB_ENGINE_SLOT })
          setDirty(false)
          setConnectNote(t('setAiConnectDone'))
          refreshConnection()
        } else {
          setConnectNote(t('setAiConnectFailed', { reason: result.status }))
        }
      } catch (error) {
        setConnectNote(
          t('setAiConnectFailed', {
            reason: error instanceof Error ? error.message : String(error),
          }),
        )
      } finally {
        if (started) void window.aiOffice.cancelRedrobConnect(started.id)
        setAttempt(null)
      }
    })()
  }

  return (
    <>
      <h3 className="set-pane-title">{t('setSecAiModel')}</h3>
      <div className="set-field">
        <div className="set-field-text">
          <div className="set-field-stack">
            <div className="set-field-label">
              <span className="set-provider-inline">
                <ProviderLogo id="redrob" />
                Redrob
              </span>
            </div>
            <div className="set-field-desc">{t('setAiRedrobNote')}</div>
          </div>
        </div>
      </div>
      <div className="set-field">
        <div className="set-field-text">
          <div className="set-field-stack">
            <div className="set-field-label">{t('setAiConnect')}</div>
            <div className="set-field-desc">
              {connectNote ?? t('setAiConnectDesc')}
              {attempt ? (
                <>
                  {' '}
                  <a href={attempt.uri} target="_blank" rel="noreferrer">
                    {attempt.uri}
                  </a>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <Button
          className="set-btn"
          variant="secondary"
          size="sm"
          onClick={connect}
          disabled={attempt !== null}
        >
          {t('setAiConnect')}
        </Button>
      </div>
      <div className="set-field">
        <div className="set-field-text">
          <div className="set-field-stack">
            <label className="set-field-label" htmlFor="set-ai-key">
              {t('setAiConsoleKey')}
            </label>
            <div className="set-field-desc">{t('setAiConsoleKeyHint')}</div>
            <div className="set-field-desc" role="status">
              {connection?.error
                ? t('setAiKeyEngineDown', { reason: connection.error })
                : connection?.connected
                  ? t('setAiKeyConnected', { label: connection.label ?? 'Redrob' })
                  : connection
                    ? t('setAiKeyNotConnected')
                    : null}
            </div>
          </div>
        </div>
        <Input
          id="set-ai-key"
          className="set-input"
          size="sm"
          type="password"
          value={config.apiKey}
          placeholder="rk-..."
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => updateKey(e.target.value.trim())}
        />
      </div>
      <div className="set-field">
        <div className="set-field-text">
          <div className="set-field-stack">
            <label className="set-field-label" htmlFor="set-ai-max-tokens">
              {t('setAiMaxTokens')}
            </label>
            <div className="set-field-desc">{t('setAiMaxTokensDesc')}</div>
          </div>
        </div>
        <Input
          id="set-ai-max-tokens"
          className="set-input"
          size="sm"
          type="number"
          min={MIN_MAX_OUTPUT_TOKENS}
          max={MAX_MAX_OUTPUT_TOKENS}
          step={1024}
          value={maxTokensDraft ?? String(settings.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS)}
          onChange={(e) => setMaxTokensDraft(e.target.value)}
          onBlur={commitMaxTokens}
        />
      </div>
      <ModelPicker
        t={t}
        value={config.model}
        onChange={(model) => {
          setSettings({
            ...settings,
            provider: REDROB_ENGINE_SLOT,
            providers: { ...settings.providers, [REDROB_ENGINE_SLOT]: { ...config, model } },
          })
          touch()
        }}
      />
      <div className="set-field">
        <div className="set-field-text">
          <div className="set-field-stack">
            <div className="set-field-label">{t('setAiUsage')}</div>
            <div className="set-field-desc">{t('setAiUsageDesc')}</div>
          </div>
        </div>
        <Button className="set-btn" variant="secondary" size="sm" onClick={() => void window.aiOffice.openConsoleUsage?.()}>
          {t('setViewUsage')}
        </Button>
      </div>
      <AiProvidersPane t={t} />
      <div className="set-pane-footer">
        <AiStatusPill
          status={
            testing
              ? { kind: 'testing', text: t('setAiTesting') }
              : testResult
                ? testResult.ok
                  ? { kind: 'ok', text: t('setAiTestOk') }
                  : { kind: 'err', text: testResult.error || t('setAiTestFail') }
                : saved
                  ? { kind: 'ok', text: t('setAiSaved') }
                  : null
          }
        />
        <Button variant="secondary" size="sm" disabled={testing} onClick={test}>
          {t('setAiTest')}
        </Button>
        <Button variant="primary" size="sm" disabled={!dirty} onClick={save}>
          {t('setAiSave')}
        </Button>
      </div>
    </>
  )
}

interface AiStatus {
  kind: 'testing' | 'ok' | 'err'
  text: string
}

/** colored feedback pill in the AI pane footer: spinner while testing, then success/error */
function AiStatusPill({ status }: { status: AiStatus | null }) {
  if (!status) return null
  return (
    <span
      className={`set-ai-status ${status.kind}`}
      role="status"
      // error text (HTTP body, network message) can be long — full text via native tooltip
      title={status.kind === 'err' ? status.text : undefined}
    >
      {status.kind === 'testing' ? (
        <span className="rr-spinner set-ai-spin" aria-hidden="true" />
      ) : (
        <Icon
          className="set-ai-status-icon"
          name={status.kind === 'ok' ? 'circleCheck' : 'alert'}
          size={14}
        />
      )}
      <span className="set-ai-status-text">{status.text}</span>
    </span>
  )
}

export interface SettingsModalProps {
  status: AccountStatus | null
  loggingOut: boolean
  /** browser sign-in in progress (spinner shows on the account entry) */
  loginWaiting: boolean
  /** device auth URL while waiting — rescue actions when the browser did not auto-open */
  loginUrl: string | null
  urlCopied: boolean
  onOpenLoginUrl: () => void
  onCopyLoginUrl: () => void
  onClose: () => void
  /** closes the modal and launches the Genspark login flow (progress shows on the account entry) */
  onLogin: () => void
  onLogout: () => void
}

export function SettingsModal({
  status,
  loggingOut,
  loginWaiting,
  loginUrl,
  urlCopied,
  onOpenLoginUrl,
  onCopyLoginUrl,
  onClose,
  onLogin,
  onLogout,
}: SettingsModalProps) {
  const { lang, setLang, t } = useI18n()
  const [section, setSection] = useState<SectionId>(SECTIONS[0].id)
  // Toolbar, Plan or Run, Cross-check and Memory: stored by main, followed by every editor
  const [prefs, setPrefs] = useState<OfficePrefs | null>(null)
  useEffect(() => {
    let alive = true
    void window.aiOffice
      .getOfficePrefs?.()
      .then((p) => alive && setPrefs(p))
      .catch(() => {})
    const off = window.aiOffice.onOfficePrefsChanged?.((p) => setPrefs(p))
    return () => {
      alive = false
      off?.()
    }
  }, [])
  const changePrefs = (patch: Partial<OfficePrefs>) => {
    setPrefs((p) => (p ? { ...p, ...patch } : p))
    void window.aiOffice.setOfficePrefs?.(patch).then(setPrefs).catch(() => {})
  }
  const [theme, setTheme] = useState<UiTheme>('system')
  const [saveDir, setSaveDir] = useState('')
  const [analyticsOn, setAnalyticsOn] = useState(true)
  const [analyticsSaving, setAnalyticsSaving] = useState(false)
  const [channel, setChannel] = useState<'stable' | 'beta'>('stable')
  const [appVersion, setAppVersion] = useState('')
  const [githubStars, setGithubStars] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    void window.aiOffice.getTheme?.().then((th) => {
      if (alive) setTheme(th)
    })
    void window.aiOffice.getDefaultSaveDir?.().then((dir) => {
      if (alive && dir) setSaveDir(dir)
    })
    void window.aiOffice.getAnalyticsEnabled?.().then((on) => {
      if (alive) setAnalyticsOn(on !== false)
    })
    void window.aiOffice.getUpdateChannel?.().then((ch) => {
      if (alive) setChannel(ch)
    })
    void window.aiOffice.getAppVersion?.().then((v) => {
      if (alive && v) setAppVersion(v)
    })
    void window.aiOffice.githubStars?.().then((n) => {
      if (alive && n !== null) setGithubStars(n)
    })
    return () => {
      alive = false
    }
  }, [])

  const applyTheme = (next: UiTheme) => {
    setTheme(next)
    void window.aiOffice.setTheme(next)
    applyUiTheme(next)
  }

  const changeSaveDir = () => {
    void window.aiOffice.pickDefaultSaveDir?.().then((dir) => {
      if (dir) setSaveDir(dir)
    })
  }

  const loggedIn = status?.loggedIn ?? false
  const email = status?.email ?? ''

  return (
    <Dialog
      className="set-overlay"
      title={t('settings')}
      closeLabel={t('cancel')}
      onClose={onClose}
      width={880}
    >
      <div className="set-body">
        <nav className="set-nav" aria-label={t('settings')}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`set-nav-item${section === s.id ? ' active' : ''}`}
              aria-current={section === s.id}
              onClick={() => setSection(s.id)}
            >
              <Icon name={SECTION_ICON[s.id]} size={16} />
              {t(s.labelKey)}
            </button>
          ))}
        </nav>
        <div className="set-pane">
          {CLOUD_ACCOUNT_ENABLED && section === 'account' && (
            <>
              <h3 className="set-pane-title">{t('setSecAccount')}</h3>
              <Field label={t('setEmail')} value={loggedIn ? email : t('setNotLoggedIn')} />
              {loggedIn && (
                <Field
                  label={t('credits')}
                  value={
                    status?.creditBalance === undefined
                      ? '—'
                      : Math.floor(status.creditBalance).toLocaleString('en-US')
                  }
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      data-tip={t('creditsTip')}
                      onClick={() => void window.aiOffice.openCreditUsage?.()}
                    >
                      {t('setViewUsage')}
                    </Button>
                  }
                />
              )}
              <div className="set-pane-footer">
                {loggedIn ? (
                  <Button variant="danger" size="sm" disabled={loggingOut} onClick={onLogout}>
                    {loggingOut ? t('loggingOut') : t('logout')}
                  </Button>
                ) : (
                  <>
                    {loginWaiting && loginUrl && (
                      <>
                        <Button variant="secondary" size="sm" onClick={onOpenLoginUrl}>
                          {t('loginOpenManually')}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={onCopyLoginUrl}>
                          {urlCopied ? t('loginCopied') : t('loginCopyUrl')}
                        </Button>
                      </>
                    )}
                    <Button variant="primary" size="sm" onClick={onLogin}>
                      {loginWaiting ? t('waitingShort') : t('loginGenspark')}
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
          {section === 'identity' && <IdentityPane t={t} />}
          {section === 'aiModel' && prefs && (
            <RedrobPane
              t={t}
              prefs={prefs}
              onChange={changePrefs}
              developer={<AiModelPane t={t} />}
            />
          )}
          {section === 'general' && (
            <>
              <h3 className="set-pane-title">{t('setSecGeneral')}</h3>
              <div className="set-field">
                <div className="set-field-text">
                  <label className="set-field-label" htmlFor="set-language">
                    {t('language')}
                  </label>
                </div>
                <Select
                  id="set-language"
                  className="set-select"
                  size="sm"
                  value={lang}
                  options={LANG_OPTIONS.map((opt) => ({
                    value: opt.value,
                    label: opt.selectable ? opt.label : `${opt.label} - ${t('langNotYet')}`,
                    disabled: !opt.selectable,
                  }))}
                  onChange={(_event, option) => {
                    if (option && isSelectableLang(option.value)) setLang(option.value)
                  }}
                />
              </div>
              <div className="set-field">
                <div className="set-field-text">
                  <label className="set-field-label" htmlFor="set-theme">
                    {t('theme')}
                  </label>
                </div>
                <Select
                  id="set-theme"
                  className="set-select"
                  size="sm"
                  value={theme}
                  options={THEME_OPTIONS.map((opt) => ({
                    value: opt.value,
                    label: t(opt.labelKey),
                  }))}
                  onChange={(_event, option) => {
                    if (option) applyTheme(option.value as UiTheme)
                  }}
                />
              </div>
              {prefs && (
                <div className="set-field">
                  <div className="set-field-text">
                    <div className="set-field-stack">
                      <label className="set-field-label" htmlFor="set-toolbar">
                        {t('setToolbar')}
                      </label>
                      <div className="set-field-desc">{t('setToolbarDesc')}</div>
                    </div>
                  </div>
                  <Select
                    id="set-toolbar"
                    className="set-select"
                    size="sm"
                    value={prefs.toolbar}
                    options={[
                      { value: 'simple', label: t('setToolbarSimple') },
                      { value: 'classic', label: t('setToolbarClassic') },
                    ]}
                    onChange={(_event, option) =>
                      option &&
                      changePrefs({ toolbar: option.value === 'classic' ? 'classic' : 'simple' })
                    }
                  />
                </div>
              )}
              <Field
                label={t('saveLocation')}
                value={saveDir || '—'}
                valueTitle={saveDir}
                action={
                  <Button variant="secondary" size="sm" onClick={changeSaveDir}>
                    {t('setChange')}
                  </Button>
                }
              />
              <div className="set-field">
                <div className="set-field-text">
                  <div className="set-field-stack">
                    <div className="set-field-label">{t('setAnalytics')}</div>
                    <div className="set-field-desc">{t('setAnalyticsDesc')}</div>
                  </div>
                </div>
                <Switch
                  className="set-switch"
                  checked={analyticsOn}
                  aria-checked={analyticsOn}
                  aria-label={t('setAnalytics')}
                  disabled={analyticsSaving}
                  onChange={() => {
                    // the switch only flips once the preference is persisted;
                    // until then the controlled input snaps back
                    const next = !analyticsOn
                    setAnalyticsSaving(true)
                    void window.aiOffice
                      .setAnalyticsEnabled(next)
                      .then((persisted) => {
                        if (persisted) setAnalyticsOn(next)
                      })
                      .catch(() => {})
                      .finally(() => setAnalyticsSaving(false))
                  }}
                />
              </div>
            </>
          )}
          {section === 'about' && (
            <>
              <h3 className="set-pane-title">{t('setSecAbout')}</h3>
              <Field label={t('versionLabel')} value={appVersion || '—'} />
              <div className="set-field">
                <div className="set-field-text">
                  <label className="set-field-label" htmlFor="set-channel">
                    {t('updateChannel')}
                  </label>
                </div>
                <Select
                  id="set-channel"
                  className="set-select"
                  size="sm"
                  value={channel}
                  options={CHANNEL_OPTIONS.map((opt) => ({
                    value: opt.value,
                    label: t(opt.labelKey),
                  }))}
                  onChange={(_event, option) => {
                    const next = option?.value === 'beta' ? 'beta' : 'stable'
                    setChannel(next)
                    void window.aiOffice.setUpdateChannel(next)
                  }}
                />
              </div>
              <Field
                label={t('setGithub')}
                value={
                  githubStars === null
                    ? 'github.com/redrob-labs/redrob-office'
                    : `github.com/redrob-labs/redrob-office · ★ ${formatStars(githubStars)}`
                }
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeft={<Icon name="star" size={14} />}
                    onClick={() => void window.aiOffice.openGitHubRepo?.()}
                  >
                    {t('starOnGitHub')}
                  </Button>
                }
              />
            </>
          )}
        </div>
      </div>
    </Dialog>
  )
}
