import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  __resolveHostRequestForTest as resolveHostRequest,
  HOST_PREFIX,
  serveHangulStudio,
  stopHangulStudio,
} from '../src/main/studio-serve'

async function makeDir(prefix: string, files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  for (const [name, body] of Object.entries(files)) {
    const parts = name.split('/')
    if (parts.length > 1) await mkdir(join(dir, ...parts.slice(0, -1)), { recursive: true })
    await writeFile(join(dir, ...parts), body)
  }
  return dir
}

describe('the renderer served beside the studio (/host/)', () => {
  const dirs: string[] = []
  afterEach(async () => {
    await stopHangulStudio()
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('serves the renderer under /host/ from the same loopback origin as the studio', async () => {
    const studio = await makeDir('hangul-studio-', { 'index.html': '<title>studio</title>' })
    const host = await makeDir('hangul-host-', {
      'index.html': '<title>host</title>',
      'assets/app.js': 'export const host = 1',
    })
    dirs.push(studio, host)
    const origin = await serveHangulStudio(studio, host)
    // an http parent: rhwp-studio rejects messages from a file:// ("null") origin
    expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    const page = await fetch(`${origin}${HOST_PREFIX}index.html`)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('host')
    const asset = await fetch(`${origin}${HOST_PREFIX}assets/app.js`)
    expect(asset.headers.get('content-type')).toContain('javascript')
    // the studio still answers at the root
    expect(await (await fetch(`${origin}/`)).text()).toContain('studio')
  })

  it('answers 404 for a missing renderer asset instead of the studio SPA entry', async () => {
    const studio = await makeDir('hangul-studio-', { 'index.html': '<title>studio</title>' })
    const host = await makeDir('hangul-host-', { 'index.html': '<title>host</title>' })
    dirs.push(studio, host)
    const origin = await serveHangulStudio(studio, host)
    expect((await fetch(`${origin}${HOST_PREFIX}missing.js`)).status).toBe(404)
  })

  it('never resolves a /host/ path outside the renderer directory', () => {
    const root = join(tmpdir(), 'host-root')
    expect(resolveHostRequest(root, '/host/index.html')).toBe(join(root, 'index.html'))
    expect(resolveHostRequest(root, '/host/../secret.txt')).toBeNull()
    expect(resolveHostRequest(root, '/host/%2e%2e/secret.txt')).toBeNull()
    expect(resolveHostRequest(root, '/elsewhere/index.html')).toBeNull()
  })

  it('without a renderer directory, /host/ is just a studio deep link', async () => {
    const studio = await makeDir('hangul-studio-', { 'index.html': '<title>studio</title>' })
    dirs.push(studio)
    const origin = await serveHangulStudio(studio)
    expect(await (await fetch(`${origin}${HOST_PREFIX}index.html`)).text()).toContain('studio')
  })
})
