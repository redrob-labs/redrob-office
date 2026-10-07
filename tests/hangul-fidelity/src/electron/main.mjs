// Electron entry for rendering Corpus pages through the same path the editor
// uses: the core's renderPageToCanvas in a Chromium renderer (design §10).
//
//   electron src/electron/main.mjs <job.json>
//
// job.json: { "dpi": 150, "items": [{ "id", "file", "password"?, "outDir" }] }
// Writes <outDir>/page-<n>.png for every page and <outDir>/render.json.
//
// Files are served through a private `fidelity:` scheme rather than file://,
// because Chromium refuses ES module imports between file:// URLs.
import { app, BrowserWindow, protocol } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = normalize(join(here, '../../../..'))
const jobPath = process.argv.find((a) => a.endsWith('.json'))
if (!jobPath) {
  console.error('usage: electron main.mjs <job.json>')
  process.exit(2)
}
const job = JSON.parse(readFileSync(jobPath, 'utf8'))

protocol.registerSchemesAsPrivileged([
  { scheme: 'fidelity', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
])

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.json': 'application/json' }

function inside(root, path) {
  const rel = relative(root, path)
  return rel && !rel.startsWith('..') && !isAbsolute(rel)
}

let failed = false

app.whenReady().then(async () => {
  protocol.handle('fidelity', async (req) => {
    const url = new URL(req.url)
    const parts = url.pathname.split('/').filter(Boolean)
    if (url.host === 'repo') {
      const path = normalize(join(repoRoot, ...parts.map(decodeURIComponent)))
      if (!inside(repoRoot, path)) return new Response('forbidden', { status: 403 })
      const ext = path.slice(path.lastIndexOf('.'))
      return new Response(readFileSync(path), { headers: { 'content-type': TYPES[ext] ?? 'application/octet-stream' } })
    }
    if (url.host === 'job') return Response.json({ dpi: job.dpi, scale: job.scale, keystrokes: job.keystrokes, items: job.items.map(({ id, password }) => ({ id, password })) })
    if (url.host === 'doc') return new Response(readFileSync(job.items[Number(parts[0])].file))
    if (url.host === 'page' && req.method === 'POST') {
      const item = job.items[Number(parts[0])]
      mkdirSync(item.outDir, { recursive: true })
      writeFileSync(join(item.outDir, `page-${parts[1]}.png`), Buffer.from(await req.arrayBuffer()))
      return new Response('ok')
    }
    if (url.host === 'meta' && req.method === 'POST') {
      const item = job.items[Number(parts[0])]
      mkdirSync(item.outDir, { recursive: true })
      writeFileSync(join(item.outDir, 'render.json'), Buffer.from(await req.arrayBuffer()))
      return new Response('ok')
    }
    if (url.host === 'log' && req.method === 'POST') {
      const text = await req.text()
      if (text.startsWith('ERROR')) failed = true
      console.log(text)
      return new Response('ok')
    }
    if (url.host === 'done') {
      setImmediate(() => app.exit(failed ? 1 : 0))
      return new Response('ok')
    }
    return new Response('not found', { status: 404 })
  })

  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true },
  })
  await win.loadURL(`fidelity://repo/tests/hangul-fidelity/src/electron/${job.page ?? 'render'}.html`)
})

app.on('window-all-closed', () => app.exit(failed ? 1 : 0))
