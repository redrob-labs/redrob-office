/**
 * Identity. In production the service trusts tokens Redrob Console signs,
 * checked against Console's JWKS. For local runs and CI a development issuer
 * makes its own key pair at start and signs tokens for whoever asks; it is
 * refused in production (see config.ts).
 */
import { SignJWT, createLocalJWKSet, createRemoteJWKSet, exportJWK, generateKeyPair, jwtVerify, type JWK } from 'jose'

export interface Identity {
  /** stable account id (the token's sub) */
  sub: string
  name: string
  email?: string
}

export interface Verifier {
  verify(token: string): Promise<Identity>
}

export class AuthError extends Error {}

function identityFrom(payload: Record<string, unknown>): Identity {
  const sub = payload.sub
  if (typeof sub !== 'string' || !sub) throw new AuthError('The token names no account.')
  const name = typeof payload.name === 'string' && payload.name ? payload.name : sub
  return typeof payload.email === 'string' ? { sub, name, email: payload.email } : { sub, name }
}

export function jwksVerifier(opts: { jwksUrl: string; issuer: string; audience: string }): Verifier {
  const keys = createRemoteJWKSet(new URL(opts.jwksUrl))
  return {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, keys, { issuer: opts.issuer, audience: opts.audience })
        return identityFrom(payload)
      } catch (err) {
        if (err instanceof AuthError) throw err
        throw new AuthError('The token is not valid.')
      }
    },
  }
}

export interface DevIssuer extends Verifier {
  jwks: { keys: JWK[] }
  /** signs a token for a development account; lives an hour */
  sign(identity: Identity): Promise<string>
}

export async function devIssuer(opts: { issuer: string; audience: string }): Promise<DevIssuer> {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
  const jwk = { ...(await exportJWK(publicKey)), kid: 'dev-1', alg: 'ES256', use: 'sig' }
  const jwks = { keys: [jwk] }
  const local = createLocalJWKSet(jwks)
  return {
    jwks,
    async sign(identity) {
      return new SignJWT({ name: identity.name, ...(identity.email ? { email: identity.email } : {}) })
        .setProtectedHeader({ alg: 'ES256', kid: 'dev-1' })
        .setSubject(identity.sub)
        .setIssuer(opts.issuer)
        .setAudience(opts.audience)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privateKey)
    },
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, local, { issuer: opts.issuer, audience: opts.audience })
        return identityFrom(payload)
      } catch (err) {
        if (err instanceof AuthError) throw err
        throw new AuthError('The token is not valid.')
      }
    },
  }
}

/** The token from `Authorization: Bearer <token>`, or null. */
export function bearer(header: string | undefined | null): string | null {
  if (!header) return null
  const m = /^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/.exec(header.trim())
  return m ? m[1]! : null
}
