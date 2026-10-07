import { readFileSync } from 'node:fs'
import { devIssuer, jwksVerifier, type DevIssuer, type Verifier } from './auth.ts'
import { S3Blobs } from './blobs.ts'
import { buildCollab } from './collab.ts'
import { hocuspocusDocs } from './comments.ts'
import { loadConfig } from './config.ts'
import { buildApp, loggerOptions } from './http.ts'
import { PgRepo } from './pg-repo.ts'

const cfg = loadConfig()
const repo = await PgRepo.connect(cfg.databaseUrl, {
  ca: cfg.databaseTls.kind === 'verify' ? readFileSync(cfg.databaseTls.caFile, 'utf8') : undefined,
})
const blobs = new S3Blobs(cfg.s3)
await blobs.ensureBucket()

let verifier: Verifier
let dev: DevIssuer | undefined
if (cfg.auth.kind === 'dev') {
  dev = await devIssuer({ issuer: cfg.auth.issuer, audience: cfg.auth.audience })
  verifier = dev
} else {
  verifier = jwksVerifier(cfg.auth)
}

let draining = false
const collab = buildCollab({ repo, verifier }, { port: cfg.collabPort, host: cfg.host })
const app = buildApp({
  repo,
  blobs,
  verifier,
  devIssuer: dev,
  maxFileBytes: cfg.maxFileBytes,
  bodyLimitBytes: cfg.bodyLimitBytes,
  limits: cfg.limits,
  logger: loggerOptions(cfg.logLevel),
  trustProxy: cfg.trustProxy,
  draining: () => draining,
  liveDocs: hocuspocusDocs(collab.hocuspocus),
  closeLive: (fileId) => collab.hocuspocus.closeConnections(fileId),
})
const log = app.log
if (dev) log.warn('development issuer is on: tokens are minted for anyone; never expose this port')

await app.listen({ port: cfg.httpPort, host: cfg.host })
await collab.listen()
log.info({ http: `${cfg.host}:${cfg.httpPort}`, live: `${cfg.host}:${cfg.collabPort}`, production: cfg.production }, 'sync started')

// Activity is kept for SYNC_EVENT_RETENTION_DAYS, then pruned, once at start and hourly.
const prune = async () => {
  try {
    const before = new Date(Date.now() - cfg.eventRetentionDays * 86_400_000)
    const gone = await repo.pruneEvents(before)
    if (gone > 0) log.info({ gone, before: before.toISOString() }, 'pruned old activity')
  } catch (err) {
    log.warn({ err }, 'activity pruning failed; it runs again in an hour')
  }
}
void prune()
const pruneTimer = setInterval(() => void prune(), 3_600_000)
pruneTimer.unref()

// Stopping: readiness fails first so the load balancer stops sending work,
// then requests in flight and live documents finish (and store), then the
// database closes. A stop that takes longer than the grace period exits anyway.
let stopping = false
const stop = async (signal: string) => {
  if (stopping) return
  stopping = true
  draining = true
  clearInterval(pruneTimer)
  log.info({ signal, graceMs: cfg.shutdownGraceMs }, 'stopping')
  const force = setTimeout(() => {
    log.error('stop took longer than the grace period; exiting')
    process.exit(1)
  }, cfg.shutdownGraceMs)
  force.unref()
  try {
    // give the balancer a moment to see /ready fail before connections close
    await new Promise((r) => setTimeout(r, Math.min(5000, Math.floor(cfg.shutdownGraceMs / 4))))
    await collab.destroy()
    await app.close()
    await repo.close()
    log.info('stopped')
    process.exit(0)
  } catch (err) {
    log.error({ err }, 'stop failed')
    process.exit(1)
  }
}
process.on('SIGINT', () => void stop('SIGINT'))
process.on('SIGTERM', () => void stop('SIGTERM'))
