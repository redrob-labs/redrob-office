/**
 * Layout checks for the Hangul editor's chrome, measured in the built shell
 * (not pixels, so no baselines and no person needed). Every ribbon tab, the
 * Simple toolbar and the Classic ribbon, at 1360 and 1000 px wide. English only:
 * the suite offers no other interface language yet (SELECTABLE_LANGS), and the
 * harness pins GENOFFICE_LANG=en. It fails when:
 *   - a toolbar button shows nothing (an icon or glyph with no size, or a
 *     symbol the chrome fonts cannot draw);
 *   - a ribbon group has no controls;
 *   - the ribbon band takes more than one row, or a control is cut off by it;
 *   - a status bar item breaks across lines;
 *   - the toolbar switch, Save and the ribbon tabs are not on one row in Classic.
 *
 * Screenshots of each state go to the test output for review. With
 * HANGUL_LAYOUT_SHOTS=<dir> they are also written there.
 */
import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { captureStable, closeShell, createFixtures, createProfile, launchShell, openDocument, runInView, sleep, waitForSelector } from '../src/harness'

const RUN = process.platform === 'linux' || process.env.VISUAL_LOCAL === '1'
test.skip(!RUN, 'measured against the Linux CI fonts; set VISUAL_LOCAL=1 to run on this OS')

const SHOTS = process.env.HANGUL_LAYOUT_SHOTS
const clickText = (name: string) =>
  `(() => { const el = [...document.querySelectorAll('button,[role="tab"]')].find((b) => (b.getAttribute('aria-label') || b.textContent || '').trim() === ${JSON.stringify(name)}); if (el) el.click(); return !!el })()`

/** Runs in the Hangul view: every layout problem on screen now, as text. */
const PROBLEMS = `(() => {
  const out = []
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
  const name = (el) => el.getAttribute('aria-label') || el.getAttribute('data-tip') || el.textContent.trim().slice(0, 30)
  // a glyph the chrome fonts cannot draw renders as the .notdef box; compare with a private-use char
  const cx = document.createElement('canvas').getContext('2d')
  const tofu = (text, font) => {
    cx.font = font
    const notdef = cx.measureText('\\uE000').width
    return [...text].filter((c) => c.trim() && !/[\\x20-\\x7E]/.test(c) && cx.measureText(c).width === notdef)
  }
  for (const b of document.querySelectorAll('.go-toolbar__btn, .gs-dd-btn')) {
    if (!vis(b)) continue
    const icon = b.querySelector('.go-toolbar__icon, .gs-dd-value')
    if (icon) {
      const r = icon.getBoundingClientRect()
      const drawn = icon.querySelector('svg') || icon.textContent.trim()
      if (!drawn || r.width < 4 || r.height < 4) out.push('empty button: ' + name(b))
      const cs = getComputedStyle(icon)
      const missing = tofu(icon.textContent, cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily)
      if (missing.length) out.push('undrawable glyph ' + missing.join('') + ' in: ' + name(b))
    }
  }
  for (const g of document.querySelectorAll('.hangul-ribbon-group')) {
    if (!vis(g)) continue
    const controls = [...g.querySelectorAll('.hangul-ribbon-group__controls > *')].filter(vis)
    if (!controls.length) out.push('empty group: ' + g.getAttribute('aria-label'))
  }
  const band = document.querySelector('.hangul-ribbon__band')
  if (band && vis(band)) {
    const b = band.getBoundingClientRect()
    const tops = new Set()
    for (const g of band.querySelectorAll(':scope > .hangul-ribbon__slot > .hangul-ribbon-group, :scope > .hangul-ribbon__more')) {
      const r = g.getBoundingClientRect()
      tops.add(Math.round(r.top))
      if (r.right > b.right + 1) out.push('cut off by the ribbon: ' + (g.getAttribute('aria-label') || 'More'))
    }
    if (tops.size > 1) out.push('ribbon band has ' + tops.size + ' rows')
  }
  for (const it of document.querySelectorAll('.go-statusbar__item')) {
    const range = document.createRange(); range.selectNodeContents(it)
    if (range.getClientRects().length > 1) out.push('status item wraps: ' + it.textContent.slice(0, 40))
  }
  const tabs = document.querySelector('.hangul-toolbar--classic [role="tablist"]')
  const save = document.querySelector('.hangul-toolbar--classic .hangul-file-buttons')
  const sw = document.querySelector('.go-tbswitch')
  if (tabs && save && sw) {
    const mid = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2 }
    const m = mid(tabs)
    for (const [n, el] of [['Save buttons', save], ['toolbar switch', sw]]) if (Math.abs(mid(el) - m) > 4) out.push(n + ' not on the tab row (' + Math.round(mid(el) - m) + ' px)')
    if (save.getBoundingClientRect().right > sw.getBoundingClientRect().left + 1) out.push('Save buttons run under the toolbar switch')
  }
  return out
})()`

async function shot(app: Parameters<typeof captureStable>[0], name: string) {
  const png = await captureStable(app, 'hangul', { maxWaitMs: 8000 })
  await test.info().attach(name, { body: png, contentType: 'image/png' })
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true })
    writeFileSync(join(SHOTS, `${name}.png`), png)
  }
}

{
  const lang = 'en'
  test('hangul chrome layout', async () => {
    test.setTimeout(240_000)
    const profile = createProfile({ name: `hangul-layout-${lang}`, theme: 'light' })
    const docs = createFixtures(`hangul-layout-${lang}`)
    const app = await launchShell(profile, { env: { REDROB_HANGUL_EDITOR: 'next' } })
    const tabNames = ['Edit', 'Insert', 'Format', 'Page', 'Review', 'View']
    const click = async (name: string) => expect(await runInView<boolean>(app, 'hangul', clickText(name)), `no control named ${name}`).toBe(true)
    const problems: string[] = []
    const check = async (where: string) => {
      for (const p of await runInView<string[]>(app, 'hangul', PROBLEMS)) problems.push(`${where}: ${p}`)
    }
    try {
      await openDocument(app, 'hangul', docs.files.hangul)
      await waitForSelector(app, 'hangul', '.hwp-page canvas', { timeoutMs: 45_000 })
      await runInView(app, 'hangul', clickText('Got it'))
      // the caret in the body, so formatting controls are live
      await runInView(app, 'hangul', `(() => { document.querySelector('.hwp-input')?.focus(); return true })()`)
      for (const width of [1360, 1000]) {
        await app.evaluate(({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]!.setSize(w, 860), width)
        await sleep(600)
        await click('Simple')
        await sleep(300)
        await check(`${width} simple`)
        await shot(app, `${lang}-${width}-simple`)
        await click('Classic')
        for (const tab of tabNames) {
          await click(tab)
          await sleep(300)
          await check(`${width} ${tab}`)
          await shot(app, `${lang}-${width}-${tab}`)
        }
      }
    } finally {
      await closeShell(app)
    }
    expect(problems, problems.join('\n')).toEqual([])
  })
}
