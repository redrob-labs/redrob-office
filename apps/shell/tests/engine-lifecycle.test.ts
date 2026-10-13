/**
 * Tests for the engine lifecycle.
 *
 * `electron` and the daemon client are mocked, so these run in the normal shell suite
 * with no Electron process and no daemon. The point is which binary is chosen, that
 * Office attaches rather than spawns, the single-flight, and that teardown detaches
 * without ever stopping the daemon.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const connectOrStart = vi.fn()
const attach = vi.fn()
const resolveSharedRedrobBin = vi.fn()
const daemonHealthy = vi.fn()

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/app',
    getPath: () => '/userData',
  },
  ipcMain: { handle: vi.fn() },
}))
vi.mock('../src/main/engine-daemon', () => ({
  DAEMON_USERNAME: 'redrob',
  connectOrStart,
  attach,
  resolveSharedRedrobBin,
  daemonHealthy,
}))

const { ensureEngine, engineStatus, resetEngineStateForTests, teardownEngine, engineBinaryPath, connectSharedEngine } =
  await import('../src/main/engine-lifecycle')

const record = { id: 'd1', version: '0.6.0', url: 'http://127.0.0.1:41234', port: 41234, pid: 4242, secret: 's3cret' }

function connection(started = false) {
  return { url: record.url, headers: { Authorization: 'Basic x' }, record, started }
}

function attachment() {
  return { id: 'c1', detach: vi.fn().mockResolvedValue(undefined) }
}

describe('engine lifecycle', () => {
  beforeEach(() => {
    resetEngineStateForTests()
    connectOrStart.mockReset()
    attach.mockReset()
    resolveSharedRedrobBin.mockReset()
    daemonHealthy.mockReset()
    resolveSharedRedrobBin.mockResolvedValue('/home/u/.redrob/bin/redrob')
    connectOrStart.mockResolvedValue(connection())
    attach.mockResolvedValue(attachment())
    daemonHealthy.mockResolvedValue(true)
  })

  afterEach(() => {
    resetEngineStateForTests()
  })

  it('starts stopped, so app launch pays nothing', () => {
    // Lazy on purpose: Office opens documents, and a user who never touches AI should
    // not pay a daemon start.
    expect(engineStatus()).toEqual({ status: 'stopped' })
    expect(connectOrStart).not.toHaveBeenCalled()
  })

  it('attaches to the shared daemon as office and exposes its credentials', async () => {
    const engine = await ensureEngine('/proj')
    expect(connectOrStart).toHaveBeenCalledWith('/home/u/.redrob/bin/redrob', expect.anything())
    expect(attach).toHaveBeenCalledWith(expect.objectContaining({ url: record.url }), 'office', expect.objectContaining({ pid: process.pid }))
    expect(engine).toMatchObject({ baseUrl: record.url, username: 'redrob', password: 's3cret', pid: 4242 })
    expect(engine.isAlive()).toBe(true)
    expect(engineStatus()).toEqual({ status: 'running', baseUrl: record.url })
  })

  it('falls back to the bundled binary when no shared redrob is installed', async () => {
    resolveSharedRedrobBin.mockResolvedValue(undefined)
    await ensureEngine('/proj')
    // The bundled binary starts the SHARED daemon (via `service start`), never `serve`.
    expect(connectOrStart).toHaveBeenCalledWith('/app/build/redrob-code', expect.anything())
  })

  it('prefers an explicit bundled override in connectSharedEngine', async () => {
    resolveSharedRedrobBin.mockResolvedValue(undefined)
    const engine = await connectSharedEngine({ bundledBin: '/custom/redrob-code' })
    expect(connectOrStart).toHaveBeenCalledWith('/custom/redrob-code', expect.anything())
    await engine.close()
  })

  it('connects once and reuses the attachment', async () => {
    await ensureEngine('/proj')
    await ensureEngine('/other')
    expect(connectOrStart).toHaveBeenCalledTimes(1)
    expect(attach).toHaveBeenCalledTimes(1)
  })

  it('is single-flight: concurrent callers do not start two daemons', async () => {
    let release: (value: unknown) => void = () => {}
    connectOrStart.mockReturnValue(new Promise((resolve) => (release = resolve)))

    const a = ensureEngine('/proj')
    const b = ensureEngine('/proj')
    expect(engineStatus()).toEqual({ status: 'starting' })
    release(connection())
    await Promise.all([a, b])

    expect(connectOrStart).toHaveBeenCalledTimes(1)
    expect(attach).toHaveBeenCalledTimes(1)
  })

  it('reports a failure without caching it as permanent', async () => {
    connectOrStart.mockRejectedValueOnce(new Error('could not run redrob: ENOENT'))
    await expect(ensureEngine('/proj')).rejects.toThrow(/could not run/)
    expect(engineStatus()).toEqual({ status: 'failed', error: 'could not run redrob: ENOENT' })

    connectOrStart.mockResolvedValueOnce(connection(true))
    await ensureEngine('/proj')
    expect(engineStatus().status).toBe('running')
  })

  it('isAlive is a cached health check, and a dead daemon is reconnected', async () => {
    vi.useFakeTimers()
    try {
      const engine = await connectSharedEngine({ healthMs: 1000 })
      expect(engine.isAlive()).toBe(true)
      expect(daemonHealthy).not.toHaveBeenCalled()
      daemonHealthy.mockResolvedValue(false)
      await vi.advanceTimersByTimeAsync(1000)
      expect(daemonHealthy).toHaveBeenCalledWith(record, undefined)
      expect(engine.isAlive()).toBe(false)
      await engine.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reconnects when the attached daemon has stopped answering', async () => {
    const first = attachment()
    attach.mockResolvedValueOnce(first)
    const a = await ensureEngine('/proj')
    // Simulate the health probe having failed.
    ;(a as { isAlive: () => boolean }).isAlive = () => false
    await ensureEngine('/proj')
    expect(connectOrStart).toHaveBeenCalledTimes(2)
    // The stale attachment is let go before the new one is made.
    expect(first.detach).toHaveBeenCalled()
  })

  it('never exposes the engine credentials to the renderer', async () => {
    await ensureEngine('/proj')
    const status = JSON.stringify(engineStatus())
    expect(status).not.toContain('password')
    expect(status).not.toContain('s3cret')
  })

  it('teardown detaches and never stops the daemon', async () => {
    const att = attachment()
    attach.mockResolvedValue(att)
    await ensureEngine('/proj')
    await teardownEngine()
    expect(att.detach).toHaveBeenCalledTimes(1)
    expect(engineStatus()).toEqual({ status: 'stopped' })
    // Nothing in the lifecycle knows how to kill: the daemon's exit is its idle timer's job.
    expect(Object.keys(await import('../src/main/engine-lifecycle'))).not.toContain('stopDaemon')
  })

  it('close is idempotent', async () => {
    const att = attachment()
    attach.mockResolvedValue(att)
    const engine = await ensureEngine('/proj')
    await engine.close()
    await engine.close()
    expect(att.detach).toHaveBeenCalledTimes(1)
    expect(engine.isAlive()).toBe(false)
  })

  it('teardown waits for a connect in flight instead of leaving the attachment behind', async () => {
    const att = attachment()
    attach.mockResolvedValue(att)
    let release: (value: unknown) => void = () => {}
    connectOrStart.mockReturnValue(new Promise((resolve) => (release = resolve)))

    const pending = ensureEngine('/proj')
    const stopping = teardownEngine()
    release(connection())
    await Promise.all([pending, stopping])

    expect(att.detach).toHaveBeenCalled()
  })

  it('teardown is safe when nothing is attached', async () => {
    await expect(teardownEngine()).resolves.toBeUndefined()
  })

  it('resolves the dev binary path from the app path', () => {
    expect(engineBinaryPath()).toContain('/app/build/redrob-code')
  })
})
