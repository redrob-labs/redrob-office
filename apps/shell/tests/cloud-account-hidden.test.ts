/**
 * @vitest-environment jsdom
 *
 * Credential-destination honesty: the ported Genspark cloud-account surfaces
 * (sign-in, cloud projects, credits) authenticate against / link to
 * genspark.ai. Presenting them under a "Redrob" label would misrepresent where
 * a user's credentials go, so they are hidden behind CLOUD_ACCOUNT_ENABLED
 * (false) until a real Redrob auth/cloud backend exists.
 *
 * These tests prove:
 *  1. the flag is off for release;
 *  2. Settings shows no account/sign-in nav or login control, and rendering it
 *     triggers no login/account call;
 *  3. the Home render sites that reach genspark.ai (sign-in mount query, cloud
 *     nav, cloud-projects view) are guarded by the flag in source.
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomeApi } from '../src/shared/home-api'
import { LocaleProvider } from '../src/renderer/src/locale'
import { SettingsModal } from '../src/renderer/src/SettingsModal'
import { CLOUD_ACCOUNT_ENABLED } from '../src/renderer/src/cloud-account-flag'

const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const src = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), 'utf8')

describe('cloud-account flag', () => {
  it('is disabled for release (no Redrob auth/cloud backend wired yet)', () => {
    expect(CLOUD_ACCOUNT_ENABLED).toBe(false)
  })
})

describe('Settings has no Genspark sign-in / credits surface when disabled', () => {
  const actEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  actEnv.IS_REACT_ACT_ENVIRONMENT = true
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('renders no Account nav item and no sign-in button, and never calls login/account IPC', async () => {
    const onLogin = vi.fn()
    const onLogout = vi.fn()
    const accountStatus = vi.fn(async () => ({ loggedIn: false }))
    const accountLogin = vi.fn(async () => true)
    const openCreditUsage = vi.fn(async () => {})
    window.aiOffice = {
      getTheme: async () => 'system',
      getDefaultSaveDir: async () => '',
      getAnalyticsEnabled: async () => true,
      setAnalyticsEnabled: async () => true,
      getUpdateChannel: async () => 'stable',
      getAppVersion: async () => '1.0.0',
      githubStars: async () => null,
      accountStatus,
      accountLogin,
      openCreditUsage,
    } as unknown as HomeApi

    await act(async () => {
      root.render(
        createElement(
          LocaleProvider,
          { initial: 'en' },
          createElement(SettingsModal, {
            // a logged-in status is deliberately supplied to prove the account
            // pane is gated by the flag, not merely by login state
            status: { loggedIn: true, email: 'x@example.com', creditBalance: 42 },
            loggingOut: false,
            loginWaiting: false,
            loginUrl: null,
            urlCopied: false,
            onOpenLoginUrl: vi.fn(),
            onCopyLoginUrl: vi.fn(),
            onClose: vi.fn(),
            onLogin,
            onLogout,
          }),
        ),
      )
      await Promise.resolve()
    })

    const navLabels = Array.from(host.querySelectorAll<HTMLButtonElement>('.set-nav-item')).map(
      (b) => b.textContent ?? '',
    )
    // No account section in the nav; AI Model / General / About remain.
    expect(navLabels.some((l) => /Account/i.test(l))).toBe(false)
    expect(navLabels.some((l) => /AI Model/i.test(l))).toBe(true)

    // No sign-in / logout / credits controls anywhere in the modal.
    const allText = host.textContent ?? ''
    expect(/Sign in|Signed in|Genspark|Credits|Sign out/i.test(allText)).toBe(false)

    // The account/login/credit IPCs are never invoked by rendering settings.
    expect(onLogin).not.toHaveBeenCalled()
    expect(onLogout).not.toHaveBeenCalled()
    expect(accountLogin).not.toHaveBeenCalled()
    expect(openCreditUsage).not.toHaveBeenCalled()
  })
})

describe('Home genspark.ai reach sites are guarded by the flag', () => {
  const home = () => src('apps/shell/src/renderer/src/Home.tsx')

  it('the on-mount account-status query (hits genspark.ai) is flag-guarded', () => {
    const text = home()
    // the mount effect that calls accountStatus must early-return on the flag
    // before reaching the IPC call
    const guard = /if \(!CLOUD_ACCOUNT_ENABLED\) return\s*\n\s*let alive = true\s*\n\s*void window\.aiOffice\.accountStatus/
    expect(guard.test(text)).toBe(true)
  })

  it('the cloud-projects nav item and view are flag-guarded', () => {
    const text = home()
    expect(text).toContain('{CLOUD_ACCOUNT_ENABLED && loggedIn && (')
    expect(text).toContain('CLOUD_ACCOUNT_ENABLED && cloudMode ? (')
  })

  it('SettingsModal drops the account section and gates its pane on the flag', () => {
    const s = src('apps/shell/src/renderer/src/SettingsModal.tsx')
    expect(s).toContain("ALL_SECTIONS.filter((s) => s.id !== 'account')")
    expect(s).toContain("{CLOUD_ACCOUNT_ENABLED && section === 'account' && (")
  })

  it('the login handler / credit URL still exist in main (endpoint code kept, just unreachable)', () => {
    // We intentionally KEEP the endpoint code; it must not be deleted, only made
    // unreachable from a Redrob-labeled control.
    const index = src('apps/shell/src/main/index.ts')
    expect(index).toContain('CREDIT_USAGE_URL')
    expect(index).toContain('startGenofficeLogin')
  })
})
