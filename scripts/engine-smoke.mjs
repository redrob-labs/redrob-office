#!/usr/bin/env node
/**
 * Smoke test against a real `redrob-code` engine.
 *
 * Starts the engine the same way apps/shell/src/main/managed-engine.ts does (loopback,
 * per-spawn Basic credentials, readiness line on stdout), probes the routes Office
 * depends on, prints what each one returned, and stops the engine.
 *
 * It never prints the minted password or any credential the engine reports. It exits 0
 * with a "skipped" line when no binary is found, so it is safe to run anywhere.
 *
 *   node scripts/engine-smoke.mjs [--binary <path>] [--dump <dir>]
 *
 * --dump writes each JSON body to <dir>/<route>.json, for docs/engine-api.md.
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const READY = 'redrob server listening'
const exe = process.platform === 'win32' ? 'redrob-code.exe' : 'redrob-code'

function arg(name) {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}

function findBinary() {
  const candidates = [
    arg('--binary'),
    process.env.REDROB_ENGINE_BINARY,
    join(process.cwd(), 'apps', 'shell', 'build', exe),
    process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Redrob', 'bin', exe)
      : join(homedir(), '.redrob', 'bin', exe),
  ].filter(Boolean)
  return candidates.find((p) => existsSync(p))
}

const secret = () => randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')

async function start(binary, cwd) {
  const username = secret()
  const password = secret()
  const child = spawn(binary, ['serve', '--hostname', '127.0.0.1', '--port', '0'], {
    cwd,
    env: { ...process.env, REDROB_SERVER_USERNAME: username, REDROB_SERVER_PASSWORD: password },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const baseUrl = await new Promise((resolve, reject) => {
    let out = ''
    const timer = setTimeout(() => reject(new Error(`no ready line in 20s:\n${out}`)), 20000)
    child.stdout.on('data', (c) => {
      out += String(c)
      const line = out.split('\n').find((l) => l.startsWith(READY))
      const m = line && /on\s+(https?:\/\/[^\s]+)/.exec(line)
      if (m) {
        clearTimeout(timer)
        resolve(m[1])
      }
    })
    child.stderr.on('data', (c) => (out += String(c)))
    child.once('close', (code) => {
      clearTimeout(timer)
      reject(new Error(`engine exited ${code}:\n${out}`))
    })
  })
  return { child, baseUrl, auth: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` }
}

/** Drop anything that looks like a secret before printing or dumping. */
function redact(value) {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = /key|secret|token|password|credential/i.test(k) && typeof v === 'string' ? '<redacted>' : redact(v)
    }
    return out
  }
  return value
}

// The routes Office depends on (docs/engine-api.md). /v1/models is probed to record that the
// engine is not an OpenAI-compatible proxy: it answers 404.
const ROUTES = [
  ['GET', '/global/health'],
  ['GET', '/api/model'],
  ['GET', '/api/integration'],
  ['GET', '/api/integration'],
  ['GET', '/provider/auth'],
  ['GET', '/v1/models'],
  ['GET', '/doc'],
]

async function main() {
  const binary = findBinary()
  if (!binary) {
    console.log('engine-smoke: skipped (no redrob-code binary found)')
    return
  }
  const dump = arg('--dump')
  if (dump) mkdirSync(dump, { recursive: true })
  const cwd = join(tmpdir(), `engine-smoke-${process.pid}`)
  mkdirSync(cwd, { recursive: true })
  const { child, baseUrl, auth } = await start(binary, cwd)
  console.log(`engine-smoke: ready at ${baseUrl}`)
  let failed = 0
  try {
    const unauth = await fetch(`${baseUrl}/v1/models`)
    console.log(`  unauthenticated GET /v1/models -> ${unauth.status}`)
    for (const [method, path] of ROUTES) {
      try {
        const r = await fetch(`${baseUrl}${path}`, { method, headers: { authorization: auth } })
        const text = await r.text()
        let body = text
        try {
          body = redact(JSON.parse(text))
        } catch {
          /* not JSON */
        }
        const summary = typeof body === 'string' ? body.slice(0, 120) : JSON.stringify(body).slice(0, 200)
        console.log(`  ${method} ${path} -> ${r.status} ${summary}`)
        if (dump && typeof body !== 'string') {
          writeFileSync(join(dump, `${path.replace(/\W+/g, '_').replace(/^_/, '') || 'root'}.json`), JSON.stringify(body, null, 2))
        }
      } catch (e) {
        failed++
        console.log(`  ${method} ${path} -> error ${e.message}`)
      }
    }
  } finally {
    child.kill('SIGTERM')
  }
  if (failed) process.exitCode = 1
}

main().catch((e) => {
  console.error(`engine-smoke: ${e.message}`)
  process.exitCode = 1
})
