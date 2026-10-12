import type { PublicIdentity } from './session'

/** Identity over IPC: the shell owns the session; renderers learn who, never the token. */
export const IDENTITY_CHANNELS = {
  status: 'identity:status',
  start: 'identity:start',
  await: 'identity:await',
  cancel: 'identity:cancel',
  signOut: 'identity:sign-out',
  changed: 'identity:changed',
} as const

/** What a renderer may see of a sign-in in progress. */
export interface SignInAttempt {
  id: string
  /** null when no browser step is needed (the development issuer) */
  userCode: string | null
  verificationUri: string | null
  expiresIn: number
}

export type SignInResult =
  | { status: 'signed-in'; identity: PublicIdentity }
  | { status: 'denied' | 'expired' | 'cancelled' | 'unreachable' | 'unavailable' }
  | { status: 'failed'; code: string }

export interface IdentityApi {
  identityStatus(): Promise<PublicIdentity & { persistent: boolean; provider?: 'console' | 'dev' }>
  startSignIn(): Promise<SignInAttempt | { status: 'unavailable' }>
  awaitSignIn(id: string): Promise<SignInResult>
  cancelSignIn(id: string): Promise<void>
  signOut(): Promise<void>
  onIdentityChanged(handler: (identity: PublicIdentity) => void): () => void
}
