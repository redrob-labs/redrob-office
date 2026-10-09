/**
 * The interface in Korean (packages/i18n SELECTABLE_LANGS): Home, Settings and
 * every editor open in Korean, and no English is left in their chrome. Text
 * inside the document itself (canvas pages, the editing surface) and names
 * that stay English by design (Redrob, PDF, file names, shortcuts) are not
 * chrome and are skipped. Korean chrome must also be drawable: a font stack
 * with no Hangul face draws it as boxes.
 *
 * Screenshots of each surface are attached for review; with
 * KOREAN_CHROME_SHOTS=<dir> they are also written there.
 */
import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { captureStable, closeShell, createFixtures, createProfile, launchShell, openDocument, runInView, sleep, waitForSelector, type FixtureKind, type ViewName } from '../src/harness'

const RUN = process.platform === 'linux' || process.env.VISUAL_LOCAL === '1'
test.skip(!RUN, 'measured against the Linux CI fonts; set VISUAL_LOCAL=1 to run on this OS')

const SHOTS = process.env.KOREAN_CHROME_SHOTS

/**
 * Runs in a view: visible chrome text with an English word in it. Document
 * content, code, and the allowed names are left out.
 */
const ENGLISH_LEFT = `(() => {
  const ALLOWED = /^(Redrob( AI| Auto| Console| Office| Docs| Sheets| Slides| PDF| Markdown| Hangul)?|PDF|HWP|HWPX|DOCX|XLSX|PPTX|CSV|Office|Alt Q|Ctrl\\+[A-Z0-9]+|⌘[A-Z0-9]+|F\\d+|OK|AI|URL|ID|[A-Z]{1,4}|[a-z]{1,2})$/
  const SKIP = '.hwp-page, .hwp-pages, .ProseMirror, .doc-page, .page-canvas, canvas, svg, code, pre, kbd, [contenteditable="true"], .recent-name, .file-name, .doc-tab__title, .go-titlebar__name, [data-i18n-skip], .univer-container, .konvajs-content, .pdf-page, .md-editor, .cm-content, .hangul-ai-panel .agent-message'
  const out = new Set()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement
    if (!el || el.closest(SKIP)) continue
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue
    const text = n.textContent.replace(/\\s+/g, ' ').trim()
    if (!text) continue
    // Korean copy may name Redrob, a model or a host; file names and extensions are not copy
    if (/[가-힣]/.test(text) || /^[^\\s]*\\.[A-Za-z0-9]{2,5}( \\.[A-Za-z0-9]{2,5})*$/.test(text)) continue
    // an English word of three letters or more, outside the allowed names
    const words = text.split(/[^A-Za-z+⌘]+/).filter((w) => /[a-z]{3,}/i.test(w))
    const left = words.filter((w) => !ALLOWED.test(w) && !ALLOWED.test(text))
    if (left.length) out.add(text.slice(0, 80))
  }
  for (const el of document.querySelectorAll('[aria-label], [placeholder], [title]')) {
    if (el.closest(SKIP)) continue
    for (const a of ['aria-label', 'placeholder', 'title']) {
      const v = (el.getAttribute(a) || '').trim()
      if (v && /[A-Za-z]{3,}/.test(v) && !/[가-힣]/.test(v) && !ALLOWED.test(v) && !/[\\/\\\\.]/.test(v)) out.add(a + ': ' + v.slice(0, 80))
    }
  }
  return [...out]
})()`

/** Runs in a view: Korean chrome text whose font cannot draw Hangul (it shows as boxes). */
const BOXES = `(() => {
  const SKIP = '.hwp-page, canvas, svg, [data-i18n-skip], .univer-container, .konvajs-content, .pdf-page'
  // Draw the character and the private-use .notdef in the element's font: the same pixels mean a box.
  const cv = document.createElement('canvas')
  cv.width = 48
  cv.height = 48
  const cx = cv.getContext('2d', { willReadFrequently: true })
  const pixels = (ch, font) => {
    cx.clearRect(0, 0, 48, 48)
    cx.font = font
    cx.fillStyle = '#000'
    cx.textBaseline = 'top'
    cx.fillText(ch, 4, 4)
    return cx.getImageData(0, 0, 48, 48).data.join(',')
  }
  const boxed = (text, cs) => {
    const c = [...text].find((ch) => /[가-힣]/.test(ch))
    if (c === undefined) return false
    const font = cs.fontStyle + ' ' + cs.fontWeight + ' 32px ' + cs.fontFamily
    return pixels(c, font) === pixels('\\uE000', font)
  }
  const out = new Set()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement
    if (!el || el.closest(SKIP) || !/[가-힣]/.test(n.textContent)) continue
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    if (boxed(n.textContent, getComputedStyle(el))) out.add(n.textContent.trim().slice(0, 60))
  }
  for (const el of document.querySelectorAll('textarea[placeholder], input[placeholder]')) {
    const v = el.getAttribute('placeholder')
    if (el.closest(SKIP) || !/[가-힣]/.test(v) || !el.getBoundingClientRect().width) continue
    if (boxed(v, getComputedStyle(el))) out.add('placeholder: ' + v.slice(0, 60))
  }
  return [...out]
})()`

async function shot(app: Parameters<typeof captureStable>[0], view: ViewName, name: string) {
  const png = await captureStable(app, view, { maxWaitMs: 8000 })
  await test.info().attach(name, { body: png, contentType: 'image/png' })
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true })
    writeFileSync(join(SHOTS, `${name}.png`), png)
  }
}

test('the interface in Korean has no English left in its chrome', async () => {
  test.setTimeout(400_000)
  const profile = createProfile({ name: 'korean-chrome', theme: 'light' })
  const docs = createFixtures('korean-chrome')
  const app = await launchShell(profile, { env: { GENOFFICE_LANG: 'ko' } })
  const found: string[] = []
  const check = async (view: ViewName, where: string) => {
    for (const t of await runInView<string[]>(app, view, ENGLISH_LEFT)) found.push(`${where}: ${t}`)
    for (const t of await runInView<string[]>(app, view, BOXES)) found.push(`${where}: drawn as boxes: ${t}`)
  }
  try {
    expect(await runInView<string>(app, 'shell', 'document.documentElement.lang')).toMatch(/^ko/)
    await sleep(800)
    await check('shell', 'Home')
    await shot(app, 'shell', 'ko-home')
    await runInView(app, 'shell', `document.querySelector('.account-btn').click(), true`)
    await waitForSelector(app, 'shell', '.set-overlay [role="dialog"]')
    await sleep(500)
    await check('shell', 'Settings')
    await shot(app, 'shell', 'ko-settings')
    await runInView(app, 'shell', `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })), true`)
    await waitForSelector(app, 'shell', '.set-overlay [role="dialog"]', { present: false })
    const editors: FixtureKind[] = ['docs', 'sheets', 'slides', 'pdf', 'markdown', 'hangul']
    for (const kind of editors) {
      await openDocument(app, kind, docs.files[kind])
      if (kind === 'hangul') await waitForSelector(app, kind, '.hwp-page canvas', { timeoutMs: 60_000 })
      await sleep(4000)
      await check(kind, kind)
      await shot(app, kind, `ko-${kind}`)
    }
  } finally {
    await closeShell(app)
  }
  expect(found, found.join('\n')).toEqual([])
})
