/**
 * @vitest-environment jsdom
 *
 * Credential-destination honesty. The Genspark cloud-account surfaces the port came
 * with (sign-in, cloud projects, credits) authenticated against genspark.ai; they are
 * removed, not just hidden. These tests prove:
 *  1. Settings shows no account/sign-in nav or login control;
 *  2. no Office source reaches genspark.ai or the gsk CLI any more.
 * The Sharing pane wording ("Account", "Sign in") is guarded here too: sharing
 * identity is Redrob's, and the retired cloud account must not seem to come back.
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HomeApi } from '../src/shared/home-api'
import { LocaleProvider } from '../src/renderer/src/locale'
import { SettingsModal } from '../src/renderer/src/SettingsModal'

const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const src = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), 'utf8')

describe('Settings has no cloud-account sign-in or credits surface', () => {
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

  it('renders no Account nav item and no Genspark sign-in or credits control', async () => {
    window.aiOffice = {
      getTheme: async () => 'system',
      getDefaultSaveDir: async () => '',
      getAnalyticsEnabled: async () => true,
      setAnalyticsEnabled: async () => true,
      getUpdateChannel: async () => 'stable',
      getAppVersion: async () => '1.0.0',
      githubStars: async () => null,
    } as unknown as HomeApi

    await act(async () => {
      root.render(createElement(LocaleProvider, { initial: 'en' }, createElement(SettingsModal, { onClose: () => undefined })))
      await Promise.resolve()
    })

    const navLabels = Array.from(host.querySelectorAll<HTMLButtonElement>('.set-nav-item')).map((b) => b.textContent ?? '')
    expect(navLabels.some((l) => /Account/i.test(l))).toBe(false)
    expect(navLabels.some((l) => /Redrob AI/i.test(l))).toBe(true)
    const allText = host.textContent ?? ''
    expect(/Sign in|Signed in|Genspark|Credits|Sign out/i.test(allText)).toBe(false)
  })
})

/** every .ts/.tsx under a source root, skipping tests and build output */
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'out' || name === 'dist' || name === 'tests' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.(ts|tsx|mts|cjs|mjs)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

describe('no Genspark reach left in Office', () => {
  it('no source names genspark.ai or the gsk tool CLI', () => {
    const roots = ['apps', 'packages'].flatMap((top) =>
      readdirSync(resolve(REPO_ROOT, top))
        .map((n) => resolve(REPO_ROOT, top, n, 'src'))
        .filter((p) => {
          try {
            return statSync(p).isDirectory()
          } catch {
            return false
          }
        }),
    )
    const offenders: string[] = []
    for (const root of roots) {
      for (const file of sources(root)) {
        const text = readFileSync(file, 'utf8')
        // the upstream project's issue links (github.com/genspark-ai/genoffice) are attribution, not a dependency
        const withoutUpstreamLinks = text.replace(/github\.com\/genspark-ai\/genoffice[^\s'")]*/g, '')
        if (/genspark\.ai|@genspark\/cli|tool_cli/.test(withoutUpstreamLinks)) offenders.push(file.slice(REPO_ROOT.length + 1))
      }
    }
    expect(offenders).toEqual([])
  })

  it('Home and Settings carry no cloud-account code path', () => {
    const home = src('apps/shell/src/renderer/src/Home.tsx')
    expect(home).not.toMatch(/accountStatus|accountLogin|CloudProjectsView|cloudProjectsSync/)
    const settings = src('apps/shell/src/renderer/src/SettingsModal.tsx')
    expect(settings).not.toMatch(/section === 'account'|loginGenspark|openCreditUsage/)
  })

  it('keeps "Account" and "Sign in" out of the Sharing pane', () => {
    const pane = src('apps/shell/src/renderer/src/home/IdentityPane.tsx')
    expect(pane).not.toMatch(/['"`>][^'"`<]*\b(Account|Sign in)\b/)
  })
})
