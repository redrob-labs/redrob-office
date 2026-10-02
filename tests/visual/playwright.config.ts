/**
 * Visual regression suite for the built suite shell.
 *
 * Baselines are Linux-only: font rasterisation differs between Windows, macOS
 * and Linux, so a baseline is only meaningful on the platform CI renders on.
 * Snapshots live under __screenshots__/<platform>/ and only linux/ is
 * committed. On another OS the suite skips unless VISUAL_LOCAL=1, which
 * renders into that platform's (git-ignored) folder at a loose tolerance, for
 * iterating on the harness itself.
 *
 * Updating baselines: the `visual (ubuntu-latest)` CI job uploads a
 * `visual-baselines` artifact whenever it fails, holding a full fresh render.
 * After reviewing the diff artifact, take the new baselines with
 *   gh run download <run-id> -n visual-baselines -D tests/visual/__screenshots__/linux
 * and commit them on the PR branch.
 */
import { defineConfig } from '@playwright/test'

const ci = !!process.env.CI

export default defineConfig({
  testDir: './specs',
  snapshotPathTemplate: '{testDir}/../__screenshots__/{platform}/{arg}{ext}',
  outputDir: './test-results',
  // one Electron instance at a time: each launch owns a whole window and its
  // own profile, and parallel GPU-less renders on a CI box are not faster
  workers: 1,
  fullyParallel: false,
  retries: ci ? 1 : 0,
  timeout: 180_000,
  reporter: ci ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  expect: {
    timeout: 30_000,
    toMatchSnapshot: {
      // CI renders on one fixed image; tolerate antialiasing noise only.
      // Local non-Linux runs are for the harness, not for judging pixels.
      maxDiffPixelRatio: process.platform === 'linux' ? 0.002 : 0.05,
      threshold: 0.2,
    },
  },
})
