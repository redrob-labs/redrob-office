/**
 * The bundled Redrob engine, as a managed child process.
 *
 * Office has bundled `redrob-code` since it started shipping — `electron-builder.cjs`
 * asserts the binary is present at packaging time and copies it to
 * `resources/native/` — and has never once executed it. This module is what makes
 * that 145MB payload do something: it starts the engine on loopback so Office can
 * reach the routes it already owns, starting with `/api/integration` (the credential
 * store every Redrob app should share) and `/v1/chat/completions`.
 *
 * Modelled on redrob-cowork's `apps/server/src/managed-opencode.ts`, which has been
 * running this shape in production. Four details are copied deliberately rather than
 * re-invented, each because getting it wrong produces a bug that looks like something
 * else:
 *
 *   - Readiness is a line on stdout, not a sleep or a poll. The engine prints
 *     `redrob server listening on http://host:port`; parsing it is how we learn the
 *     real port when we asked for 0, and waiting for it is what stops the first
 *     request racing startup.
 *   - We reject on `close`, not `exit`. A child can emit `exit` before its stdio
 *     pipes drain, so classifying a failure on `exit` throws away the stderr line
 *     that says why.
 *   - Credentials are minted per spawn, never configured. The engine requires Basic
 *     auth; a fixed or absent credential on a loopback port means anything else
 *     running as this user can drive the engine, and the engine holds the API keys.
 *   - Teardown escalates SIGTERM → SIGKILL with a wait between. An engine left alive
 *     holds its port, and the next launch then fails with EADDRINUSE in a way that
 *     reads as a corrupt install.
 *
 * Not copied: Cowork's engine POOL. Office needs one engine for the app, not one per
 * workspace, and a pool would be speculative complexity here.
 */
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import net from 'node:net'
import { spawn, type ChildProcess } from 'node:child_process'

/**
 * Exact prefix `redrob serve` prints when it is ready.
 *
 * Engine-specific on purpose: upstream OpenCode prints `opencode server listening`,
 * reads different env var names, and would leave us with a server Office cannot
 * authenticate against. Matching the precise prefix is what makes starting the wrong
 * binary a visible timeout instead of a silent half-working state.
 */
export const ENGINE_READY_PREFIX = 'redrob server listening'

/** What a caller needs to talk to the engine. The password is a secret: do not log it. */
export type ManagedEngine = {
  baseUrl: string
  username: string
  password: string
  pid: number | null
  isAlive: () => boolean
  close: () => Promise<void>
}

export type EngineSpawnOptions = {
  /** Absolute path to the bundled engine binary. */
  binary: string
  /** Working directory for the engine; normally the user's project. */
  cwd: string
  hostname?: string
  /** Startup budget. Cowork uses 15s, which has held up on cold Windows starts. */
  timeoutMs?: number
  /** Extra environment for the child, merged UNDER the minted credentials. */
  env?: Record<string, string | undefined>
  /**
   * How long teardown waits after SIGTERM before escalating, and after SIGKILL
   * before giving up. Default 1000/500ms.
   *
   * Configurable because the default is a real cost in two places, not just in
   * tests: app shutdown blocks on it, and a suite that starts several engines pays
   * it per engine. The engine exits on SIGTERM in well under a second, so a test
   * that waits the full second is buying nothing and adding load to a CI runner
   * that is already running every other package in parallel.
   */
  shutdownMs?: { term?: number; kill?: number }
}

function secret(): string {
  return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
}

/**
 * Ask the OS for a free port by binding 0 and closing.
 *
 * Inherently racy — another process can take the port between close and spawn — which
 * is why the caller retries on an EADDRINUSE exit rather than trusting this.
 */
async function freePort(hostname: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, hostname, () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === 'object') resolve(address.port)
        else reject(new Error('could not resolve a free port'))
      })
    })
  })
}

export class EngineExitError extends Error {
  readonly exitCode: number | null
  constructor(exitCode: number | null, output: string) {
    super(`engine exited with code ${exitCode}${output.trim() ? `\n${output}` : ''}`)
    this.name = 'EngineExitError'
    this.exitCode = exitCode
  }
}

function isAddressInUse(error: unknown): boolean {
  return error instanceof EngineExitError && error.exitCode === 1 && /\bEADDRINUSE\b/.test(error.message)
}

/** SIGTERM, wait, SIGKILL, wait. Idempotent via a cached promise. */
function makeClose(
  child: ChildProcess,
  shutdown: { term?: number; kill?: number } = {},
): { close: () => Promise<void>; isAlive: () => boolean } {
  const termMs = shutdown.term ?? 1000
  const killMs = shutdown.kill ?? 500
  let exited = false
  let pending: Promise<void> | null = null
  child.once('close', () => {
    exited = true
  })

  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

  return {
    isAlive: () => !exited && child.exitCode === null,
    close: () => {
      if (exited) return Promise.resolve()
      if (pending) return pending
      pending = (async () => {
        child.kill('SIGTERM')
        // Poll instead of sleeping the whole budget: the engine normally exits in
        // milliseconds, and waiting the full second regardless makes shutdown feel
        // hung and slows any suite that starts more than one engine.
        const deadline = Date.now() + termMs
        while (!exited && Date.now() < deadline) await wait(25)
        if (exited) return
        child.kill('SIGKILL')
        const hardDeadline = Date.now() + killMs
        while (!exited && Date.now() < hardDeadline) await wait(25)
      })()
      return pending
    },
  }
}

async function startOnce(options: EngineSpawnOptions, hostname: string, port: number): Promise<ManagedEngine> {
  const username = secret()
  const password = secret()

  const child = spawn(
    options.binary,
    ['serve', '--hostname', hostname, '--port', String(port), '--cors', '*'],
    {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
        // The engine reads these names specifically. Minted per spawn so the
        // credential never outlives the process that owns it.
        REDROB_SERVER_USERNAME: username,
        REDROB_SERVER_PASSWORD: password,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      // Without this the user gets a console window flashing behind the app on every
      // engine start, because the engine is a console-subsystem executable on Windows.
      windowsHide: true,
    },
  )

  const lifecycle = makeClose(child, options.shutdownMs)

  let baseUrl: string
  try {
    baseUrl = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`engine did not report ready within ${options.timeoutMs ?? 15000}ms`)),
        options.timeoutMs ?? 15000,
      )
      let output = ''
      const done = (value: string) => {
        clearTimeout(timer)
        resolve(value)
      }
      const fail = (error: Error) => {
        clearTimeout(timer)
        reject(error)
      }

      child.stdout?.on('data', (chunk) => {
        output += String(chunk)
        for (const line of output.split('\n')) {
          if (!line.startsWith(ENGINE_READY_PREFIX)) continue
          const match = /on\s+(https?:\/\/[^\s]+)/.exec(line)
          if (!match?.[1]) return fail(new Error(`could not parse the engine URL from: ${line}`))
          done(match[1])
        }
      })
      child.stderr?.on('data', (chunk) => {
        output += String(chunk)
      })
      child.once('error', fail)
      // `close` rather than `exit`: stdio has drained by then, so the collected output
      // still contains the line that explains the failure.
      child.once('close', (code) => fail(new EngineExitError(code, output)))
    })
  } catch (error) {
    await lifecycle.close()
    throw error
  }

  return { baseUrl, username, password, pid: child.pid ?? null, ...lifecycle }
}

/**
 * Start the engine, retrying once if the port was taken between probe and spawn.
 *
 * One retry, not a loop: a second EADDRINUSE means something is systematically
 * holding ports, and retrying forever would turn a diagnosable failure into a hang.
 */
export async function startEngine(options: EngineSpawnOptions): Promise<ManagedEngine> {
  if (!existsSync(options.binary)) {
    throw new Error(`engine binary not found at ${options.binary}`)
  }
  const hostname = options.hostname ?? '127.0.0.1'
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const port = await freePort(hostname)
    try {
      return await startOnce(options, hostname, port)
    } catch (error) {
      if (attempt === 0 && isAddressInUse(error)) continue
      throw error
    }
  }
  throw new Error('engine failed to start')
}
