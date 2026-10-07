/**
 * Tests for the engine lifecycle.
 *
 * `electron` is mocked, so these run in the normal shell suite with no Electron
 * process. The point is the single-flight and teardown behaviour, which is where an
 * orphaned engine comes from.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const startEngine = vi.fn()

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/app',
    getPath: () => '/userData',
  },
  ipcMain: { handle: vi.fn() },
}))
vi.mock('../src/main/managed-engine', () => ({ startEngine }))

const { ensureEngine, engineStatus, resetEngineStateForTests, teardownEngine, engineBinaryPath } = await import(
  '../src/main/engine-lifecycle'
)

function fakeEngine(alive = true) {
  return {
    baseUrl: 'http://127.0.0.1:41234',
    username: 'u',
    password: 'p',
    pid: 123,
    isAlive: () => alive,
    close: vi.fn().mockResolvedValue(undefined),
  }
}

describe('engine lifecycle', () => {
  beforeEach(() => {
    resetEngineStateForTests()
    startEngine.mockReset()
  })

  afterEach(() => {
    resetEngineStateForTests()
  })

  it('starts stopped, so app launch pays nothing', () => {
    // Lazy on purpose: Office opens documents, and a user who never touches AI should
    // not pay the spawn.
    expect(engineStatus()).toEqual({ status: 'stopped' })
    expect(startEngine).not.toHaveBeenCalled()
  })

  it('starts once and reuses the running engine', async () => {
    startEngine.mockResolvedValue(fakeEngine())
    await ensureEngine('/proj')
    await ensureEngine('/proj')
    expect(startEngine).toHaveBeenCalledTimes(1)
    expect(engineStatus()).toEqual({ status: 'running', baseUrl: 'http://127.0.0.1:41234' })
  })

  it('is single-flight: concurrent callers do not spawn two engines', async () => {
    // Without this, opening two editor windows at once spawns two engines on two ports
    // and the second leaks.
    let release: (value: unknown) => void = () => {}
    startEngine.mockReturnValue(new Promise((resolve) => (release = resolve)))

    const a = ensureEngine('/proj')
    const b = ensureEngine('/proj')
    expect(engineStatus()).toEqual({ status: 'starting' })
    release(fakeEngine())
    await Promise.all([a, b])

    expect(startEngine).toHaveBeenCalledTimes(1)
  })

  it('reports a failure without caching it as permanent', async () => {
    // The user may install the runtime or free the port and retry; a cached failure
    // would make the app need a restart to notice.
    startEngine.mockRejectedValueOnce(new Error('engine binary not found at /app/build/redrob-code'))
    await expect(ensureEngine('/proj')).rejects.toThrow(/not found/)
    expect(engineStatus()).toEqual({
      status: 'failed',
      error: 'engine binary not found at /app/build/redrob-code',
    })

    startEngine.mockResolvedValueOnce(fakeEngine())
    await ensureEngine('/proj')
    expect(engineStatus().status).toBe('running')
  })

  it('restarts when the running engine has died', async () => {
    startEngine.mockResolvedValueOnce(fakeEngine(false))
    await ensureEngine('/proj')
    startEngine.mockResolvedValueOnce(fakeEngine(true))
    await ensureEngine('/proj')
    expect(startEngine).toHaveBeenCalledTimes(2)
  })

  it('never exposes the engine credentials to the renderer', () => {
    // A renderer that could read the password could drive the engine directly, and the
    // engine holds the API keys.
    startEngine.mockResolvedValue(fakeEngine())
    return ensureEngine('/proj').then(() => {
      const status = engineStatus()
      expect(JSON.stringify(status)).not.toContain('password')
      expect(JSON.stringify(status)).not.toContain('"p"')
    })
  })

  it('teardown closes a running engine', async () => {
    const engine = fakeEngine()
    startEngine.mockResolvedValue(engine)
    await ensureEngine('/proj')
    await teardownEngine()
    expect(engine.close).toHaveBeenCalled()
    expect(engineStatus()).toEqual({ status: 'stopped' })
  })

  it('teardown waits for a start in flight instead of orphaning it', async () => {
    // Dropping the in-flight promise here is exactly how an orphan process is created:
    // the spawn completes after the app has quit and nothing ever closes it.
    const engine = fakeEngine()
    let release: (value: unknown) => void = () => {}
    startEngine.mockReturnValue(new Promise((resolve) => (release = resolve)))

    const pending = ensureEngine('/proj')
    const stopping = teardownEngine()
    release(engine)
    await Promise.all([pending, stopping])

    expect(engine.close).toHaveBeenCalled()
  })

  it('teardown is safe when nothing is running', async () => {
    await expect(teardownEngine()).resolves.toBeUndefined()
  })

  it('resolves the dev binary path from the app path', () => {
    expect(engineBinaryPath()).toContain('/app/build/redrob-code')
  })
})
