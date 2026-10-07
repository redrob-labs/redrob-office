/** Service configuration from the environment; a missing required value fails at start, not later. */

export interface SyncConfig {
  httpPort: number
  collabPort: number
  /** bind address; 127.0.0.1 unless the container needs 0.0.0.0 */
  host: string
  databaseUrl: string
  s3: {
    endpoint: string
    region: string
    bucket: string
    accessKeyId: string
    secretAccessKey: string
    forcePathStyle: boolean
  }
  auth:
    | { kind: 'jwks'; jwksUrl: string; issuer: string; audience: string }
    | { kind: 'dev'; issuer: string; audience: string }
  /** largest file accepted, bytes */
  maxFileBytes: number
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SyncConfig {
  const dev = env.SYNC_DEV_ISSUER === '1'
  if (dev && env.NODE_ENV === 'production') {
    // the development issuer mints tokens for anyone who asks: never in production
    throw new Error('SYNC_DEV_ISSUER=1 is refused when NODE_ENV=production.')
  }
  const audience = env.SYNC_AUDIENCE ?? 'redrob-office-sync'
  return {
    httpPort: port(env, 'SYNC_HTTP_PORT', 8787),
    collabPort: port(env, 'SYNC_COLLAB_PORT', 8788),
    host: env.SYNC_HOST ?? '127.0.0.1',
    databaseUrl: need(env, 'DATABASE_URL'),
    s3: {
      endpoint: need(env, 'S3_ENDPOINT'),
      region: env.S3_REGION ?? 'us-east-1',
      bucket: need(env, 'S3_BUCKET'),
      accessKeyId: need(env, 'S3_ACCESS_KEY_ID'),
      secretAccessKey: need(env, 'S3_SECRET_ACCESS_KEY'),
      forcePathStyle: env.S3_FORCE_PATH_STYLE !== '0',
    },
    auth: dev
      ? { kind: 'dev', issuer: env.SYNC_ISSUER ?? 'http://localhost:8787/dev', audience }
      : { kind: 'jwks', jwksUrl: need(env, 'SYNC_JWKS_URL'), issuer: need(env, 'SYNC_ISSUER'), audience },
    maxFileBytes: Number(env.SYNC_MAX_FILE_BYTES ?? 100 * 1024 * 1024),
  }
}
