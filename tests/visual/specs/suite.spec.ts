/**
 * Screenshots of every surface the Redrob UI migration touches, in both themes.
 *
 * One shell launch per theme walks Home, Settings and each editor in order.
 * The tab strip and onboarding get their own launches: the strip needs all six
 * documents open at once, and a seen profile never shows onboarding. Captures target single webContents (see harness.ts), named
 * <surface>-<theme>.png.
 */
import { expect, test, type ElectronApplication } from '@playwright/test'
import {
  TAB_STRIP_HEIGHT,
  activateTab,
  captureStable,
  closeShell,
  createFixtures,
  createProfile,
  freeze,
  launchShell,
  listTabs,
  openDocument,
  removeDir,
  runInView,
  waitForSelector,
  type FixtureKind,
  type Theme,
} from '../src/harness'

const RUN = process.platform === 'linux' || process.env.VISUAL_LOCAL === '1'
test.skip(!RUN, 'baselines are Linux-only; set VISUAL_LOCAL=1 to render on this OS')

const THEMES: Theme[] = ['light', 'dark']
/** opened in this order, so the tab strip shot is the same every run */
const EDITORS: FixtureKind[] = ['docs', 'sheets', 'slides', 'pdf', 'markdown', 'hangul']

for (const theme of THEMES) {
  // Default (not serial) mode: the tests share one launch while they pass, and
  // a failure restarts the worker, whose beforeAll relaunches a fresh app. Every
  // test therefore starts from whatever state it needs on its own.
  test.describe(`${theme} theme`, () => {
    let app: ElectronApplication
    let profile: string
    let docs: ReturnType<typeof createFixtures>

    test.beforeAll(async () => {
      profile = createProfile({ name: theme, theme })
      docs = createFixtures(theme)
      app = await launchShell(profile)
    })

    test.afterAll(async () => {
      if (app) await closeShell(app)
      if (profile) removeDir(profile)
      if (docs) removeDir(docs.dir)
    })

    test('home', async () => {
      await waitForSelector(app, 'shell', '.home-hero')
      await freeze(app, 'shell')
      expect(await captureStable(app, 'shell')).toMatchSnapshot(`home-${theme}.png`)
    })

    test('settings', async () => {
      await runInView(app, 'shell', `document.querySelector('.account-btn').click(), true`)
      await waitForSelector(app, 'shell', '.set-overlay [role="dialog"]')
      await freeze(app, 'shell')
      expect(await captureStable(app, 'shell')).toMatchSnapshot(`settings-${theme}.png`)
      await runInView(
        app,
        'shell',
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })), true`,
      )
      await waitForSelector(app, 'shell', '.set-overlay [role="dialog"]', { present: false })
    })

    for (const kind of EDITORS) {
      test(kind, async () => {
        await openDocument(app, kind, docs.files[kind])
        await freeze(app, kind)
        expect(await captureStable(app, kind, { maxWaitMs: 30_000 })).toMatchSnapshot(
          `${kind}-${theme}.png`,
        )
      })
    }
  })

  // Its own launch: Playwright restarts the worker after any failed test, which
  // relaunches the serial group's app, so a strip shot taken there would show
  // whichever tabs survived rather than all six.
  test(`tab strip (${theme})`, async () => {
    const profile = createProfile({ name: `tabs-${theme}`, theme })
    const docs = createFixtures(`tabs-${theme}`)
    const app = await launchShell(profile)
    try {
      for (const kind of EDITORS) await openDocument(app, kind, docs.files[kind])
      const tabs = await listTabs(app)
      expect(tabs.map((t) => t.kind)).toEqual(['home', ...EDITORS])
      // a docs tab active: the strip then shows an editor tab selected and Home not
      await activateTab(app, tabs.find((t) => t.kind === 'docs')!.id)
      await freeze(app, 'shell')
      const width = await runInView<number>(app, 'shell', 'window.innerWidth')
      expect(
        await captureStable(app, 'shell', {
          rect: { x: 0, y: 0, width, height: TAB_STRIP_HEIGHT },
        }),
      ).toMatchSnapshot(`tabstrip-${theme}.png`)
    } finally {
      await closeShell(app)
      removeDir(profile)
      removeDir(docs.dir)
    }
  })

  test(`onboarding (${theme})`, async () => {
    const profile = createProfile({ name: `onboarding-${theme}`, theme, onboardingSeen: false })
    const app = await launchShell(profile)
    try {
      await waitForSelector(app, 'shell', '.onb-overlay')
      await freeze(app, 'shell')
      expect(await captureStable(app, 'shell')).toMatchSnapshot(`onboarding-${theme}.png`)
    } finally {
      await closeShell(app)
      removeDir(profile)
    }
  })
}
