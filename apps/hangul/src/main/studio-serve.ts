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

let server: Server | null = null
let originUrl: string | null = null
let rootDir: string | null = null

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

/**
 * Start serving the studio directory from a loopback origin and return the
 * origin URL. Idempotent: repeated calls for the same directory return the same
 * running origin.
 */
export async function serveHangulStudio(studioDir: string): Promise<string> {
  if (server && originUrl && rootDir === resolve(studioDir)) return originUrl
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
      const target = request.url
        ? resolveRequest(root, request.url)
        : join(root, 'index.html')
      try {
        const info = await stat(target)
        const file = info.isFile() ? target : join(root, 'index.html')
        const size = info.isFile() ? info.size : (await stat(file)).size
        response.writeHead(200, {
          'content-type':
            CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
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
  if (!open) return
  open.closeAllConnections()
  await new Promise<void>((resolve_) => open.close(() => resolve_()))
}

/**
 * The request-resolution helper, exported for unit tests: proves a path that
 * climbs out of the root is redirected to the SPA entry rather than escaping.
 */
export { resolveRequest as __resolveRequestForTest }
