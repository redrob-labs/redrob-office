/**
 * Drives the built Redrob Office shell for screenshot tests.
 *
 * The shell is one BrowserWindow (tab strip + Home) with each editor tab as a
 * WebContentsView child. BrowserWindow.capturePage only paints the window's own
 * webContents, so every capture here targets one webContents directly, found
 * by its renderer URL: the shell page for Home / Settings / onboarding / the
 * tab strip, and the editor's own view for an editor.
 *
 * Everything that would make two runs differ is pinned or hidden:
 *   - a fresh profile per launch (GENOFFICE_USER_DATA) seeded with language,
 *     theme, onboarding and star-prompt state, so no first-run card appears;
 *   - GENOFFICE_LANG=en and a forced device scale factor of 1;
 *   - fixtures copied into a temp folder, so titles and recents are stable;
 *   - animations, transitions and the text caret switched off;
 *   - the clock-dependent greeting and file timestamps on Home hidden.
 * A capture is only taken once two consecutive frames are identical.
 */
import { _electron as electron, type ElectronApplication } from '@playwright/test'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Theme = 'light' | 'dark'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const SHELL_DIR = join(REPO_ROOT, 'apps/shell')
const FIXTURES_DIR = join(REPO_ROOT, 'tests/visual/fixtures')

/** URL fragments identifying each webContents (file URLs use forward slashes on every OS) */
export const VIEW = {
  shell: '/apps/shell/out/renderer/index.html',
  docs: '/apps/docs/out/renderer/index.html',
  sheets: '/apps/sheets/out/renderer/index.html',
  slides: '/apps/slides/out/renderer/index.html',
  pdf: '/apps/pdf/out/renderer/index.html',
  markdown: '/apps/markdown/out/renderer/index.html',
  // served over the rhwp-studio loopback origin (http://127.0.0.1:*/host/), not file://
  hangul: '/host/index.html',
} as const
export type ViewName = keyof typeof VIEW

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Must match TAB_STRIP_HEIGHT in apps/shell/src/main/tab-manager.ts. */
export const TAB_STRIP_HEIGHT = 40

/** Rules applied to every captured surface. */
const FREEZE_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition: none !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}
`

/**
 * Per-view text that changes between runs, hidden (layout kept) before capture:
 * the shell's clock-driven greeting and file times, Sheets' status line (names
 * the per-session temp workbook a CSV is converted into), Slides' status
 * message (names the fixture's absolute path).
 */
const MASKS: Partial<Record<ViewName, string>> = {
  shell: '.hero-title, .recent-time, .cloud-row-time',
  sheets: '.workbook-status, .status-msg',
  slides: '.status-msg',
}

/** Per-view selector that exists once the document has loaded, where first paint is not enough. */
export const READY: Partial<Record<ViewName, string>> = {
  // Hangul would wait for '.hangul-save-button:not([disabled])' (Save enables once
  // the fixture is loaded), but in a built app the fixture never loads: the host
  // page is file:// (origin "null") and rhwp-studio only accepts the embed
  // handshake from an http(s) parent, so createEditor never resolves. Until that
  // is fixed the baseline records the blank studio it shows instead.
}

const cssFor = (view: ViewName): string => {
  const mask = MASKS[view]
  return mask ? `${FREEZE_CSS}\n${mask} { visibility: hidden !important; }\n` : FREEZE_CSS
}

/**
 * Errors from idempotent main-process calls that succeed when repeated:
 * app.evaluate's "Resulting promise was garbage collected" while the main
 * process is busy creating a view, and capturePage's UnknownVizError while a
 * freshly mapped window's compositor frame is not ready yet (seen under Xvfb).
 */
const TRANSIENT = ['garbage collected', 'UnknownVizError']

async function retryGc<R>(call: () => Promise<R>): Promise<R> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call()
    } catch (err) {
      if (attempt >= 4 || !TRANSIENT.some((t) => String(err).includes(t))) throw err
      await sleep(500)
    }
  }
}

const shellVersion = (): string =>
  (JSON.parse(readFileSync(join(SHELL_DIR, 'package.json'), 'utf8')) as { version: string }).version

/** The Electron binary the shell itself depends on, resolved through pnpm's layout. */
function electronBinary(): string {
  const require = createRequire(join(SHELL_DIR, 'package.json'))
  return require('electron') as unknown as string
}

/**
 * Scratch folders live at fixed paths rather than mkdtemp names: Settings shows
 * the default save folder's full path, so a random suffix would change every
 * screenshot of it. Each folder is wiped before use.
 */
function freshDir(name: string): string {
  const dir = join(tmpdir(), 'redrob-visual', name)
  removeDir(dir)
  mkdirSync(dir, { recursive: true })
  return dir
}

export interface ProfileOptions {
  /** unique per launch in a run, e.g. "light" or "onboarding-dark" */
  name: string
  theme: Theme
  onboardingSeen?: boolean
}

/** A throwaway userData folder with every first-run prompt already answered. */
export function createProfile({ name, theme, onboardingSeen = true }: ProfileOptions): string {
  const dir = freshDir(`profile-${name}`)
  const settings = {
    language: 'en',
    theme,
    analyticsEnabled: false,
    onboardingSeen,
    // matching version + resolved prompt: neither the upgrade path nor the
    // value gates can show the star card
    lastRunVersion: shellVersion(),
    updateChannel: 'stable',
    starPrompt: { firstRunAt: 0, resolved: true },
    // new/untitled files must never land in the real Documents folder
    defaultSaveDir: join(dir, 'documents'),
  }
  mkdirSync(join(dir, 'documents'))
  writeFileSync(join(dir, 'app-settings.json'), JSON.stringify(settings, null, 2))
  return dir
}

/**
 * A one-page PDF built byte by byte, so no generator dependency is needed and
 * the file is identical on every run. The repository's committed PDFs are all
 * encrypted or deliberately corrupt.
 */
function minimalPdf(): Buffer {
  const content =
    'BT /F1 28 Tf 72 720 Td (Redrob Office visual fixture) Tj ET\n' +
    'BT /F1 14 Tf 72 680 Td (A one-page PDF for the screenshot suite.) Tj ET\n'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'))
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xrefAt = Buffer.byteLength(body, 'latin1')
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

export type FixtureKind = Exclude<ViewName, 'shell'>

/** Copies one document per editor into a fresh folder; returns absolute paths. */
export function createFixtures(name: string): { dir: string; files: Record<FixtureKind, string> } {
  const dir = freshDir(`docs-${name}`)
  const sources: Record<Exclude<FixtureKind, 'pdf'>, [string, string]> = {
    docs: [join(REPO_ROOT, 'fixtures/generated/kitchen-sink.docx'), 'Report.docx'],
    sheets: [join(FIXTURES_DIR, 'sample.csv'), 'Regions.csv'],
    slides: [join(REPO_ROOT, 'packages/pptx-engine/tests/fixtures/01_standard_business.pptx'), 'Deck.pptx'],
    markdown: [join(FIXTURES_DIR, 'sample.md'), 'Notes.md'],
    hangul: [join(REPO_ROOT, 'apps/hangul/tests/fixtures/sample.hwpx'), 'Hangul.hwpx'],
  }
  const files = {} as Record<FixtureKind, string>
  for (const [kind, [src, name]] of Object.entries(sources) as [FixtureKind, [string, string]][]) {
    files[kind] = join(dir, name)
    copyFileSync(src, files[kind])
  }
  files.pdf = join(dir, 'Brief.pdf')
  writeFileSync(files.pdf, minimalPdf())
  return { dir, files }
}

export function removeDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

/** Environment variables that would point a renderer at a dev server or change identity. */
const STRIPPED_ENV = [
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_RENDERER_URL',
  'DOCS_RENDERER_URL',
  'SHEETS_RENDERER_URL',
  'SLIDES_RENDERER_URL',
  'PDF_RENDERER_URL',
  'MARKDOWN_RENDERER_URL',
  'HANGUL_RENDERER_URL',
  'GENOFFICE_FAKE_UPDATE',
  'GENOFFICE_FORCE_STAR_PROMPT',
  'XLSX_DEBUG_PORT',
  'XLSX_OPEN_PATH',
]

export async function launchShell(
  profileDir: string,
  { launchScreen = false }: { launchScreen?: boolean } = {},
): Promise<ElectronApplication> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !STRIPPED_ENV.includes(k)) env[k] = v
  }
  env.GENOFFICE_USER_DATA = profileDir
  env.GENOFFICE_LANG = 'en'
  // the launch screen plays once a session; every capture but its own skips it
  if (launchScreen) delete env.GENOFFICE_LAUNCH
  else env.GENOFFICE_LAUNCH = 'skip'
  const app = await electron.launch({
    executablePath: electronBinary(),
    args: ['--force-device-scale-factor=1', SHELL_DIR],
    cwd: SHELL_DIR,
    env,
    timeout: 60_000,
  })
  await waitForView(app, 'shell')
  return app
}

/** Waits until a webContents for the view exists and has finished loading. */
export async function waitForView(app: ElectronApplication, view: ViewName, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ready = await retryGc(() =>
      app.evaluate(({ webContents }, part) => {
        const wc = webContents.getAllWebContents().find((w) => w.getURL().includes(part))
        return !!wc && !wc.isLoading()
      }, VIEW[view]),
    )
    if (ready) return
    await sleep(250)
  }
  throw new Error(`timed out waiting for the ${view} view to load`)
}

/** Runs a script in the view's main frame and returns its (JSON-serialisable) result. */
export async function runInView<T>(app: ElectronApplication, view: ViewName, script: string): Promise<T> {
  return (await retryGc(() =>
    app.evaluate(async ({ webContents }, [part, code]) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().includes(part))
      if (!wc) throw new Error(`no webContents for ${part}`)
      return wc.executeJavaScript(code, true)
    }, [VIEW[view], script] as const),
  )) as T
}

/**
 * Turns off motion and the caret in the view and all its frames, and hides the
 * view's run-to-run text (MASKS). Waits for the view's READY selector first.
 */
export async function freeze(app: ElectronApplication, view: ViewName): Promise<void> {
  const ready = READY[view]
  if (ready) await waitForSelector(app, view, ready, { timeoutMs: 45_000 })
  const css = cssFor(view)
  await app.evaluate(async ({ webContents }, [part, rules]) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().includes(part))
    if (!wc) throw new Error(`no webContents for ${part}`)
    // insertCSS is not subject to the page's CSP; it covers the main frame
    await wc.insertCSS(rules, { cssOrigin: 'author' })
    // subframes (rhwp-studio is an iframe) get the same rules through a style element
    const inject = `(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(rules)}; document.documentElement.appendChild(s); return true })()`
    for (const frame of wc.mainFrame.framesInSubtree) {
      if (frame === wc.mainFrame) continue
      try {
        await frame.executeJavaScript(inject, true)
      } catch {
        // a frame mid-navigation or behind a CSP is captured unfrozen
      }
    }
  }, [VIEW[view], css] as const)
}

async function capture(app: ElectronApplication, view: ViewName, rect?: Rect): Promise<string> {
  return retryGc(() =>
    app.evaluate(async ({ webContents }, [part, r]) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().includes(part))
      if (!wc) throw new Error(`no webContents for ${part}`)
      const image = r ? await wc.capturePage(r) : await wc.capturePage()
      return image.toPNG().toString('base64')
    }, [VIEW[view], rect ?? null] as const),
  )
}

/**
 * Captures the view once it has stopped changing: fonts loaded, then two
 * consecutive frames identical. A view that never settles (a live spinner)
 * returns its latest frame and leaves the verdict to the comparison.
 */
export async function captureStable(
  app: ElectronApplication,
  view: ViewName,
  { rect, settleMs = 400, maxWaitMs = 20_000 }: { rect?: Rect; settleMs?: number; maxWaitMs?: number } = {},
): Promise<Buffer> {
  await runInView(app, view, 'document.fonts.ready.then(() => true)')
  const deadline = Date.now() + maxWaitMs
  let previous = await capture(app, view, rect)
  while (Date.now() < deadline) {
    await sleep(settleMs)
    const next = await capture(app, view, rect)
    if (next === previous && next.length > 0) return Buffer.from(next, 'base64')
    previous = next
  }
  return Buffer.from(previous, 'base64')
}

export interface TabSummary {
  id: string
  kind: string
  title: string
  active: boolean
}

export const listTabs = (app: ElectronApplication): Promise<TabSummary[]> =>
  runInView<TabSummary[]>(app, 'shell', 'window.aiOfficeTabs.list()')

/** Opens a document through the same route Home's recent list and File > Open use. */
export async function openDocument(app: ElectronApplication, kind: FixtureKind, path: string): Promise<void> {
  await runInView(app, 'shell', `window.aiOffice.openPath(${JSON.stringify(path)}).then(() => true)`)
  await waitForView(app, kind)
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const tabs = await listTabs(app)
    if (tabs.some((t) => t.active && t.kind === kind)) return
    await sleep(200)
  }
  throw new Error(`the ${kind} tab never became active`)
}

export const activateTab = (app: ElectronApplication, id: string): Promise<unknown> =>
  runInView(app, 'shell', `window.aiOfficeTabs.activate(${JSON.stringify(id)}).then(() => true)`)

/** Waits for a selector to appear (or disappear) in the view. */
export async function waitForSelector(
  app: ElectronApplication,
  view: ViewName,
  selector: string,
  { present = true, timeoutMs = 15_000 }: { present?: boolean; timeoutMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const probe = `!!document.querySelector(${JSON.stringify(selector)})`
  while (Date.now() < deadline) {
    if ((await runInView<boolean>(app, view, probe)) === present) return
    await sleep(150)
  }
  throw new Error(`${selector} ${present ? 'never appeared' : 'never went away'} in the ${view} view`)
}

/** Closes the app without letting an unsaved-changes prompt hold the process open. */
export async function closeShell(app: ElectronApplication): Promise<void> {
  try {
    await app.evaluate(({ app: electronApp }) => {
      setTimeout(() => electronApp.exit(0), 50)
    })
  } catch {
    // the process may already be gone
  }
  await app.close().catch(() => {})
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
