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

export interface IdentityServiceDeps {
  provider: IdentityProvider
  store: SessionStore
  /** tells every view who is signed in now */
  broadcast: (identity: PublicIdentity) => void
  openExternal: (url: string) => void
  now?: () => number
}

export interface IpcLike {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void
}

export class IdentityService {
  private readonly attempts = new Map<string, { start: DeviceStart | null; cancelled: boolean }>()
  private readonly now: () => number

  constructor(private readonly deps: IdentityServiceDeps) {
    this.now = deps.now ?? Date.now
  }

  async status() {
    const s = await this.deps.store.get(this.now())
    return { ...publicIdentity(s, this.now()), persistent: this.deps.store.persistent() }
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
    let start: DeviceStart | null
    try {
      start = await this.deps.provider.start()
    } catch {
      return { status: 'unavailable' }
    }
    const id = randomUUID()
    this.attempts.set(id, { start, cancelled: false })
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

  async signOut(): Promise<void> {
    await this.deps.store.clear()
    this.deps.broadcast({ signedIn: false })
  }

  register(ipc: IpcLike): void {
    ipc.handle(IDENTITY_CHANNELS.status, () => this.status())
    ipc.handle(IDENTITY_CHANNELS.start, () => this.start())
    ipc.handle(IDENTITY_CHANNELS.await, (_e, id) => this.await(id))
    ipc.handle(IDENTITY_CHANNELS.cancel, (_e, id) => this.cancel(id))
    ipc.handle(IDENTITY_CHANNELS.signOut, () => this.signOut())
  }
}
