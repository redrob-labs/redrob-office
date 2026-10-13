/**
 * The shared Redrob Code daemon, from Office: find it or start it, attach, keep the
 * attachment alive, detach on close.
 *
 * One `redrob` daemon per user serves every Redrob app; Office is one of its clients,
 * not its owner. The fast path is a file read and a health check and spawns nothing.
 * Only when no healthy daemon is registered does this run `redrob service start --json`,
 * which keeps the start logic (version policy, stale-record cleanup, port choice) in one
 * place: the CLI. Office never runs `redrob serve` itself any more.
 *
 * Mirrors `packages/sdk/js/src/daemon.ts` in redrob-code. Copied rather than imported
 * because the SDK release that carries it is not on npm yet, and because this must run
 * in the Electron main process with Node built-ins only.
 *
 * Protocol (redrob-code docs/LOCAL-ENGINE-API.md, section 3):
 *   - record file `$HOME/.redrob/run/server.json` (`REDROB_RUN_DIR` overrides the folder),
 *     `{id, version, url, port, pid, secret}`
 *   - auth: Basic, username `redrob`, password = record.secret
 *   - `GET /api/health` -> `{healthy: true}`
 *   - `POST /api/clients {app, pid}` -> `{id}`; `POST /api/clients/:id/heartbeat` within
 *     `ttlMs` (90s; we beat every 30s); 404 means the daemon restarted, so re-attach;
 *     `DELETE /api/clients/:id` detaches
 *   - per-request working directory: `x-redrob-directory` header (or `?directory=`)
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export type DaemonRecord = {
  readonly id: string
  readonly version: string
  readonly url: string
  readonly port: number
  readonly pid: number
  readonly secret: string
}

export type DaemonConnection = {
  readonly url: string
  readonly headers: { readonly Authorization: string }
  readonly record: DaemonRecord
  /** True when THIS call ran `redrob service start`, false when it reused a healthy daemon. */
  readonly started: boolean
}

export type DaemonOptions = {
  /** The `redrob` binary. Default: `REDROB_CODE_BIN`, then `~/.redrob/bin/redrob`, then `redrob` on PATH. */
  readonly bin?: string
  readonly env?: NodeJS.ProcessEnv
  /** Minutes with no attached app before a daemon this call starts exits. 0 keeps it up. Default 10. */
  readonly idleExitMinutes?: number
  readonly timeoutMs?: number
  readonly fetch?: typeof fetch
}

/** The Basic-auth username every daemon accepts; the password is the record's secret. */
export const DAEMON_USERNAME = 'redrob'

/** Header that selects the working directory for one engine request. */
export const DIRECTORY_HEADER = 'x-redrob-directory'

/** How often an attachment is renewed. A third of the daemon's 90s TTL. */
export const HEARTBEAT_MS = 30_000

export function daemonRecordPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(env.REDROB_RUN_DIR?.trim() || path.join(os.homedir(), '.redrob', 'run'), 'server.json')
}

export function daemonHeaders(secret: string): { Authorization: string } {
  return { Authorization: `Basic ${Buffer.from(`${DAEMON_USERNAME}:${secret}`).toString('base64')}` }
}

async function exists(file: string): Promise<boolean> {
  return fs.stat(file).then(
    () => true,
    () => false,
  )
}

/**
 * Where a user-installed `redrob` is, by the documented resolution order, or undefined
 * when there is none. Undefined is the signal to start the shared daemon from Office's
 * bundled binary instead.
 */
export async function resolveSharedRedrobBin(
  env: NodeJS.ProcessEnv = process.env,
  homedir: string = os.homedir(),
): Promise<string | undefined> {
  const explicit = env.REDROB_CODE_BIN?.trim()
  if (explicit) return explicit
  const home = path.join(homedir, '.redrob', 'bin', process.platform === 'win32' ? 'redrob.exe' : 'redrob')
  if (await exists(home)) return home
  const exe = process.platform === 'win32' ? 'redrob.exe' : 'redrob'
  for (const dir of (env.PATH ?? '').split(path.delimiter)) {
    if (dir && (await exists(path.join(dir, exe)))) return exe
  }
  return undefined
}

function isRecord(value: unknown): value is DaemonRecord {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.version === 'string' &&
    typeof v.url === 'string' &&
    typeof v.port === 'number' &&
    typeof v.pid === 'number' &&
    typeof v.secret === 'string'
  )
}

export async function readDaemonRecord(env: NodeJS.ProcessEnv = process.env): Promise<DaemonRecord | undefined> {
  try {
    const value: unknown = JSON.parse(await fs.readFile(daemonRecordPath(env), 'utf8'))
    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}

function base(url: string): string {
  return url.replace(/\/+$/, '')
}

export async function daemonHealthy(record: DaemonRecord, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(`${base(record.url)}/api/health`, {
      headers: daemonHeaders(record.secret),
      signal: AbortSignal.timeout(2_000),
    })
    if (!response.ok) return false
    const body = (await response.json().catch(() => null)) as { healthy?: unknown } | null
    return body?.healthy === true
  } catch {
    return false
  }
}

/** The registered daemon, if it answers. Spawns nothing. */
export async function currentDaemon(options: DaemonOptions = {}): Promise<DaemonConnection | undefined> {
  const env = options.env ?? process.env
  const record = await readDaemonRecord(env)
  if (!record) return undefined
  if (!(await daemonHealthy(record, options.fetch))) return undefined
  return { url: record.url, headers: daemonHeaders(record.secret), record, started: false }
}

function runServiceStart(options: DaemonOptions, bin: string): Promise<DaemonRecord> {
  const env = options.env ?? process.env
  const idle = options.idleExitMinutes ?? 10
  const timeoutMs = options.timeoutMs ?? 20_000
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['service', 'start', '--json', '--idle-exit', String(idle)], {
      // REDROB_APP labels the AI work this daemon does for the Console. It is set here,
      // and only here, because this is the one place Office is the process that starts
      // the daemon; a daemon another app started keeps that app's label.
      env: { ...env, REDROB_APP: 'office' },
      stdio: ['ignore', 'pipe', 'pipe'],
      // Console-subsystem executable on Windows: without this a console window flashes
      // behind the app.
      windowsHide: true,
    })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`redrob service start did not answer in ${timeoutMs}ms`))
    }, timeoutMs)
    child.stdout?.on('data', (chunk) => (out += String(chunk)))
    child.stderr?.on('data', (chunk) => (err += String(chunk)))
    child.on('error', (cause) => {
      clearTimeout(timer)
      reject(new Error(`could not run ${bin}: ${cause.message}`))
    })
    // `close`, not `exit`: stdio has drained by then, so the JSON line is complete.
    child.on('close', (code) => {
      clearTimeout(timer)
      const line = out
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('{'))
        .pop()
      if (code !== 0 || !line) {
        reject(new Error(`redrob service start failed (exit ${code}): ${err.trim() || out.trim()}`))
        return
      }
      let value: unknown
      try {
        value = JSON.parse(line)
      } catch {
        reject(new Error('redrob service start printed something that is not JSON'))
        return
      }
      if (!isRecord(value)) {
        reject(new Error('redrob service start printed something that is not a daemon record'))
        return
      }
      resolve(value)
    })
  })
}

/**
 * The shared daemon: the registered one when it answers, otherwise the one
 * `redrob service start` finds or starts with `bin`. `bin` is required here (unlike the
 * SDK) because the lifecycle decides between a user-installed `redrob` and Office's
 * bundled binary, and that decision should be visible at the call site.
 */
export async function connectOrStart(bin: string, options: DaemonOptions = {}): Promise<DaemonConnection> {
  const found = await currentDaemon(options)
  if (found) return found
  const record = await runServiceStart(options, bin)
  return { url: record.url, headers: daemonHeaders(record.secret), record, started: true }
}

export type Attachment = {
  readonly id: string
  /** Detach and stop the heartbeat. Safe to call twice. */
  readonly detach: () => Promise<void>
}

/**
 * Tell the daemon this app depends on it, and keep saying so. The daemon drops an
 * attachment whose heartbeats stop (an app that crashed) and exits once nobody has been
 * attached for its idle window, so Office holds an attachment for as long as it runs.
 */
export async function attach(
  connection: DaemonConnection,
  app: string,
  options: { readonly pid?: number; readonly fetch?: typeof fetch; readonly intervalMs?: number } = {},
): Promise<Attachment> {
  const fetchImpl = options.fetch ?? fetch
  const root = base(connection.url)
  const headers = { ...connection.headers, 'content-type': 'application/json' }
  const body = JSON.stringify({ app, pid: options.pid ?? process.pid })
  const response = await fetchImpl(`${root}/api/clients`, { method: 'POST', headers, body })
  if (!response.ok) throw new Error(`the engine refused the attachment (${response.status})`)
  const client = (await response.json()) as { id: string }
  let stopped = false
  const beat = async () => {
    if (stopped) return
    const r = await fetchImpl(`${root}/api/clients/${client.id}/heartbeat`, { method: 'POST', headers }).catch(
      () => undefined,
    )
    // 404: the daemon restarted (or dropped us); attach again so it keeps counting Office.
    if (r && r.status === 404 && !stopped) {
      const again = await fetchImpl(`${root}/api/clients`, { method: 'POST', headers, body }).catch(() => undefined)
      if (again?.ok) client.id = ((await again.json()) as { id: string }).id
    }
  }
  const timer = setInterval(() => void beat(), options.intervalMs ?? HEARTBEAT_MS)
  timer.unref?.()
  return {
    get id() {
      return client.id
    },
    detach: async () => {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      await fetchImpl(`${root}/api/clients/${client.id}`, { method: 'DELETE', headers: connection.headers }).catch(
        () => undefined,
      )
    },
  }
}
