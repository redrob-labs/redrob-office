/**
 * Engine lifecycle for the shell.
 *
 * The engine is started LAZILY — on first use, not in `whenReady`. Two reasons, both
 * about what the user sees:
 *
 *   - Startup cost falls on a user who may never touch AI in this session. Office
 *     opens documents; the engine is for the AI panel. Paying ~1s of spawn plus the
 *     engine's own boot on every launch buys nothing for a user editing a docx.
 *   - A failed engine must not be a failed app launch. If the binary is missing or the
 *     port cannot be had, the right outcome is an AI panel that explains itself, not a
 *     shell that will not open.
 *
 * Single-flight: concurrent callers share one start rather than racing two engines onto
 * two ports. Without that, opening two editor windows at once would spawn two engines
 * and the second would leak.
 */
import { join } from 'node:path'

import { app, ipcMain } from 'electron'

import { startEngine, type ManagedEngine } from './managed-engine'

/** Where electron-builder puts the engine, and where it sits in a dev checkout. */
export function engineBinaryPath(): string {
  const exe = process.platform === 'win32' ? 'redrob-code.exe' : 'redrob-code'
  // Packaged: extraResources copies it to resources/native. Dev: the build output the
  // packaging step asserts is present.
  return app.isPackaged
    ? join(process.resourcesPath, 'native', exe)
    : join(app.getAppPath(), 'build', exe)
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
 * Start the engine if it is not already up, and return it.
 *
 * A previous failure is NOT cached as permanent: the user may install a missing
 * runtime, free a port, or fix a permission and retry, and a cached failure would make
 * the app need a restart to notice.
 */
export function ensureEngine(cwd: string): Promise<ManagedEngine> {
  if (state.status === 'running' && state.engine.isAlive()) return Promise.resolve(state.engine)
  if (state.status === 'starting') return state.promise

  const promise = startEngine({ binary: engineBinaryPath(), cwd })
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
 * Stop the engine. Safe to call when nothing is running.
 *
 * Must be called on `before-quit`: an engine left alive holds its port and outlives the
 * app, so the next launch hits EADDRINUSE and the user sees a broken install rather
 * than a stale process.
 */
export async function teardownEngine(): Promise<void> {
  const current = state
  state = { status: 'stopped' }
  if (current.status === 'running') {
    await current.engine.close()
    return
  }
  if (current.status === 'starting') {
    // A start in flight still produces a process, so wait for it and then stop it —
    // dropping the promise here is exactly how an orphan is created.
    try {
      const engine = await current.promise
      await engine.close()
    } catch {
      // The start failed, so there is nothing to stop.
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
 * `engine:status` is a read; `engine:ensure` starts the engine on demand and returns
 * the SAME reduced status, never the credentials. A renderer that could read the engine
 * password could drive the engine directly, and the engine holds the API keys — the
 * same custody split `redrob-connect.ts` already uses for the device-code flow.
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
