import { useEffect, useState } from 'react'
import { Button, Input, Select } from '@genoffice/ui'
import { DEFAULT_ENGINE_MODEL } from '@genoffice/ai-provider'
import type { TFunc } from '../locale'
import type { EngineModelView, EngineProviderView } from '../../../shared/home-api'

/**
 * Model choice. The list is what the engine can run right now; the stored value is a
 * `provider/model` id and an empty value means the Redrob default (`redrob/auto`).
 */
export function ModelPicker({ t, value, onChange }: { t: TFunc; value: string; onChange: (model: string) => void }) {
  const [models, setModels] = useState<EngineModelView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void window.aiOffice.engineModels?.().then((r) => {
      if (!alive || !r) return
      if (r.ok) setModels(r.value)
      else setError(r.error)
    })
    return () => {
      alive = false
    }
  }, [])
  const current = value && value !== 'auto' ? (value.includes('/') ? value : `redrob/${value}`) : DEFAULT_ENGINE_MODEL
  const options = (models ?? []).map((m) => ({
    value: m.id,
    label: m.input.includes('image') ? `${m.name} · ${t('setAiModelImages')}` : m.name,
  }))
  // a stored model the engine no longer lists stays visible rather than silently changing
  if (models && !options.some((o) => o.value === current)) options.unshift({ value: current, label: `${current} · ${t('setAiModelMissing')}` })
  return (
    <div className="set-field">
      <div className="set-field-text">
        <div className="set-field-stack">
          <label className="set-field-label" htmlFor="set-ai-model">
            {t('setAiModelId')}
          </label>
          <div className="set-field-desc">{error ? t('setAiKeyEngineDown', { reason: error }) : t('setAiModelDesc')}</div>
        </div>
      </div>
      <Select
        id="set-ai-model"
        className="set-select"
        size="sm"
        value={current}
        disabled={!models}
        options={options}
        onChange={(_event, option) => {
          if (option) onChange(option.value === DEFAULT_ENGINE_MODEL ? '' : String(option.value))
        }}
      />
    </div>
  )
}

/**
 * Providers the engine can authenticate. Keys and OAuth tokens go to the engine's
 * credential store; this pane only ever learns whether a provider is connected.
 */
export function AiProvidersPane({ t }: { t: TFunc }) {
  const [providers, setProviders] = useState<EngineProviderView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [note, setNote] = useState<Record<string, string>>({})
  const [codes, setCodes] = useState<Record<string, { method: number; code: string } | undefined>>({})

  const refresh = () => {
    void window.aiOffice.engineProviders?.().then((r) => {
      if (!r) return
      if (r.ok) {
        setError(null)
        // Redrob is connected above (Connect Redrob / Console key)
        setProviders(r.value.filter((p) => p.id !== 'redrob'))
      } else setError(r.error)
    })
  }
  useEffect(refresh, [])

  const say = (id: string, text: string) => setNote((n) => ({ ...n, [id]: text }))

  const connectKey = async (p: EngineProviderView) => {
    const key = keys[p.id]?.trim()
    if (!key) return
    setBusy(p.id)
    const r = await window.aiOffice.engineProviderKey(p.id, key)
    setBusy(null)
    setKeys((k) => ({ ...k, [p.id]: '' }))
    say(p.id, r.ok ? t('setAiProviderConnected') : t('setAiProviderFailed', { reason: r.error }))
    refresh()
  }

  const connectOAuth = async (p: EngineProviderView, method: Extract<EngineProviderView['methods'][number], { type: 'oauth' }>) => {
    // prompts with one choice (or a select) take their first option; free-text prompts are not supported here yet
    const inputs: Record<string, string> = {}
    for (const prompt of method.prompts) {
      if (prompt.type === 'select' && prompt.options?.[0]) inputs[prompt.key] = prompt.options[0].value
    }
    setBusy(p.id)
    const started = await window.aiOffice.engineOAuthStart(p.id, method.index, inputs)
    if (!started.ok) {
      setBusy(null)
      return say(p.id, t('setAiProviderFailed', { reason: started.error }))
    }
    say(p.id, started.value.instructions || t('setAiProviderBrowser'))
    if (started.value.mode === 'code') {
      setBusy(null)
      setCodes((c) => ({ ...c, [p.id]: { method: method.index, code: '' } }))
      return
    }
    const done = await window.aiOffice.engineOAuthFinish(p.id, method.index)
    setBusy(null)
    say(p.id, done.ok && done.value ? t('setAiProviderConnected') : t('setAiProviderFailed', { reason: done.ok ? '' : done.error }))
    refresh()
  }

  const finishCode = async (p: EngineProviderView) => {
    const pending = codes[p.id]
    if (!pending?.code.trim()) return
    setBusy(p.id)
    const done = await window.aiOffice.engineOAuthFinish(p.id, pending.method, pending.code)
    setBusy(null)
    setCodes((c) => ({ ...c, [p.id]: undefined }))
    say(p.id, done.ok && done.value ? t('setAiProviderConnected') : t('setAiProviderFailed', { reason: done.ok ? '' : done.error }))
    refresh()
  }

  const disconnect = async (p: EngineProviderView) => {
    setBusy(p.id)
    const r = await window.aiOffice.engineProviderRemove(p.id)
    setBusy(null)
    say(p.id, r.ok ? t('setAiProviderRemoved') : t('setAiProviderFailed', { reason: r.error }))
    refresh()
  }

  return (
    <section aria-labelledby="set-ai-providers-title">
      <h4 className="set-pane-subtitle" id="set-ai-providers-title">
        {t('setAiProvider')}
      </h4>
      <div className="set-field-desc">{error ? t('setAiKeyEngineDown', { reason: error }) : t('setAiProvidersDesc')}</div>
      {providers?.map((p) => {
        const api = p.methods.find((m) => m.type === 'api')
        const oauth = p.methods.filter((m): m is Extract<typeof m, { type: 'oauth' }> => m.type === 'oauth')
        const pendingCode = codes[p.id]
        return (
          <div className="set-field" key={p.id}>
            <div className="set-field-text">
              <div className="set-field-stack">
                <div className="set-field-label">
                  {p.name} <span className="set-field-desc">{p.connected ? t('setAiProviderOn') : t('setAiProviderOff')}</span>
                </div>
                <div className="set-field-desc" role="status">
                  {note[p.id] ?? ''}
                </div>
              </div>
            </div>
            {p.connected ? (
              p.viaEnv ? (
                <span className="set-field-desc">{t('setAiProviderEnv')}</span>
              ) : (
                <Button variant="secondary" size="sm" disabled={busy === p.id} onClick={() => void disconnect(p)}>
                  {t('setAiProviderDisconnect')}
                </Button>
              )
            ) : pendingCode ? (
              <>
                <Input
                  className="set-input"
                  size="sm"
                  aria-label={t('setAiProviderCode', { name: p.name })}
                  value={pendingCode.code}
                  onChange={(e) => setCodes((c) => ({ ...c, [p.id]: { ...pendingCode, code: e.target.value } }))}
                />
                <Button variant="primary" size="sm" disabled={busy === p.id} onClick={() => void finishCode(p)}>
                  {t('setAiProviderFinish')}
                </Button>
              </>
            ) : (
              <>
                {api && (
                  <>
                    <Input
                      className="set-input"
                      size="sm"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      aria-label={t('setAiProviderKey', { name: p.name })}
                      placeholder={api.label || t('setAiProviderKey', { name: p.name })}
                      value={keys[p.id] ?? ''}
                      onChange={(e) => setKeys((k) => ({ ...k, [p.id]: e.target.value }))}
                    />
                    <Button variant="secondary" size="sm" disabled={busy === p.id || !keys[p.id]?.trim()} onClick={() => void connectKey(p)}>
                      {t('setAiProviderConnect')}
                    </Button>
                  </>
                )}
                {oauth.map((m) => (
                  <Button key={m.index} variant="secondary" size="sm" disabled={busy === p.id} onClick={() => void connectOAuth(p, m)}>
                    {m.label || t('setAiProviderConnect')}
                  </Button>
                ))}
              </>
            )}
          </div>
        )
      })}
    </section>
  )
}
