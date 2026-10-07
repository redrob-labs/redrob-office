#!/usr/bin/env node
/**
 * pnpm check:ipc: Docs' and Slides' IPC contracts are checkable.
 *
 * Their preload and main process name every channel through one constant map
 * in src/shared/ipc.ts (DOCS_CHANNELS, SLIDES_CHANNELS), so a typo'd name is a
 * type error. This script checks what the type checker cannot:
 *
 *   1. no IPC call in those preloads or mains spells a channel as a string;
 *   2. every channel a preload invokes or sends has a handler somewhere on the
 *      main side (the app's own main, the shell's main, or a package);
 *   3. every channel a preload listens to is sent by something on the main side;
 *   4. every name a preload or main uses exists in its map.
 *
 * Channel maps are read from every `export const *_CHANNELS = { key: 'value' }`
 * in apps and packages, so a handler registered as SHARE_CHANNELS.status or
 * HOME_CHANNELS.recents resolves to its string.
 *
 * `node scripts/check-ipc.mjs --self-test` proves a typo'd channel fails it.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const CHECKED = { docs: 'DOCS_CHANNELS', slides: 'SLIDES_CHANNELS' }

const CALL_LITERAL =
  /\.(invoke|send|sendSync|sendTo|on|once|handle|handleOnce|removeListener|removeHandler|removeAllListeners|off)\(\s*'([a-z][a-z0-9-]*:[A-Za-z0-9:_-]+)'/g
const CALL_ANY =
  /\.(invoke|send|sendSync|on|once|handle|handleOnce)\(\s*(?:'([a-z][a-z0-9-]*:[A-Za-z0-9:_-]+)'|([A-Z][A-Z0-9_]*)\.([A-Za-z_$][\w$]*))/g
const MAP_DECL = /export\s+const\s+([A-Z][A-Z0-9_]*)\s*=\s*\{([\s\S]*?)\}\s*(?:as\s+const)?/g
const MAP_ENTRY = /(?:^|[\s,{])([A-Za-z_$][\w$]*)\s*:\s*'([^'\n]+)'/g

const lineOf = (src, index) => src.slice(0, index).split('\n').length

/** files: Map<relative posix path, contents> */
export function checkIpc(files) {
  const errors = []
  // every channel map in the repo: NAME -> key -> value
  const maps = new Map()
  for (const [file, src] of files) {
    if (!/^(apps|packages)\/[^/]+\/src\//.test(file)) continue
    for (const m of src.matchAll(MAP_DECL)) {
      if (!m[1].endsWith('CHANNELS')) continue
      const entries = new Map()
      for (const e of m[2].matchAll(MAP_ENTRY)) entries.set(e[1], e[2])
      if (!maps.has(m[1])) maps.set(m[1], entries)
      else for (const [k, v] of entries) maps.get(m[1]).set(k, v)
    }
  }
  const resolve = (literal, mapName, key) => (literal ? literal : maps.get(mapName)?.get(key))

  // the main side: what is handled, and what is sent to renderers
  const handled = new Set()
  const sent = new Set()
  const isMainSide = (file) =>
    /^apps\/[^/]+\/src\/main\//.test(file) ||
    (/^packages\/[^/]+\/src\//.test(file) && !/(^|\/)(bridge|preload)[^/]*\.ts$/.test(file) && !/\/renderer\//.test(file))
  for (const [file, src] of files) {
    if (!isMainSide(file)) continue
    for (const m of src.matchAll(CALL_ANY)) {
      const value = resolve(m[2], m[3], m[4])
      if (!value) continue
      if (m[1] === 'send' || m[1] === 'sendSync') sent.add(value)
      else if (m[1] === 'handle' || m[1] === 'handleOnce' || m[1] === 'on' || m[1] === 'once') handled.add(value)
    }
  }

  for (const [app, MAP] of Object.entries(CHECKED)) {
    const map = maps.get(MAP)
    if (!map) {
      errors.push(`apps/${app}/src/shared/ipc.ts: no ${MAP} map`)
      continue
    }
    const own = [...files.keys()].filter((f) => f.startsWith(`apps/${app}/src/preload/`) || f.startsWith(`apps/${app}/src/main/`))
    for (const file of own) {
      const src = files.get(file)
      for (const m of src.matchAll(CALL_LITERAL)) {
        errors.push(`${file}:${lineOf(src, m.index)}: channel '${m[2]}' is spelled as a string; use ${MAP} from src/shared/ipc.ts`)
      }
      for (const m of src.matchAll(new RegExp(`\\b${MAP}\\.([A-Za-z_$][\\w$]*)`, 'g'))) {
        if (!map.has(m[1])) errors.push(`${file}:${lineOf(src, m.index)}: ${MAP}.${m[1]} is not in the map`)
      }
      if (!file.startsWith(`apps/${app}/src/preload/`)) continue
      for (const m of src.matchAll(CALL_ANY)) {
        if (m[3] && m[3] !== MAP) continue // other maps (SHARE_CHANNELS…) are their packages' contracts
        const value = resolve(m[2], m[3], m[4])
        if (!value) continue
        const where = `${file}:${lineOf(src, m.index)}`
        if ((m[1] === 'invoke' || m[1] === 'send' || m[1] === 'sendSync') && !handled.has(value)) {
          errors.push(`${where}: '${value}' is ${m[1] === 'invoke' ? 'invoked' : 'sent'} but nothing on the main side handles it`)
        }
        if ((m[1] === 'on' || m[1] === 'once') && !sent.has(value)) {
          errors.push(`${where}: '${value}' is listened to but nothing on the main side sends it`)
        }
      }
    }
  }
  return errors
}

function readTree(root) {
  const files = new Map()
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'out' || e.name === 'dist' || e.name.startsWith('.')) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(ts|tsx|mts|cts)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
        files.set(path.relative(root, p).replace(/\\/g, '/'), fs.readFileSync(p, 'utf8'))
      }
    }
  }
  for (const top of ['apps', 'packages']) {
    for (const pkg of fs.readdirSync(path.join(root, top), { withFileTypes: true })) {
      const src = path.join(root, top, pkg.name, 'src')
      if (pkg.isDirectory() && fs.existsSync(src)) walk(src)
    }
  }
  return files
}

function selfTest() {
  const tree = (preload) =>
    new Map([
      ['apps/docs/src/shared/ipc.ts', "export const DOCS_CHANNELS = {\n  save: 'docs:save',\n  opened: 'docs:opened',\n} as const\n"],
      ['apps/docs/src/main/docs-main.ts', "ipcMain.handle(DOCS_CHANNELS.save, () => 1)\nwin.webContents.send(DOCS_CHANNELS.opened, 1)\n"],
      ['apps/docs/src/preload/index.ts', preload],
      ['apps/slides/src/shared/ipc.ts', "export const SLIDES_CHANNELS = {\n  open: 'slides:open',\n} as const\n"],
      ['apps/slides/src/main/slides-main.ts', "ipcMain.handle(SLIDES_CHANNELS.open, () => 1)\n"],
      ['apps/slides/src/preload/index.ts', "ipcRenderer.invoke(SLIDES_CHANNELS.open)\n"],
    ])
  const good = checkIpc(tree("ipcRenderer.invoke(DOCS_CHANNELS.save)\nipcRenderer.on(DOCS_CHANNELS.opened, f)\n"))
  const literal = checkIpc(tree("ipcRenderer.invoke('docs:save')\n"))
  const typoKey = checkIpc(tree('ipcRenderer.invoke(DOCS_CHANNELS.sav)\n'))
  const unhandled = checkIpc(
    new Map([...tree('ipcRenderer.invoke(DOCS_CHANNELS.save)\n')].map(([f, s]) =>
      f.endsWith('ipc.ts') && f.includes('docs') ? [f, s.replace("'docs:save'", "'docs:svae'")] : [f, s.replace('DOCS_CHANNELS.save', "DOCS_CHANNELS.save")],
    )).set('apps/docs/src/main/docs-main.ts', "ipcMain.handle('docs:save', () => 1)\nwin.webContents.send(DOCS_CHANNELS.opened, 1)\n"),
  )
  const unsent = checkIpc(tree('ipcRenderer.on(DOCS_CHANNELS.save, f)\n'))
  const cases = [
    ['a correct contract passes', good.length === 0, good],
    ['a channel spelled as a string fails', literal.some((e) => e.includes("'docs:save' is spelled as a string")), literal],
    ["a typo'd name fails", typoKey.some((e) => e.includes('DOCS_CHANNELS.sav is not in the map')), typoKey],
    ["a typo'd channel value fails (no handler)", unhandled.some((e) => e.includes("'docs:svae' is invoked but nothing")), unhandled],
    ['a listener nobody sends to fails', unsent.some((e) => e.includes('is listened to but nothing')), unsent],
  ]
  let ok = true
  for (const [name, pass, errs] of cases) {
    console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}`)
    if (!pass) {
      ok = false
      for (const e of errs) console.log(`       ${e}`)
    }
  }
  return ok
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1)
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const errors = checkIpc(readTree(root))
  if (errors.length) {
    console.error(`IPC contracts: ${errors.length} problem${errors.length === 1 ? '' : 's'}`)
    for (const e of errors) console.error(`  ${e}`)
    process.exit(1)
  }
  console.log(`IPC contracts: every ${Object.values(CHECKED).join(' and ')} channel is declared and has its other end.`)
}
