/**
 * Engine lifecycle for the shell.
 *
 * Office does not own an engine. It attaches to the ONE shared Redrob Code daemon every
 * Redrob app on this machine uses (`redrob service start`), and the daemon exits on its
 * own once no app has been attached for its idle window. What this module owns is the
 * attachment: when to make it, how to keep it alive, and letting go on quit.
 *
 * The attachment is made LAZILY — on first use, not in `whenReady`. Two reasons, both
 * about what the user sees:
 *
 *   - Startup cost falls on a user who may never touch AI in this session. Office
 *     opens documents; the engine is for the AI panel. Starting a daemon on every
 *     launch buys nothing for a user editing a docx.
 *   - A failed engine must not be a failed app launch. If no binary can be run or the
 *     daemon will not answer, the right outcome is an AI panel that explains itself,
 *     not a shell that will not open.
 *
 * Single-flight: concurrent callers share one connect rather than racing two
 * `service start` children.
 *
 * Which binary: a user-installed `redrob` (`REDROB_CODE_BIN`, `~/.redrob/bin/redrob`,
 * PATH) when there is one, so Office runs the same daemon Redrob Code itself would;
 * otherwise Office's bundled binary starts the SHARED daemon, registered the same way,
 * so a later Redrob Code install or another app finds and reuses it rather than
 * starting a second engine. Office never runs `redrob serve` directly.
 */
import { join } from 'node:path'

import { app, ipcMain } from 'electron'

import {
  DAEMON_USERNAME,
  attach,
  connectOrStart,
  daemonHealthy,
  resolveSharedRedrobBin,
  type DaemonOptions,
} from './engine-daemon'

/** What a caller needs to talk to the engine. The password is a secret: do not log it. */
export type ManagedEngine = {
  baseUrl: string
  username: string
  password: string
  /** Pid of the daemon process. Office did not necessarily start it. */
  pid: number | null
  /** Cached health: true until a heartbeat or health probe says otherwise. */
  isAlive: () => boolean
  /** Detach from the daemon. Never stops it: other apps may be attached. */
  close: () => Promise<void>
}

/** Where electron-builder puts the engine, and where it sits in a dev checkout. */
export function engineBinaryPath(): string {
  const exe = process.platform === 'win32' ? 'redrob-code.exe' : 'redrob-code'
  // Packaged: extraResources copies it to resources/native. Dev: the build output the
  // packaging step asserts is present.
  return app.isPackaged
    ? join(process.resourcesPath, 'native', exe)
    : join(app.getAppPath(), 'build', exe)
}

/** How often the cached health is refreshed against the daemon. */
const HEALTH_MS = 30_000

export type ConnectOptions = DaemonOptions & {
  /** Override the bundled binary used when no shared `redrob` is installed. */
  bundledBin?: string
  /** Heartbeat interval for the attachment (tests shorten it). */
  heartbeatMs?: number
  /** Health refresh interval (tests shorten it). */
  healthMs?: number
}

/**
 * Attach to the shared daemon, starting it if nothing healthy is registered.
 *
 * Exported for the lifecycle below and for tests; `ensureEngine` is what the app calls.
 */
export async function connectSharedEngine(options: ConnectOptions = {}): Promise<ManagedEngine> {
  const env = options.env ?? process.env
  const bin = (await resolveSharedRedrobBin(env)) ?? options.bundledBin ?? engineBinaryPath()
  const connection = await connectOrStart(bin, options)
  const attachment = await attach(connection, 'office', {
    pid: process.pid,
    fetch: options.fetch,
    intervalMs: options.heartbeatMs,
  })

  let alive = true
  let closed = false
  const probe = async () => {
    if (closed) return
    alive = await daemonHealthy(connection.record, options.fetch)
  }
  const health = setInterval(() => void probe(), options.healthMs ?? HEALTH_MS)
  health.unref?.()

  return {
    baseUrl: connection.url.replace(/\/+$/, ''),
    username: DAEMON_USERNAME,
    password: connection.record.secret,
    pid: connection.record.pid,
    isAlive: () => alive && !closed,
    close: async () => {
      if (closed) return
      closed = true
      clearInterval(health)
      await attachment.detach()
    },
  }
}

type State =
  | { status: 'stopped' }
  | { status: 'starting'; promise: Promise<ManagedEngine> }
  | { status: 'running'; engine: ManagedEngine }
  | { status: 'failed'; error: string }

let state: State = { status: 'stopped' }

/** What the renderer is allowed to know: never the engine password. */
export type EngineStatus =
  | { status: 'stopped' }
  | { status: 'starting' }
  | { status: 'running'; baseUrl: string }
  | { status: 'failed'; error: string }

export function engineStatus(): EngineStatus {
  switch (state.status) {
    case 'running':
      return { status: 'running', baseUrl: state.engine.baseUrl }
    case 'failed':
      return { status: 'failed', error: state.error }
    case 'starting':
      return { status: 'starting' }
    default:
      return { status: 'stopped' }
  }
}

/**
 * Attach to the shared daemon if we are not already attached, and return it.
 *
 * `cwd` is NOT the daemon's working directory any more — one daemon serves every project
 * of every app — it is the directory each engine request must name in its
 * `x-redrob-directory` header (`EngineIntegrationClient` does this from `directory`).
 * It is kept in the signature so call sites keep saying which project they mean.
 *
 * A previous failure is NOT cached as permanent: the user may install the runtime or
 * fix a permission and retry, and a cached failure would make the app need a restart to
 * notice. A daemon that stopped answering is reconnected the same way.
 */
export function ensureEngine(_cwd: string): Promise<ManagedEngine> {
  if (state.status === 'running' && state.engine.isAlive()) return Promise.resolve(state.engine)
  if (state.status === 'starting') return state.promise

  const stale = state.status === 'running' ? state.engine : null
  const promise = (stale ? stale.close().catch(() => undefined) : Promise.resolve())
    .then(() => connectSharedEngine())
    .then((engine) => {
      state = { status: 'running', engine }
      return engine
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      state = { status: 'failed', error: message }
      throw error
    })

  state = { status: 'starting', promise }
  return promise
}

/**
 * Detach from the daemon. Safe to call when nothing is attached.
 *
 * Called on `before-quit`. Detaching promptly is what lets the daemon count Office as
 * gone and exit on its idle timer; it never stops the daemon itself, because another
 * Redrob app may still be using it.
 */
export async function teardownEngine(): Promise<void> {
  const current = state
  state = { status: 'stopped' }
  if (current.status === 'running') {
    await current.engine.close()
    return
  }
  if (current.status === 'starting') {
    // A connect in flight still produces an attachment, so wait for it and then detach —
    // dropping the promise here would leave the daemon counting an app that has quit
    // until its heartbeat TTL lapses.
    try {
      const engine = await current.promise
      await engine.close()
    } catch {
      // The connect failed, so there is nothing to detach.
    }
  }
}

/** Test seam: reset module state between cases. */
export function resetEngineStateForTests(): void {
  state = { status: 'stopped' }
}

/**
 * IPC for the renderer.
 *
 * `engine:status` is a read; `engine:ensure` attaches on demand and returns the SAME
 * reduced status, never the credentials. A renderer that could read the engine password
 * could drive the engine directly, and the engine holds the API keys — the same custody
 * split `redrob-connect.ts` already uses for the device-code flow.
 */
export function registerEngineIpc(): void {
  ipcMain.handle('engine:status', () => engineStatus())
  ipcMain.handle('engine:ensure', async (_event, directory: unknown) => {
    const cwd = typeof directory === 'string' && directory ? directory : app.getPath('userData')
    try {
      await ensureEngine(cwd)
    } catch {
      // The status already carries the reason; throwing across IPC would turn a
      // recoverable "not installed yet" into an unhandled renderer rejection.
    }
    return engineStatus()
  })
}
