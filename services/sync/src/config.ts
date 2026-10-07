/** Service configuration from the environment; a missing required value fails at start, not later. */
import { DEFAULT_LIMITS, type RateLimits } from './limits.ts'

export interface SyncConfig {
  httpPort: number
  collabPort: number
  /** bind address; 127.0.0.1 unless the container needs 0.0.0.0 */
  host: string
  databaseUrl: string
  /** TLS to Postgres: off (local Compose), or verified against a CA file (RDS) */
  databaseTls: { kind: 'off' } | { kind: 'verify'; caFile: string }
  s3: {
    /** unset on AWS: the SDK's regional endpoint */
    endpoint: string | undefined
    region: string
    bucket: string
    /** unset on AWS: the SDK's default chain (the ECS task role) */
    accessKeyId: string | undefined
    secretAccessKey: string | undefined
    forcePathStyle: boolean
  }
  auth:
    | { kind: 'jwks'; jwksUrl: string; issuer: string; audience: string }
    | { kind: 'dev'; issuer: string; audience: string }
  /** largest file accepted, bytes */
  maxFileBytes: number
  /** largest JSON body accepted (everything but file uploads), bytes */
  bodyLimitBytes: number
  limits: RateLimits
  /** activity older than this is deleted */
  eventRetentionDays: number
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
  /** how long a stop waits for requests and live documents to finish */
  shutdownGraceMs: number
  /** behind a load balancer (SYNC_TRUST_PROXY=1): the caller's address comes from X-Forwarded-For */
  trustProxy: boolean
  production: boolean
}

function need(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key]
  if (!v) throw new Error(`Missing ${key}. See services/sync/README.md.`)
  return v
}

function port(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key]
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${key} must be a port number.`)
  return n
}

function count(env: NodeJS.ProcessEnv, key: string, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const raw = env[key]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(`${key} must be a whole number from 1 to ${max}.`)
  return n
}

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const

/** an https URL, as production needs for anything a token's trust rests on */
function httpsUrl(key: string, value: string): string {
  let u: URL
  try {
    u = new URL(value)
  } catch {
    throw new Error(`${key} must be a URL.`)
  }
  if (u.protocol !== 'https:') throw new Error(`${key} must be https in production.`)
  return value
}

/**
 * Any S3 store. Locally (SeaweedFS) an endpoint and a key pair are given; on
 * AWS both are left unset, so the SDK uses its regional endpoint and the task
 * role. A key without its secret, or the reverse, is refused.
 */
function s3Config(env: NodeJS.ProcessEnv): SyncConfig['s3'] {
  const accessKeyId = env.S3_ACCESS_KEY_ID || undefined
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY || undefined
  if (!accessKeyId !== !secretAccessKey) {
    throw new Error('Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither to use the task role.')
  }
  return {
    endpoint: env.S3_ENDPOINT || undefined,
    region: env.S3_REGION ?? 'us-east-1',
    bucket: need(env, 'S3_BUCKET'),
    accessKeyId,
    secretAccessKey,
    forcePathStyle: env.S3_FORCE_PATH_STYLE !== '0',
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SyncConfig {
  const dev = env.SYNC_DEV_ISSUER === '1'
  const production = env.NODE_ENV === 'production'
  if (dev && production) {
    // the development issuer mints tokens for anyone who asks: never in production
    throw new Error('SYNC_DEV_ISSUER=1 is refused when NODE_ENV=production.')
  }
  if (production) {
    // where trust in a token comes from is never a default in production
    httpsUrl('SYNC_JWKS_URL', need(env, 'SYNC_JWKS_URL'))
    httpsUrl('SYNC_ISSUER', need(env, 'SYNC_ISSUER'))
    need(env, 'SYNC_AUDIENCE')
  }
  const audience = env.SYNC_AUDIENCE ?? 'redrob-office-sync'
  // a database reached over a network is reached over verified TLS in production
  const caFile = env.SYNC_DB_CA_FILE || undefined
  if (production && !caFile) throw new Error('Missing SYNC_DB_CA_FILE: production reaches Postgres over verified TLS.')
  const logLevel = (env.SYNC_LOG_LEVEL ?? 'info') as SyncConfig['logLevel']
  if (!LOG_LEVELS.includes(logLevel)) throw new Error(`SYNC_LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}.`)
  return {
    httpPort: port(env, 'SYNC_HTTP_PORT', 8787),
    collabPort: port(env, 'SYNC_COLLAB_PORT', 8788),
    host: env.SYNC_HOST ?? '127.0.0.1',
    databaseUrl: need(env, 'DATABASE_URL'),
    databaseTls: caFile ? { kind: 'verify', caFile } : { kind: 'off' },
    s3: s3Config(env),
    auth: dev
      ? { kind: 'dev', issuer: env.SYNC_ISSUER ?? 'http://localhost:8787/dev', audience }
      : { kind: 'jwks', jwksUrl: need(env, 'SYNC_JWKS_URL'), issuer: need(env, 'SYNC_ISSUER'), audience },
    maxFileBytes: count(env, 'SYNC_MAX_FILE_BYTES', 100 * 1024 * 1024, 2 * 1024 * 1024 * 1024),
    bodyLimitBytes: count(env, 'SYNC_BODY_LIMIT_BYTES', 256 * 1024, 16 * 1024 * 1024),
    limits: {
      perAddressPerMinute: count(env, 'SYNC_RATE_PER_ADDRESS_PER_MINUTE', DEFAULT_LIMITS.perAddressPerMinute),
      perAccountPerMinute: count(env, 'SYNC_RATE_PER_ACCOUNT_PER_MINUTE', DEFAULT_LIMITS.perAccountPerMinute),
      linksPerHour: count(env, 'SYNC_RATE_LINKS_PER_HOUR', DEFAULT_LIMITS.linksPerHour),
    },
    eventRetentionDays: count(env, 'SYNC_EVENT_RETENTION_DAYS', 180, 3650),
    logLevel,
    shutdownGraceMs: count(env, 'SYNC_SHUTDOWN_GRACE_MS', 20_000, 600_000),
    trustProxy: env.SYNC_TRUST_PROXY === '1',
    production,
  }
}
