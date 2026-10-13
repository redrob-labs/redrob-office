/**
 * Tests for the shared-daemon client.
 *
 * Driven against a FAKE `redrob` binary that answers `service start --json` the way the
 * real CLI does, and a fake `fetch` standing in for the daemon's HTTP API. No daemon is
 * ever started, no port is ever bound, and no Electron import is needed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  DAEMON_USERNAME,
  attach,
  connectOrStart,
  currentDaemon,
  daemonHeaders,
  daemonRecordPath,
  readDaemonRecord,
  resolveSharedRedrobBin,
  type DaemonRecord,
} from '../src/main/engine-daemon'

const record: DaemonRecord = {
  id: 'd1',
  version: '0.6.0',
  url: 'http://127.0.0.1:41234',
  port: 41234,
  pid: 4242,
  secret: 's3cret',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** A fetch whose routes the test chooses; unknown routes answer 404. */
function fakeDaemon(routes: Record<string, (init?: RequestInit) => Response | Promise<Response>>) {
  const calls: Array<{ method: string; path: string; headers: Record<string, string>; body?: string }> = []
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    calls.push({
      method,
      path: url.pathname,
      headers: (init?.headers as Record<string, string>) ?? {},
      body: typeof init?.body === 'string' ? init.body : undefined,
    })
    const handler = routes[`${method} ${url.pathname}`]
    return handler ? handler(init) : json({ error: 'not found' }, 404)
  })
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls }
}

describe('engine daemon', () => {
  let dir: string
  let runDir: string
  let env: NodeJS.ProcessEnv

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'engine-daemon-test-'))
    runDir = join(dir, 'run')
    mkdirSync(runDir)
    env = { ...process.env, REDROB_RUN_DIR: runDir, REDROB_CODE_BIN: undefined, PATH: '' }
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function writeRecord(value: unknown): void {
    writeFileSync(join(runDir, 'server.json'), JSON.stringify(value), { mode: 0o600 })
  }

  /** A stand-in for `redrob service start --json`. */
  function writeFakeRedrob(body: string): string {
    const path = join(dir, 'fake-redrob')
    writeFileSync(path, `#!${process.execPath}\n${body}\n`, 'utf8')
    chmodSync(path, 0o755)
    return path
  }

  const startsFine = `
require('node:fs').writeFileSync(process.env.FAKE_REPORT, JSON.stringify({
  argv: process.argv.slice(2),
  app: process.env.REDROB_APP ?? null,
}))
console.log('starting the daemon...')
console.log(JSON.stringify(${JSON.stringify(record)}))
`

  it('reads the record from REDROB_RUN_DIR and rejects a malformed one', async () => {
    expect(daemonRecordPath(env)).toBe(join(runDir, 'server.json'))
    expect(await readDaemonRecord(env)).toBeUndefined()
    writeRecord({ id: 'x' })
    expect(await readDaemonRecord(env)).toBeUndefined()
    writeRecord(record)
    expect(await readDaemonRecord(env)).toEqual(record)
  })

  it('authenticates as redrob with the record secret', () => {
    expect(daemonHeaders('s3cret').Authorization).toBe(`Basic ${Buffer.from(`${DAEMON_USERNAME}:s3cret`).toString('base64')}`)
  })

  it('reuses a healthy registered daemon without spawning anything', async () => {
    writeRecord(record)
    const daemon = fakeDaemon({ 'GET /api/health': () => json({ healthy: true }) })
    const connection = await connectOrStart(join(dir, 'does-not-exist'), { env, fetch: daemon.fetchImpl })
    expect(connection.started).toBe(false)
    expect(connection.url).toBe(record.url)
    expect(connection.record.secret).toBe('s3cret')
    expect(daemon.calls[0]!.headers.Authorization).toBe(daemonHeaders('s3cret').Authorization)
  })

  it('currentDaemon spawns nothing and is undefined for a stale record', async () => {
    writeRecord(record)
    const daemon = fakeDaemon({})
    expect(await currentDaemon({ env, fetch: daemon.fetchImpl })).toBeUndefined()
    const unhealthy = fakeDaemon({ 'GET /api/health': () => json({ healthy: false }) })
    expect(await currentDaemon({ env, fetch: unhealthy.fetchImpl })).toBeUndefined()
  })

  it('runs `service start --json` for a stale record and parses the last JSON line', async () => {
    writeRecord({ ...record, port: 1, url: 'http://127.0.0.1:1' })
    const report = join(dir, 'report.json')
    const daemon = fakeDaemon({})
    const connection = await connectOrStart(writeFakeRedrob(startsFine), {
      env: { ...env, FAKE_REPORT: report },
      fetch: daemon.fetchImpl,
      idleExitMinutes: 7,
    })
    expect(connection.started).toBe(true)
    expect(connection.record).toEqual(record)
    const reported = JSON.parse(readFileSync(report, 'utf8'))
    expect(reported.argv).toEqual(['service', 'start', '--json', '--idle-exit', '7'])
    // Office labels the daemon's AI work only when Office is the one starting it.
    expect(reported.app).toBe('office')
  })

  it('runs `service start` when there is no record at all, with the default idle window', async () => {
    const report = join(dir, 'report.json')
    await connectOrStart(writeFakeRedrob(startsFine), { env: { ...env, FAKE_REPORT: report }, fetch: fakeDaemon({}).fetchImpl })
    expect(JSON.parse(readFileSync(report, 'utf8')).argv).toContain('10')
  })

  it('fails with the CLI output when service start exits non-zero', async () => {
    const bin = writeFakeRedrob(`console.error('no engine for you'); process.exit(2)`)
    await expect(connectOrStart(bin, { env, fetch: fakeDaemon({}).fetchImpl })).rejects.toThrow(/exit 2.*no engine for you/s)
  })

  it('fails when the binary cannot be run', async () => {
    await expect(connectOrStart(join(dir, 'missing'), { env, fetch: fakeDaemon({}).fetchImpl })).rejects.toThrow(/could not run/)
  })

  it('refuses a record it cannot parse', async () => {
    const bin = writeFakeRedrob(`console.log(JSON.stringify({ hello: 'world' }))`)
    await expect(connectOrStart(bin, { env, fetch: fakeDaemon({}).fetchImpl })).rejects.toThrow(/not a daemon record/)
  })

  it('resolves the shared binary from REDROB_CODE_BIN, then ~/.redrob/bin, then PATH, else undefined', async () => {
    const exe = process.platform === 'win32' ? 'redrob.exe' : 'redrob'
    const home = join(dir, 'home')
    expect(await resolveSharedRedrobBin({ ...env, REDROB_CODE_BIN: '/opt/redrob' }, home)).toBe('/opt/redrob')
    expect(await resolveSharedRedrobBin(env, home)).toBeUndefined()
    const onPath = join(dir, 'bin')
    mkdirSync(onPath)
    writeFileSync(join(onPath, exe), '')
    expect(await resolveSharedRedrobBin({ ...env, PATH: onPath }, home)).toBe(exe)
    mkdirSync(join(home, '.redrob', 'bin'), { recursive: true })
    writeFileSync(join(home, '.redrob', 'bin', exe), '')
    expect(await resolveSharedRedrobBin({ ...env, PATH: onPath }, home)).toBe(join(home, '.redrob', 'bin', exe))
  })

  it('attaches as the app with its pid, heartbeats, re-attaches on 404, and detaches', async () => {
    vi.useFakeTimers()
    try {
      let restarted = false
      const daemon = fakeDaemon({
        'POST /api/clients': () => json({ id: restarted ? 'c2' : 'c1' }),
        'POST /api/clients/c1/heartbeat': () => (restarted ? json({ error: 'gone' }, 404) : json({ ok: true })),
        'POST /api/clients/c2/heartbeat': () => json({ ok: true }),
        'DELETE /api/clients/c2': () => json({ ok: true }),
      })
      const connection = { url: record.url, headers: daemonHeaders('s3cret'), record, started: false }
      const attachment = await attach(connection, 'office', { pid: 777, fetch: daemon.fetchImpl, intervalMs: 1000 })
      expect(attachment.id).toBe('c1')
      expect(daemon.calls[0]).toMatchObject({
        method: 'POST',
        path: '/api/clients',
        body: JSON.stringify({ app: 'office', pid: 777 }),
      })
      expect(daemon.calls[0]!.headers.Authorization).toBe(daemonHeaders('s3cret').Authorization)

      await vi.advanceTimersByTimeAsync(1000)
      expect(daemon.calls.at(-1)).toMatchObject({ method: 'POST', path: '/api/clients/c1/heartbeat' })

      // The daemon restarted: c1 is gone (404), so the next beat attaches again and the
      // attachment follows the new id.
      restarted = true
      await vi.advanceTimersByTimeAsync(1000)
      expect(daemon.calls.slice(-2).map((c) => `${c.method} ${c.path}`)).toEqual([
        'POST /api/clients/c1/heartbeat',
        'POST /api/clients',
      ])
      expect(attachment.id).toBe('c2')

      await vi.advanceTimersByTimeAsync(1000)
      expect(daemon.calls.at(-1)).toMatchObject({ method: 'POST', path: '/api/clients/c2/heartbeat' })

      await attachment.detach()
      expect(daemon.calls.at(-1)).toMatchObject({ method: 'DELETE', path: '/api/clients/c2' })
      const after = daemon.calls.length
      await vi.advanceTimersByTimeAsync(5000)
      expect(daemon.calls.length).toBe(after)
      // Idempotent.
      await attachment.detach()
      expect(daemon.calls.length).toBe(after)
    } finally {
      vi.useRealTimers()
    }
  })

  it('refuses to attach when the daemon rejects the client', async () => {
    const daemon = fakeDaemon({ 'POST /api/clients': () => json({ error: 'nope' }, 401) })
    const connection = { url: record.url, headers: daemonHeaders('bad'), record, started: false }
    await expect(attach(connection, 'office', { fetch: daemon.fetchImpl })).rejects.toThrow(/refused the attachment \(401\)/)
  })
})
