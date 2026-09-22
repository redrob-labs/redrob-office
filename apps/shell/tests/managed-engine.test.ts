/**
 * Tests for the managed engine.
 *
 * Driven against a FAKE engine binary that prints the real readiness line, which is
 * how redrob-cowork tests the same shape (`writeFakeEngineBin` in its
 * `engine-pool.test.ts`). No Electron import, so these run in the normal shell suite.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ENGINE_READY_PREFIX, startEngine } from '../src/main/managed-engine'

// The production default waits up to 1s after SIGTERM. The fake engine exits at once,
// and paying a full second per test added ~9s of process load to a CI runner that runs
// every other package in parallel -- which is exactly how a neighbouring CPU-heavy
// suite gets tipped over its own timeout.
const SHORT_SHUTDOWN = { term: 200, kill: 100 }

describe('startEngine', () => {
  let dir: string
  const started: Array<{ close: () => Promise<void> }> = []

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'managed-engine-test-'))
  })

  afterEach(async () => {
    for (const engine of started.splice(0)) await engine.close()
    rmSync(dir, { recursive: true, force: true })
  })

  /** A stand-in for `redrob serve` that behaves the way the real one does. */
  function writeFakeEngine(body: string): string {
    const path = join(dir, 'fake-engine')
    writeFileSync(path, `#!/usr/bin/env node\n${body}\n`, 'utf8')
    chmodSync(path, 0o755)
    return path
  }

  const readyEngine = `
const port = process.argv[process.argv.indexOf('--port') + 1]
// Report the credentials we were given so the test can assert they were minted.
require('node:fs').writeFileSync(process.env.FAKE_ENGINE_REPORT, JSON.stringify({
  user: process.env.REDROB_SERVER_USERNAME ?? null,
  pass: process.env.REDROB_SERVER_PASSWORD ?? null,
  argv: process.argv.slice(2),
}))
console.log('${ENGINE_READY_PREFIX} on http://127.0.0.1:' + port)
setInterval(() => {}, 1000)
`

  it('waits for the readiness line and reports the URL it names', async () => {
    const report = join(dir, 'report.json')
    const engine = await startEngine({
      binary: writeFakeEngine(readyEngine),
      cwd: dir,
      env: { FAKE_ENGINE_REPORT: report },
      shutdownMs: SHORT_SHUTDOWN,
    })
    started.push(engine)

    expect(engine.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(engine.isAlive()).toBe(true)
    expect(engine.pid).toBeGreaterThan(0)
  })

  it('mints per-spawn credentials rather than using a fixed or empty pair', async () => {
    // A loopback port with no credential lets anything running as this user drive the
    // engine, and the engine holds the API keys.
    const reportA = join(dir, 'a.json')
    const reportB = join(dir, 'b.json')
    const binary = writeFakeEngine(readyEngine)

    const first = await startEngine({ binary, cwd: dir, env: { FAKE_ENGINE_REPORT: reportA }, shutdownMs: SHORT_SHUTDOWN })
    started.push(first)
    const second = await startEngine({ binary, cwd: dir, env: { FAKE_ENGINE_REPORT: reportB }, shutdownMs: SHORT_SHUTDOWN })
    started.push(second)

    const a = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(reportA, 'utf8')))
    const b = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(reportB, 'utf8')))

    expect(a.user).toHaveLength(64)
    expect(a.pass).toHaveLength(64)
    expect(a.user).not.toBe(a.pass)
    // Two spawns must not share a credential.
    expect(a.user).not.toBe(b.user)
    expect(first.username).toBe(a.user)
  })

  it('asks for port 0 and learns the real port from the readiness line', async () => {
    const report = join(dir, 'report.json')
    const engine = await startEngine({
      binary: writeFakeEngine(readyEngine),
      cwd: dir,
      env: { FAKE_ENGINE_REPORT: report },
      shutdownMs: SHORT_SHUTDOWN,
    })
    started.push(engine)

    const recorded = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(report, 'utf8')))
    const argv = (recorded.argv as string[]).join(' ')
    expect(argv).toContain('serve')
    expect(argv).toContain('--hostname 127.0.0.1')
    // The port we pass is a real probed port, and the URL we return must agree with it.
    const passed = (recorded.argv as string[])[(recorded.argv as string[]).indexOf('--port') + 1]
    expect(engine.baseUrl).toContain(`:${passed}`)
  })

  it('fails with the engine output when the process dies instead of reporting ready', async () => {
    // Rejecting on close rather than exit is what keeps this diagnostic: on exit the
    // stderr line explaining the failure has often not drained yet.
    const binary = writeFakeEngine(`
console.error('could not open the database')
process.exit(3)
`)
    await expect(startEngine({ binary, cwd: dir, timeoutMs: 5000 })).rejects.toThrow(
      /could not open the database/,
    )
  })

  it('times out rather than hanging when the engine never reports ready', async () => {
    const binary = writeFakeEngine(`setInterval(() => {}, 1000)`)
    await expect(startEngine({ binary, cwd: dir, timeoutMs: 400 })).rejects.toThrow(/did not report ready/)
  })

  it('refuses a readiness line it cannot parse a URL from', async () => {
    // A wrong-but-plausible line must be a loud failure, not a server we then cannot
    // address.
    const binary = writeFakeEngine(`console.log('${ENGINE_READY_PREFIX} but no url here')`)
    await expect(startEngine({ binary, cwd: dir, timeoutMs: 3000 })).rejects.toThrow(/could not parse/)
  })

  it('ignores a line that is not the engine readiness prefix', async () => {
    // Upstream OpenCode prints "opencode server listening" and reads different env
    // names; accepting it would leave Office with a server it cannot authenticate to.
    const binary = writeFakeEngine(`
console.log('opencode server listening on http://127.0.0.1:9999')
setInterval(() => {}, 1000)
`)
    await expect(startEngine({ binary, cwd: dir, timeoutMs: 400 })).rejects.toThrow(/did not report ready/)
  })

  it('reports a missing binary by path instead of failing inside spawn', async () => {
    await expect(startEngine({ binary: join(dir, 'nope'), cwd: dir })).rejects.toThrow(/not found at/)
  })

  it('close is idempotent and leaves the process dead', async () => {
    const report = join(dir, 'report.json')
    const engine = await startEngine({
      binary: writeFakeEngine(readyEngine),
      cwd: dir,
      env: { FAKE_ENGINE_REPORT: report },
      shutdownMs: SHORT_SHUTDOWN,
    })

    await engine.close()
    // A second close must not throw: an engine left alive holds its port, and the next
    // launch then fails with EADDRINUSE in a way that reads as a corrupt install.
    await engine.close()
    expect(engine.isAlive()).toBe(false)
  })
})
