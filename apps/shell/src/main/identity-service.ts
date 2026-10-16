/// Who is signed in on this computer. The session (and its token) lives in the
/// main process and is persisted only through the OS keychain (safeStorage);
/// renderers get the person's name, never the token. Kept apart from index.ts
/// so the rules are testable without Electron.
import { randomUUID } from 'node:crypto'
import {
  IDENTITY_CHANNELS,
  consoleProvider,
  devIssuerProvider,
  isLoopbackUrl,
  publicIdentity,
  type DeviceStart,
  type Fetch,
  type IdentityProvider,
  type PublicIdentity,
  type SessionStore,
  type SignInAttempt,
  type SignInResult,
} from '@genoffice/identity'

/** Console is the identity provider; these are its defaults, overridable for staging. */
export const CONSOLE_ISSUER = 'https://console.redrob.ai'
export const CONSOLE_CLIENT_ID = 'redrob-office'
export const SYNC_AUDIENCE = 'redrob-office-sync'
export const DEFAULT_SYNC_URL = 'http://127.0.0.1:8787'

export interface IdentityEnv {
  REDROB_IDENTITY?: string | undefined
  REDROB_IDENTITY_ISSUER?: string | undefined
  REDROB_SYNC_URL?: string | undefined
}

/**
 * Console, unless a development build points at a sync service on this
 * computer and asks for its development issuer. A packaged app never uses
 * the development issuer.
 */
export function chooseProvider(env: IdentityEnv, packaged: boolean, deps: { fetch: Fetch; who: () => { sub: string; name: string } }): IdentityProvider {
  const syncUrl = env.REDROB_SYNC_URL || DEFAULT_SYNC_URL
  if (!packaged && env.REDROB_IDENTITY === 'dev' && isLoopbackUrl(syncUrl)) {
    return devIssuerProvider({ syncUrl, who: deps.who, fetch: deps.fetch })
  }
  const issuer = env.REDROB_IDENTITY_ISSUER && !packaged ? env.REDROB_IDENTITY_ISSUER : CONSOLE_ISSUER
  return consoleProvider({ issuer, clientId: CONSOLE_CLIENT_ID, audience: SYNC_AUDIENCE, fetch: deps.fetch })
}

/** a session this close to expiry is renewed before use */
const RENEW_MS = 5 * 60_000

/**
 * A Redrob Console API key counts as a sign-in. This is the shared account
 * contract (redrob-launcher docs/shared-account.md): Redrob Launcher signs the
 * computer in once and writes account.json; an app that reads it is signed in
 * too, and never asks again. The app's own key (Settings > Redrob, or Connect
 * Redrob) is the other source. Only the account's NAME crosses here; the key
 * itself stays with the AI settings reader.
 */
export interface KeySignIn {
  /** who the key belongs to and where it came from; null when there is no key */
  source: 'own' | 'launcher'
  name: string
}

/**
 * Sign-in through the key path: Console's device connect under this app's
 * product id, which stores the key in the app's own settings. Used when the
 * identity provider (OpenID discovery on Console) is not available.
 */
export interface KeySignInDeps {
  current: () => KeySignIn | null
  start: () => Promise<DeviceStart>
  finish: (start: DeviceStart, isCancelled: () => boolean) => Promise<SignInResult>
}

export interface IdentityServiceDeps {
  provider: IdentityProvider
  store: SessionStore
  /** tells every view who is signed in now */
  broadcast: (identity: PublicIdentity) => void
  openExternal: (url: string) => void
  now?: () => number
  /** the API-key sign-in (shared account file, own key); absent in tests of the token path */
  key?: KeySignInDeps | undefined
}

/** What a renderer sees of a key-based sign-in: a signed-in console identity plus its source. */
export function keyIdentity(k: KeySignIn): PublicIdentity & { source: 'own' | 'launcher' } {
  return { signedIn: true, provider: 'console', name: k.name, source: k.source }
}

export interface IpcLike {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void
}

export class IdentityService {
  private readonly attempts = new Map<string, { start: DeviceStart | null; cancelled: boolean; viaKey: boolean }>()
  private readonly now: () => number
  /** the last key identity broadcast, so a file change that changes nothing stays quiet */
  private lastKey: string | null = null

  constructor(private readonly deps: IdentityServiceDeps) {
    this.now = deps.now ?? Date.now
  }

  /** The key sign-in in force right now, if any (own key wins over the launcher's). */
  private keySignIn(): KeySignIn | null {
    try {
      return this.deps.key?.current() ?? null
    } catch {
      return null
    }
  }

  async status() {
    const s = await this.deps.store.get(this.now())
    if (s) return { ...publicIdentity(s, this.now()), persistent: this.deps.store.persistent() }
    const k = this.keySignIn()
    if (k) return { ...keyIdentity(k), persistent: true }
    return { ...publicIdentity(null, this.now()), persistent: this.deps.store.persistent() }
  }

  /**
   * Re-read the key sources and tell every view when the answer changed. Called
   * on startup and whenever the shared account file or the app's own settings
   * change on disk, so a launcher sign-in (or sign-out) lands while Office runs.
   */
  async refreshKey(): Promise<void> {
    if (await this.deps.store.get(this.now())) return
    const k = this.keySignIn()
    const mark = k ? `${k.source}:${k.name}` : ''
    if (mark === this.lastKey) return
    this.lastKey = mark
    this.deps.broadcast(k ? keyIdentity(k) : { signedIn: false })
  }

  /** The bearer token for the sync service, renewed when close to expiry; null when signed out. */
  async token(): Promise<string | null> {
    let s = await this.deps.store.get(this.now())
    if (!s) return null
    if (s.expiresAt - this.now() < RENEW_MS) {
      const next = await this.deps.provider.refresh(s)
      if (next) {
        await this.deps.store.set(next)
        s = next
      } else if (s.expiresAt <= this.now()) {
        await this.signOut()
        return null
      }
    }
    return s.token
  }

  async start(): Promise<SignInAttempt | { status: 'unavailable' }> {
    // Already signed in through a key (the launcher's shared account or this
    // app's own): there is nothing to start, and no prompt to show.
    const k = this.keySignIn()
    if (k) {
      this.deps.broadcast(keyIdentity(k))
      const id = randomUUID()
      this.attempts.set(id, { start: null, cancelled: false, viaKey: true })
      return { id, userCode: null, verificationUri: null, expiresIn: 0 }
    }
    let start: DeviceStart | null
    let viaKey = false
    try {
      start = await this.deps.provider.start()
    } catch {
      // Console does not serve the OpenID discovery the identity provider
      // needs; the key path (Console's device connect) is the sign-in that works.
      if (!this.deps.key) return { status: 'unavailable' }
      try {
        start = await this.deps.key.start()
        viaKey = true
      } catch {
        return { status: 'unavailable' }
      }
    }
    const id = randomUUID()
    this.attempts.set(id, { start, cancelled: false, viaKey })
    if (start) this.deps.openExternal(start.verificationUriComplete)
    return {
      id,
      userCode: start?.userCode ?? null,
      verificationUri: start?.verificationUri ?? null,
      expiresIn: start?.expiresIn ?? 0,
    }
  }

  async await(id: unknown): Promise<SignInResult> {
    const attempt = typeof id === 'string' ? this.attempts.get(id) : undefined
    if (!attempt) return { status: 'failed', code: 'unknown_attempt' }
    try {
      if (attempt.viaKey) {
        if (!attempt.start) {
          const k = this.keySignIn()
          return k ? { status: 'signed-in', identity: keyIdentity(k) } : { status: 'failed', code: 'key_gone' }
        }
        const result = await this.deps.key!.finish(attempt.start, () => attempt.cancelled)
        if (result.status === 'signed-in') await this.refreshKey()
        return result
      }
      const outcome = await this.deps.provider.finish(attempt.start, () => attempt.cancelled)
      if (outcome.status !== 'signed-in') return outcome
      await this.deps.store.set(outcome.session)
      const identity = publicIdentity(outcome.session, this.now())
      this.deps.broadcast(identity)
      return { status: 'signed-in', identity }
    } finally {
      this.attempts.delete(id as string)
    }
  }

  cancel(id: unknown): void {
    const attempt = typeof id === 'string' ? this.attempts.get(id) : undefined
    if (attempt) attempt.cancelled = true
  }

  /**
   * Clears this app's own token. A key sign-in is not touched here: the
   * launcher's file is read-only for apps, and the app's own key is removed in
   * Settings > Redrob. The broadcast therefore reports what is still in force.
   */
  async signOut(): Promise<void> {
    await this.deps.store.clear()
    const k = this.keySignIn()
    this.lastKey = k ? `${k.source}:${k.name}` : ''
    this.deps.broadcast(k ? keyIdentity(k) : { signedIn: false })
  }

  register(ipc: IpcLike): void {
    ipc.handle(IDENTITY_CHANNELS.status, () => this.status())
    ipc.handle(IDENTITY_CHANNELS.start, () => this.start())
    ipc.handle(IDENTITY_CHANNELS.await, (_e, id) => this.await(id))
    ipc.handle(IDENTITY_CHANNELS.cancel, (_e, id) => this.cancel(id))
    ipc.handle(IDENTITY_CHANNELS.signOut, () => this.signOut())
  }
}
