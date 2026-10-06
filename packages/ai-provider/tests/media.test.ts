/** Media analysis and transcription as engine chat turns with the media attached. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { EngineModel } from '../src/engine-client'
import { setEngineTargetProvider } from '../src/engine-turn'
import { hasDegradedSteering } from '../src/redrob-engine'
import { MediaUnavailableError, analyzeMedia, loadMedia, pickMediaModel, transcribe } from '../src/media'
import { startFakeEngine, type FakeEngine } from './fake-engine'

let engine: FakeEngine
beforeEach(async () => {
  engine = await startFakeEngine()
  setEngineTargetProvider(async () => ({ baseUrl: engine.baseUrl, username: engine.username, password: engine.password }))
})
afterEach(async () => {
  setEngineTargetProvider(null)
  await engine.close()
})

const png = 'data:image/png;base64,iVBORw0KGgo='
const model = (id: string, input: string[]): EngineModel => ({
  id,
  providerID: id.split('/')[0]!,
  modelID: id.split('/')[1]!,
  name: id,
  tools: true,
  input,
  output: ['text'],
  contextTokens: null,
  outputTokens: null,
  enabled: true,
})

describe('loadMedia', () => {
  it('accepts data and https URLs only', async () => {
    expect((await loadMedia(png)).kind).toBe('image')
    await expect(loadMedia('file:///etc/passwd')).rejects.toBeInstanceOf(MediaUnavailableError)
    await expect(loadMedia('C:\\Users\\x\\secret.png')).rejects.toBeInstanceOf(MediaUnavailableError)
    await expect(loadMedia('http://example.test/a.png')).rejects.toBeInstanceOf(MediaUnavailableError)
  })

  it('downloads https media and types it', async () => {
    const fetchImpl = async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } })
    const m = await loadMedia('https://example.test/clip', fetchImpl)
    expect(m).toEqual({ base64: 'AQID', mime: 'audio/mpeg', kind: 'audio' })
  })

  it('refuses video', async () => {
    await expect(loadMedia('data:video/mp4;base64,AAAA')).rejects.toThrow(/cannot be read/)
  })
})

describe('pickMediaModel', () => {
  const models = [model('redrob/auto', ['text']), model('redrob/claude-sonnet-5', ['text', 'image'])]
  it('keeps the preferred model when it reads the media, else picks one that does', () => {
    expect(pickMediaModel(models, new Set(['image']), 'redrob/claude-sonnet-5')).toBe('redrob/claude-sonnet-5')
    expect(pickMediaModel(models, new Set(['image']), 'redrob/auto')).toBe('redrob/claude-sonnet-5')
    expect(pickMediaModel(models, new Set(['audio']), 'redrob/auto')).toBeNull()
  })
})

describe('analyzeMedia / transcribe', () => {
  it('runs one engine turn on a model that reads images, with the image attached', async () => {
    let sent: Record<string, unknown> = {}
    engine.onPrompt(async (ctx) => {
      sent = ctx.body
      ctx.text('A red square.')
      return { info: { finish: 'stop' }, parts: [] }
    })
    const text = await analyzeMedia({ mediaUrls: [png], requirements: 'What is it?' })
    expect(text).toBe('A red square.')
    expect(sent.model).toEqual({ providerID: 'redrob', modelID: 'claude-sonnet-5' })
    expect((sent.parts as { type: string; mime?: string }[]).some((p) => p.type === 'file' && p.mime === 'image/png')).toBe(true)
  })

  it('says plainly when no model reads audio, without sending anything', async () => {
    const err = (await transcribe({ audioUrl: 'data:audio/wav;base64,UklGRg==' }).catch((e: unknown) => e)) as Error
    expect(err).toBeInstanceOf(MediaUnavailableError)
    expect(err.message).toMatch(/No model available to Redrob can read audio/)
    expect(hasDegradedSteering(err.message)).toBe(false)
    expect(engine.requests.some((r) => r.path.includes('/message'))).toBe(false)
  })
})
