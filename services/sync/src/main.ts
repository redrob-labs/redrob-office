import { devIssuer, jwksVerifier, type DevIssuer, type Verifier } from './auth.ts'
import { S3Blobs } from './blobs.ts'
import { buildCollab } from './collab.ts'
import { hocuspocusDocs } from './comments.ts'
import { loadConfig } from './config.ts'
import { buildApp } from './http.ts'
import { PgRepo } from './pg-repo.ts'

const cfg = loadConfig()
const repo = await PgRepo.connect(cfg.databaseUrl)
const blobs = new S3Blobs(cfg.s3)
await blobs.ensureBucket()

let verifier: Verifier
let dev: DevIssuer | undefined
if (cfg.auth.kind === 'dev') {
  dev = await devIssuer({ issuer: cfg.auth.issuer, audience: cfg.auth.audience })
  verifier = dev
  console.warn('sync: development issuer is on. Tokens are minted for anyone; never expose this port.')
} else {
  verifier = jwksVerifier(cfg.auth)
}

const collab = buildCollab({ repo, verifier }, { port: cfg.collabPort, host: cfg.host })
const app = buildApp({
  repo,
  blobs,
  verifier,
  devIssuer: dev,
  maxFileBytes: cfg.maxFileBytes,
  liveDocs: hocuspocusDocs(collab.hocuspocus),
  closeLive: (fileId) => collab.hocuspocus.closeConnections(fileId),
  log: (m) => console.warn(m),
})
await app.listen({ port: cfg.httpPort, host: cfg.host })
await collab.listen()
console.log(`sync: http ${cfg.host}:${cfg.httpPort}, live documents ws ${cfg.host}:${cfg.collabPort}`)

const stop = async () => {
  await collab.destroy()
  await app.close()
  await repo.close()
  process.exit(0)
}
process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())
