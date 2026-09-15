import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  __resolveRequestForTest as resolveRequest,
  hangulStudioOrigin,
  serveHangulStudio,
  stopHangulStudio,
} from '../src/main/studio-serve'

async function makeStudioDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'hangul-studio-'))
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>studio</title>')
  await mkdir(join(dir, 'assets'))
  await writeFile(join(dir, 'assets', 'app.js'), 'export const x = 1')
  return dir
}

describe('serveHangulStudio', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await stopHangulStudio()
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('serves the studio index and assets from a loopback origin (never a CDN)', async () => {
    const dir = await makeStudioDir()
    dirs.push(dir)
    const origin = await serveHangulStudio(dir)
    // The origin must be a local loopback URL, not an external host.
    expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(hangulStudioOrigin()).toBe(origin)

    const index = await fetch(`${origin}/`)
    expect(index.status).toBe(200)
    expect(await index.text()).toContain('studio')

    const asset = await fetch(`${origin}/assets/app.js`)
    expect(asset.status).toBe(200)
    expect(asset.headers.get('content-type')).toContain('text/javascript')
  })

  it('is idempotent for the same directory', async () => {
    const dir = await makeStudioDir()
    dirs.push(dir)
    const a = await serveHangulStudio(dir)
    const b = await serveHangulStudio(dir)
    expect(a).toBe(b)
  })

  it('falls back to the SPA entry for unknown deep links', async () => {
    const dir = await makeStudioDir()
    dirs.push(dir)
    const origin = await serveHangulStudio(dir)
    const deep = await fetch(`${origin}/does/not/exist`)
    expect(deep.status).toBe(200)
    expect(await deep.text()).toContain('studio')
  })

  it('throws when the studio bundle is missing', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'hangul-empty-'))
    dirs.push(empty)
    await expect(serveHangulStudio(empty)).rejects.toThrow(/missing/)
  })
})

describe('resolveRequest', () => {
  it('never resolves a traversal attempt to a path outside the studio root', () => {
    const root = '/srv/studio'
    // URL parsing collapses ../ before we see it, and normalize strips any
    // remaining leading ../, so the resolved target always stays under root
    // (or falls back to the SPA entry). It must never escape the root.
    for (const url of [
      'http://127.0.0.1/../../etc/passwd',
      'http://127.0.0.1/..%2f..%2fetc/passwd',
      'http://127.0.0.1/assets/../../../../etc/passwd',
    ]) {
      const resolved = resolveRequest(root, url)
      const inside = resolved === join(root, 'index.html') || resolved.startsWith(root + '/')
      expect(inside).toBe(true)
    }
  })

  it('maps a normal path inside the root', () => {
    const root = '/srv/studio'
    expect(resolveRequest(root, 'http://127.0.0.1/assets/app.js')).toBe(
      join(root, 'assets', 'app.js'),
    )
  })
})
