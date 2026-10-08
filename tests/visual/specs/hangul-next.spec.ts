/**
 * The Hangul editor (spec task 2.5): the Classic ribbon over the sample
 * document in both themes, and the 표/셀 속성 dialog, which exercises the shared
 * dialog, tab and form parts. The suite's `hangul-*` shots record the editor as
 * it opens (Simple toolbar); these record the Classic ribbon and a dialog.
 *
 * Document pixels come from the engine (canvas); everything else is chrome.
 */
import { expect, test } from '@playwright/test'
import {
  captureStable,
  closeShell,
  createFixtures,
  createProfile,
  freeze,
  launchShell,
  openDocument,
  removeDir,
  runInView,
  waitForSelector,
  type Theme,
} from '../src/harness'

const RUN = process.platform === 'linux' || process.env.VISUAL_LOCAL === '1'
test.skip(!RUN, 'baselines are Linux-only; set VISUAL_LOCAL=1 to render on this OS')

const click = (selector: string) => `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el) el.click(); return !!el })()`
/** Click the button or tab whose accessible name (aria-label, else text) is `name`. */
const clickText = (name: string) =>
  `(() => { const el = [...document.querySelectorAll('button,[role="tab"]')].find((b) => (b.getAttribute('aria-label') || b.textContent || '').trim() === ${JSON.stringify(name)}); if (el) el.click(); return !!el })()`

for (const theme of ['light', 'dark'] as Theme[]) {
  test(`hangul editor (${theme})`, async () => {
    const profile = createProfile({ name: `hangul-next-${theme}`, theme })
    const docs = createFixtures(`hangul-next-${theme}`)
    const app = await launchShell(profile)
    try {
      await openDocument(app, 'hangul', docs.files.hangul)
      await waitForSelector(app, 'hangul', '.hwp-page canvas', { timeoutMs: 45_000 })
      // The toolbar tip shows once per profile; the shot is of the editor, not the tip.
      await runInView(app, 'hangul', clickText('Got it'))
      await runInView(app, 'hangul', clickText('Classic'))
      await freeze(app, 'hangul')
      expect(await captureStable(app, 'hangul', { maxWaitMs: 30_000 })).toMatchSnapshot(`hangul-next-${theme}.png`)

      // 표/셀 속성 on a fresh table: Insert > Insert Table > 2×2, then Table > Table/Cell Properties.
      await runInView(app, 'hangul', clickText('Insert'))
      // The caret goes into the body first, so the table is created there.
      await runInView(app, 'hangul', click('.hwp-input'))
      await runInView(app, 'hangul', clickText('Insert Table'))
      await waitForSelector(app, 'hangul', '.hangul-table-grid__popover')
      await runInView(app, 'hangul', clickText('2 × 2 table'))
      await waitForSelector(app, 'hangul', '[role="tab"][id$="-table"]')
      await runInView(app, 'hangul', click('[role="tab"][id$="-table"]'))
      await runInView(app, 'hangul', clickText('Table/Cell Properties'))
      await waitForSelector(app, 'hangul', '[role="dialog"]')
      await freeze(app, 'hangul')
      expect(await captureStable(app, 'hangul', { maxWaitMs: 30_000 })).toMatchSnapshot(`hangul-next-table-${theme}.png`)
    } finally {
      await closeShell(app)
      removeDir(profile)
      removeDir(docs.dir)
    }
  })
}
