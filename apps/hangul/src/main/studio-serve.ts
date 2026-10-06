/**
 * Serve the self-hosted, offline rhwp-studio build over an app-local loopback
 * origin so the Hangul editor can iframe-embed it with no external network call.
 *
 * The @rhwp/editor SDK embeds rhwp-studio from an HTTP(S) origin and otherwise
 * defaults to the public CDN (https://edwardkim.github.io/rhwp/). GenOffice /
 * Redrob is offline-first and never touches that CDN, so we ship the studio
 * inside the app (apps/hangul/resources/rhwp-studio, built with
 * RHWP_DISABLE_EXTERNAL_WEBFONTS=1 so external webfont sources are dropped at
 * runtime) and hand the SDK a loopback URL that only exists on this machine and
 * only while the app is running. This is the same shape as the other editors'
 * asset protocols: bind to 127.0.0.1, serve a fixed directory, and refuse any
 * path that tries to escape it.
 *
 * This module is adapted from the prior branch's office/src/main/services/
 * hangul-studio-serve.ts; the serving contract is unchanged.
 */
import { createServer, type Server } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'

/** Media types the studio bundle serves (html/js/css/wasm/fonts/images). */
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
}

/** Path prefix of a print document held for one print or PDF job (see addPrintJob). */
export const PRINT_PREFIX = '/print-job/'

/** print documents waiting to be loaded, by id; each is served once its job has it */
const printJobs = new Map<string, string>()

/**
 * Holds a print document so a hidden window can load it from the studio
 * origin (fonts and images in the page SVGs then resolve as in the editor).
 * Returns the path to load; call the returned function when the job is done.
 */
export function addPrintJob(html: string): { path: string; done: () => void } {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  printJobs.set(id, html)
  return { path: `${PRINT_PREFIX}${id}.html`, done: () => void printJobs.delete(id) }
}

/** The held print document a request names, or null. */
function printJobFor(url: string): string | null {
  const path = new URL(url, 'http://127.0.0.1').pathname
  if (!path.startsWith(PRINT_PREFIX) || !path.endsWith('.html')) return null
  return printJobs.get(path.slice(PRINT_PREFIX.length, -'.html'.length)) ?? null
}

let server: Server | null = null
let originUrl: string | null = null
let rootDir: string | null = null
let hostRootDir: string | null = null

/**
 * The file a request maps to inside the studio root, or the SPA entry when the
 * request tries to climb out of it. The bare root and unknown deep links answer
 * with index.html so the studio's client router works.
 */
function resolveRequest(root: string, url: string): string {
  const path = decodeURIComponent(new URL(url, 'http://127.0.0.1').pathname)
  const cleaned = normalize(path).replace(/^(\.\.(\/|\\|$))+/, '')
  const target = resolve(root, `.${sep}${cleaned}`)
  const inside = target === root || target.startsWith(root + sep)
  if (!inside) return join(root, 'index.html')
  if (cleaned === '' || cleaned === sep || cleaned === '/') {
    return join(root, 'index.html')
  }
  return target
}

/** Path prefix the Hangul renderer itself is served under (see serveHangulStudio). */
export const HOST_PREFIX = '/host/'

/**
 * The file a /host/ request maps to inside the renderer bundle, or null when
 * the path climbs out of it. No SPA fallback: a missing renderer asset is a 404.
 */
function resolveHostRequest(hostRoot: string, url: string): string | null {
  const path = decodeURIComponent(new URL(url, 'http://127.0.0.1').pathname)
  if (!path.startsWith(HOST_PREFIX)) return null
  const rest = path.slice(HOST_PREFIX.length) || 'index.html'
  const target = resolve(hostRoot, `.${sep}${normalize(rest)}`)
  return target.startsWith(hostRoot + sep) ? target : null
}

/**
 * Start serving the studio directory from a loopback origin and return the
 * origin URL. Idempotent: repeated calls for the same directory return the same
 * running origin.
 *
 * `hostDir` also serves the built Hangul renderer under /host/. rhwp-studio
 * only accepts messages from an http(s) parent (its origin check rejects the
 * "null" origin a file:// page has), so a packaged build that loaded the
 * renderer with loadFile could embed the studio but never load a document.
 * Serving both from one loopback origin gives the parent an http origin and
 * makes the studio frame same-origin, so the renderer can also theme it.
 */
export async function serveHangulStudio(studioDir: string, hostDir?: string): Promise<string> {
  const hostRoot = hostDir ? resolve(hostDir) : null
  if (server && originUrl && rootDir === resolve(studioDir) && hostRootDir === hostRoot) {
    return originUrl
  }
  await stopHangulStudio()
  const root = resolve(studioDir)
  // Fail loudly if the bundle is missing rather than serving 404s the editor
  // would read as an empty studio.
  const index = await stat(join(root, 'index.html')).catch(() => null)
  if (!index || !index.isFile()) {
    throw new Error(`The rhwp-studio bundle is missing at ${join(root, 'index.html')}.`)
  }
  const next = createServer((request, response) => {
    void (async () => {
      if (request.url?.startsWith(PRINT_PREFIX)) {
        const html = printJobFor(request.url)
        if (html === null) {
          response.writeHead(404, { 'content-type': 'text/plain' })
          response.end('Not found')
          return
        }
        const body = Buffer.from(html, 'utf8')
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'content-length': String(body.byteLength),
          'cache-control': 'no-store',
          // the page is SVG and CSS only: nothing in it may run
          'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; script-src 'none'",
        })
        response.end(body)
        return
      }
      if (hostRoot && request.url?.startsWith(HOST_PREFIX)) {
        const file = resolveHostRequest(hostRoot, request.url)
        const info = file ? await stat(file).catch(() => null) : null
        if (!file || !info?.isFile()) {
          response.writeHead(404, { 'content-type': 'text/plain' })
          response.end('Not found')
          return
        }
        response.writeHead(200, {
          'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
          'content-length': String(info.size),
          'cache-control': 'no-store',
        })
        createReadStream(file).pipe(response)
        return
      }
      const target = request.url ? resolveRequest(root, request.url) : join(root, 'index.html')
      try {
        const info = await stat(target)
        const file = info.isFile() ? target : join(root, 'index.html')
        const size = info.isFile() ? info.size : (await stat(file)).size
        response.writeHead(200, {
          'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
          'content-length': String(size),
          'cache-control': 'no-store',
        })
        createReadStream(file).pipe(response)
      } catch {
        // Deep links fall through to the SPA entry so the studio can route.
        try {
          const fallback = join(root, 'index.html')
          const info = await stat(fallback)
          response.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'content-length': String(info.size),
            'cache-control': 'no-store',
          })
          createReadStream(fallback).pipe(response)
        } catch {
          response.writeHead(404, { 'content-type': 'text/plain' })
          response.end('Not found')
        }
      }
    })()
  })
  await new Promise<void>((resolve_, reject) => {
    next.once('error', reject)
    next.listen(0, '127.0.0.1', () => {
      next.removeListener('error', reject)
      resolve_()
    })
  })
  const address = next.address()
  if (!address || typeof address === 'string') {
    next.close()
    throw new Error('The studio server did not get a port.')
  }
  next.keepAliveTimeout = 1_000
  server = next
  rootDir = root
  hostRootDir = hostRoot
  originUrl = `http://127.0.0.1:${address.port}`
  return originUrl
}

/** The origin the studio is being served from, if it is running. */
export function hangulStudioOrigin(): string | null {
  return originUrl
}

/** Stop the studio server. Used on quit and by tests. */
export async function stopHangulStudio(): Promise<void> {
  const open = server
  server = null
  originUrl = null
  rootDir = null
  hostRootDir = null
  if (!open) return
  open.closeAllConnections()
  await new Promise<void>((resolve_) => open.close(() => resolve_()))
}

/**
 * The request-resolution helper, exported for unit tests: proves a path that
 * climbs out of the root is redirected to the SPA entry rather than escaping.
 */
export {
  resolveRequest as __resolveRequestForTest,
  resolveHostRequest as __resolveHostRequestForTest,
}
