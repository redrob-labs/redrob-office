/**
 * @vitest-environment jsdom
 *
 * Who is signed in: the service keeps the token in the main process, and
 * Settings shows the person and the device code, never the token.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SessionStore,
  sessionFromToken,
  type IdentityApi,
  type IdentityProvider,
  type SecretCipher,
  type SessionFile,
} from '@genoffice/identity'
import { IdentityService, chooseProvider } from '../src/main/identity-service'
import { LocaleProvider, useI18n } from '../src/renderer/src/locale'
import { IdentityPane } from '../src/renderer/src/home/IdentityPane'

const actEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnv.IS_REACT_ACT_ENVIRONMENT = true

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const TOKEN = `${b64({ alg: 'ES256' })}.${b64({ sub: 'felix', name: 'Felix Kim', exp: 2_000_000_000 })}.sig`

const file = (): SessionFile => {
  let d: Uint8Array | null = null
  return { read: async () => d, write: async (x) => void (d = x), remove: async () => void (d = null) }
}
const cipher: SecretCipher = { available: () => true, encrypt: (s) => new TextEncoder().encode(s), decrypt: (d) => new TextDecoder().decode(d) }

function provider(over: Partial<IdentityProvider> = {}): IdentityProvider {
  return {
    kind: 'console',
    start: async () => ({ deviceCode: 'secret-device-code', userCode: 'ABCD-EFGH', verificationUri: 'https://console.example/activate', verificationUriComplete: 'https://console.example/activate?c=ABCD', expiresIn: 600, interval: 1 }),
    finish: async () => ({ status: 'signed-in', session: sessionFromToken('console', TOKEN)! }),
    refresh: async () => null,
    ...over,
  }
}

describe('chooseProvider', () => {
  const deps = { fetch: vi.fn(), who: () => ({ sub: 's', name: 'S' }) }
  it('uses Console, and the development issuer only for a local stack in a development build', () => {
    expect(chooseProvider({}, true, deps).kind).toBe('console')
    expect(chooseProvider({ REDROB_IDENTITY: 'dev' }, false, deps).kind).toBe('dev')
    expect(chooseProvider({ REDROB_IDENTITY: 'dev' }, true, deps).kind).toBe('console')
    expect(chooseProvider({ REDROB_IDENTITY: 'dev', REDROB_SYNC_URL: 'https://sync.example' }, false, deps).kind).toBe('console')
  })
})

describe('IdentityService', () => {
  it('signs in, tells every view, and never returns the token to a renderer', async () => {
    const broadcast = vi.fn()
    const openExternal = vi.fn()
    const svc = new IdentityService({ provider: provider(), store: new SessionStore(cipher, file()), broadcast, openExternal, now: () => 1_000 })
    const attempt = await svc.start()
    expect(attempt).toMatchObject({ userCode: 'ABCD-EFGH' })
    expect(JSON.stringify(attempt)).not.toContain('secret-device-code')
    expect(openExternal).toHaveBeenCalledWith('https://console.example/activate?c=ABCD')
    const result = await svc.await((attempt as { id: string }).id)
    expect(result).toEqual({ status: 'signed-in', identity: { signedIn: true, provider: 'console', name: 'Felix Kim' } })
    expect(JSON.stringify(result)).not.toContain(TOKEN)
    expect(broadcast).toHaveBeenCalledWith({ signedIn: true, provider: 'console', name: 'Felix Kim' })
    expect(await svc.token()).toBe(TOKEN)
    expect(JSON.stringify(await svc.status())).not.toContain(TOKEN)
    await svc.signOut()
    expect(await svc.token()).toBeNull()
    expect(broadcast).toHaveBeenLastCalledWith({ signedIn: false })
  })

  it('renews a token close to expiry and signs out when it cannot', async () => {
    const soon = sessionFromToken('console', TOKEN)!
    const store = new SessionStore(cipher, file())
    await store.set({ ...soon, expiresAt: 1_000 + 60_000, refreshToken: 'r' })
    const fresh = { ...soon, token: 'fresh', expiresAt: 10_000_000 }
    const svc = new IdentityService({ provider: provider({ refresh: async () => fresh }), store, broadcast: vi.fn(), openExternal: vi.fn(), now: () => 1_000 })
    expect(await svc.token()).toBe('fresh')

    const expired = new SessionStore(cipher, file())
    await expired.set({ ...soon, expiresAt: 500 })
    const svc2 = new IdentityService({ provider: provider(), store: expired, broadcast: vi.fn(), openExternal: vi.fn(), now: () => 1_000 })
    expect(await svc2.token()).toBeNull()
  })

  it('says sign-in is unavailable when Console cannot start one', async () => {
    const svc = new IdentityService({
      provider: provider({ start: async () => Promise.reject(new Error('discovery_404')) }),
      store: new SessionStore(cipher, file()),
      broadcast: vi.fn(),
      openExternal: vi.fn(),
    })
    expect(await svc.start()).toEqual({ status: 'unavailable' })
    expect(await svc.await('nope')).toEqual({ status: 'failed', code: 'unknown_attempt' })
  })
})

describe('IdentityPane', () => {
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('shows the code while waiting, then who is signed in', async () => {
    let resolveAwait: (v: Awaited<ReturnType<IdentityApi['awaitSignIn']>>) => void = () => {}
    let signedIn = false
    const api: IdentityApi = {
      identityStatus: vi.fn(async () => (signedIn ? { signedIn: true, provider: 'console' as const, name: 'Felix Kim', persistent: true } : { signedIn: false, persistent: true })),
      startSignIn: vi.fn(async () => ({ id: 'a1', userCode: 'ABCD-EFGH', verificationUri: 'https://console.example/activate', expiresIn: 600 })),
      awaitSignIn: vi.fn(() => new Promise((r) => (resolveAwait = r))),
      cancelSignIn: vi.fn(async () => {}),
      signOut: vi.fn(async () => {}),
      onIdentityChanged: () => () => {},
    }
    await act(async () =>
      root.render(
        createElement(LocaleProvider, { initial: 'en' }, createElement(Wrapper, { api })),
      ),
    )
    const btn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Sign in with Redrob')!
    await act(async () => btn.click())
    expect(host.textContent).toContain('ABCD-EFGH')
    signedIn = true
    await act(async () => resolveAwait({ status: 'signed-in', identity: { signedIn: true, name: 'Felix Kim' } }))
    expect(host.textContent).toContain('Signed in as Felix Kim')
  })
})

function Wrapper({ api }: { api: IdentityApi }) {
  const { t } = useI18n()
  return createElement(IdentityPane, { t, api })
}
