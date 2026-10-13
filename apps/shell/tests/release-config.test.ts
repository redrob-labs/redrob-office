import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Release/packaging contract for the Redrob Office suite shell (@genoffice/shell).
 *
 * Two things this locks:
 *  1. the PACKAGED product name is "Redrob Office", while the upgrade identity
 *     (appId), the executable name, and the update-feed artifact filenames stay
 *     on their historic values so a display rename never breaks auto-update; and
 *  2. the desktop release workflow builds/signs/packages THIS shell, not the
 *     retired application that is archived outside main.
 */

const SHELL_ROOT = resolve(__dirname, '..')
const REPO_ROOT = resolve(SHELL_ROOT, '..', '..')

/** Load electron-builder.cjs for inspection with the packaging-host asset guard
 *  stubbed out (LICENSES.chromium.html etc. only exist after an Electron binary
 *  download; absent in unit CI). Nothing is packaged. */
function loadBuilderConfig(): Record<string, unknown> {
  const fs = require('node:fs') as typeof import('node:fs')
  const realExists = fs.existsSync
  ;(fs as { existsSync: unknown }).existsSync = () => true
  try {
    const path = resolve(SHELL_ROOT, 'electron-builder.cjs')
    // bust the require cache so the stub is honored on every run
    delete require.cache[require.resolve(path)]
    return require(path) as Record<string, unknown>
  } finally {
    ;(fs as { existsSync: typeof realExists }).existsSync = realExists
  }
}

describe('packaged product identity', () => {
  const pkg = JSON.parse(readFileSync(resolve(SHELL_ROOT, 'package.json'), 'utf8')) as {
    productName: string
    version: string
    homepage: string
  }

  it('package.json productName is "Redrob Office"', () => {
    expect(pkg.productName).toBe('Redrob Office')
  })

  it('electron-builder productName is "Redrob Office"', () => {
    const c = loadBuilderConfig()
    expect(c.productName).toBe('Redrob Office')
  })

  it('electron-builder config loads under the REAL pnpm layout (no repo-root node_modules/electron)', () => {
    // The preflight resolves electron / @embedpdf/pdfium via module resolution,
    // so it must not throw under pnpm's isolated store (where there is no
    // hoisted ../../node_modules/electron). Load WITHOUT the fs stub.
    delete require.cache[require.resolve(resolve(SHELL_ROOT, 'electron-builder.cjs'))]
    const c = require(resolve(SHELL_ROOT, 'electron-builder.cjs')) as {
      extraResources: Array<{ from: string; to: string }>
    }
    const chromium = c.extraResources.find((r) => r.to === 'LICENSES.chromium.html')
    const pdfium = c.extraResources.find((r) => r.to === 'wasm/pdfium.wasm')
    // resolved to absolute paths that actually exist (not the old
    // ../../node_modules/... that pnpm never creates)
    expect(chromium?.from).toMatch(/^\//)
    expect(chromium?.from).not.toContain('../../node_modules/electron')
    expect(pdfium?.from).toMatch(/^\//)
    expect(readFileSync(chromium!.from).length).toBeGreaterThan(0)
    expect(readFileSync(pdfium!.from).length).toBeGreaterThan(0)
  })

  it('preserves the stable appId and executable name for upgrades', () => {
    const c = loadBuilderConfig()
    // appId is the Windows AUMID / macOS CFBundleIdentifier — changing it breaks
    // in-place upgrades, so it must stay on the historic value.
    expect(c.appId).toBe('com.redrob.app')
    // the binary/executable stays "redrob" on every platform (mac/win would
    // otherwise derive it from the new productName)
    expect(c.executableName).toBe('redrob')
    expect((c.linux as { executableName?: string }).executableName).toBe('redrob')
  })

  it('names every asset the way Redrob Launcher reads it: <stem>-<version>-<os>-<arch>[-portable].<ext>', () => {
    const c = loadBuilderConfig()
    // The launcher (redrob-launcher crates/core/src/platform.rs parse_asset_name)
    // installs only names in this grammar, with its own os-arch tokens -- never
    // electron-builder's ${arch} (amd64 / x64 / arm64 differ per target) and
    // never productName. scripts/check-release-asset-names.mjs is the same rule
    // run over the built release dir in the release workflows.
    expect((c.mac as { artifactName: string }).artifactName).toBe('redrob-office-${version}-macos-aarch64.${ext}')
    expect((c.nsis as { artifactName: string }).artifactName).toBe('redrob-office-${version}-windows-x64-setup.${ext}')
    expect((c.win as { artifactName: string }).artifactName).toBe('redrob-office-${version}-windows-x64-portable.${ext}')
    expect((c.linux as { artifactName: string }).artifactName).toBe('redrob-office-${version}-linux-x86_64.${ext}')
    expect((c.deb as { artifactName: string }).artifactName).toBe('redrob-office-${version}-linux-x86_64.deb')
    expect((c.rpm as { artifactName: string }).artifactName).toBe('redrob-office-${version}-linux-x86_64.rpm')
    // deb/rpm keep their pinned package names (apt/dnf upgrade lineage)
    expect((c.deb as { packageName: string }).packageName).toBe('redrob')
    expect((c.rpm as { packageName: string }).packageName).toBe('redrob')
  })

  it('ships a Windows portable zip, because the launcher cannot run an exe installer', () => {
    const c = loadBuilderConfig()
    const targets = (c.win as { target: Array<{ target: string }> }).target.map((t) => t.target)
    expect(targets).toEqual(['nsis', 'zip'])
  })

  it('passes the asset-name check script over its own templates', () => {
    const result = spawnSync(process.execPath, [resolve(REPO_ROOT, 'scripts/check-release-asset-names.mjs')], {
      encoding: 'utf8',
    })
    expect(result.status, result.stderr).toBe(0)
  })
})

describe('the launcher release manifest (redrob-launcher.json)', () => {
  // Redrob Launcher reads this one asset from every GitHub Release to learn that the
  // release reads its shared account file (redrob-launcher docs/release-manifest.md).
  const WRITER = resolve(REPO_ROOT, 'scripts/write-launcher-manifest.mjs')
  const CHECK = resolve(REPO_ROOT, 'scripts/check-release-asset-names.mjs')
  const PACKAGE = 'redrob-office-0.0.0-linux-x86_64.AppImage'

  function releaseDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'office-release-'))
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body)
    return dir
  }
  function check(dir: string) {
    return spawnSync(process.execPath, [CHECK, dir], { encoding: 'utf8' })
  }

  it('the writer emits exactly the contract: valid JSON, schema 1, sharedAccount true, newline-terminated', () => {
    const dir = releaseDir({})
    try {
      const result = spawnSync(process.execPath, [WRITER, dir], { encoding: 'utf8' })
      expect(result.status, result.stderr).toBe(0)
      const text = readFileSync(join(dir, 'redrob-launcher.json'), 'utf8')
      expect(text).toBe('{ "schema": 1, "sharedAccount": true }\n')
      const parsed = JSON.parse(text) as { schema: number; sharedAccount: boolean }
      expect(parsed.schema).toBe(1)
      // develop carries the shared-account change (#154 / #158), so the release reads it
      expect(parsed.sharedAccount).toBe(true)
      expect(Object.keys(parsed).sort()).toEqual(['schema', 'sharedAccount'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('the asset-name check FAILS a release directory without the manifest', () => {
    const dir = releaseDir({ [PACKAGE]: '' })
    try {
      const result = check(dir)
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('redrob-launcher.json is missing')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('the asset-name check FAILS a manifest that is not schema 1 / sharedAccount true / JSON', () => {
    for (const [body, message] of [
      ['{ "schema": 1, "sharedAccount": false }\n', '"sharedAccount" must be true'],
      ['{ "schema": 2, "sharedAccount": true }\n', '"schema" must be 1'],
      ['{ schema: 1 }\n', 'not valid JSON'],
      ['[1]\n', 'must be a JSON object'],
    ]) {
      const dir = releaseDir({ [PACKAGE]: '', 'redrob-launcher.json': body })
      try {
        const result = check(dir)
        expect(result.status, body).toBe(1)
        expect(result.stderr, body).toContain(message)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  it('the asset-name check PASSES the directory the writer produced, and does not read the manifest as a package name', () => {
    const dir = releaseDir({ [PACKAGE]: '', [`${PACKAGE}.sha256`]: '', 'latest-linux.yml': '' })
    try {
      spawnSync(process.execPath, [WRITER, dir], { encoding: 'utf8' })
      const result = check(dir)
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toContain('redrob-launcher.json ok')
      expect(result.stdout).toContain(`${PACKAGE} ok`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('every release job writes the manifest before its asset-name check, and the uploads carry it', () => {
    const desktop = readFileSync(resolve(REPO_ROOT, '.github/workflows/release-desktop.yml'), 'utf8')
    const linux = readFileSync(resolve(REPO_ROOT, '.github/workflows/release-linux.yml'), 'utf8')
    const WRITE = 'node scripts/write-launcher-manifest.mjs'
    const CHECK_STEP = 'node scripts/check-release-asset-names.mjs'
    // desktop: windows, macos, release -- three writes, each before a check
    const jobBody = (name: string) => {
      const start = desktop.indexOf(`\n  ${name}:\n`)
      expect(start, name).toBeGreaterThan(-1)
      const next = desktop.slice(start + 1).search(/\n  [a-z-]+:\n/)
      return next === -1 ? desktop.slice(start) : desktop.slice(start, start + 1 + next)
    }
    for (const job of ['windows', 'macos', 'release']) {
      const body = jobBody(job)
      const writeIdx = body.indexOf(WRITE)
      const checkIdx = body.indexOf(CHECK_STEP)
      expect(writeIdx, `${job} writes the manifest`).toBeGreaterThan(-1)
      expect(checkIdx, `${job} checks the release dir`).toBeGreaterThan(-1)
      expect(writeIdx, `${job} writes before it checks`).toBeLessThan(checkIdx)
    }
    expect(desktop.match(new RegExp(WRITE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(3)
    // the platform artifacts carry it into the release job, which publishes release-assets/*
    expect(desktop.match(/apps\/shell\/release\/redrob-launcher\.json/g)).toHaveLength(2)
    expect(desktop).toContain(`${WRITE} release-assets`)
    expect(desktop).toContain(`${CHECK_STEP} release-assets`)
    expect(desktop.indexOf(`${CHECK_STEP} release-assets`)).toBeLessThan(desktop.indexOf('softprops/action-gh-release@v2'))
    // linux: written into the staged dir, before the check, uploaded by release-assets/*
    expect(linux).toContain(`${WRITE} "$OUT"`)
    expect(linux.indexOf(`${WRITE} "$OUT"`)).toBeLessThan(linux.indexOf(`${CHECK_STEP} release-assets`))
    expect(linux.indexOf(`${CHECK_STEP} release-assets`)).toBeLessThan(linux.indexOf('gh release upload "$RELEASE_TAG" release-assets/* --clobber'))
  })
})

describe('every editor module ships (no white Hangul / missing-editor regression)', () => {
  // The shell main (apps/shell/src/main/index.ts) resolves each editor when
  // packaged at resources/modules/<name> and the Hangul studio at
  // resources/rhwp-studio. If any is not staged the tab opens white — this is
  // the exact packaged-Hangul regression these tests exist to prevent.
  const EXPECTED_MODULES: Array<{ from: string; to: string }> = [
    { from: '../docs/out', to: 'modules/docs' },
    { from: '../sheets/out', to: 'modules/sheets' },
    { from: '../slides/out', to: 'modules/slides' },
    { from: '../pdf/out', to: 'modules/pdf' },
    { from: '../markdown/out', to: 'modules/markdown' },
    { from: '../hangul/out', to: 'modules/hangul' },
  ]

  it('all six editor modules are declared in extraResources with the exact from/to', () => {
    const c = loadBuilderConfig()
    const top = c.extraResources as Array<{ from: string; to: string }>
    for (const mod of EXPECTED_MODULES) {
      const entry = top.find((r) => r.to === mod.to)
      expect(entry, `missing extraResources entry for ${mod.to}`).toBeDefined()
      expect(entry!.from).toBe(mod.from)
    }
  })

  it('ships the offline rhwp-studio build the Hangul editor embeds', () => {
    const c = loadBuilderConfig()
    const top = c.extraResources as Array<{ from: string; to: string }>
    const studio = top.find((r) => r.to === 'rhwp-studio')
    expect(studio, 'missing extraResources entry for rhwp-studio').toBeDefined()
    expect(studio!.from).toBe('../hangul/resources/rhwp-studio')
  })

  it('the staged module layout matches what the shell main resolves when packaged', () => {
    // Keep the extraResources `to:` in lockstep with index.ts's
    // resources/modules/<name> + resources/rhwp-studio resolution. If the
    // shell main is retargeted these must move together.
    const index = readFileSync(resolve(SHELL_ROOT, 'src/main/index.ts'), 'utf8')
    for (const name of ['docs', 'sheets', 'slides', 'pdf', 'markdown', 'hangul']) {
      expect(index).toContain(`'modules', '${name}'`)
    }
    expect(index).toContain("'rhwp-studio'")
  })

  it('the beforePack preflight enumerates all six module trees + the rhwp-studio entry point', () => {
    // A build must FAIL (not warn) when any editor tree or the studio is
    // absent. electron-builder exits 0 on a missing extraResources source, so
    // assertModuleTreesPresent is the only real gate.
    const src = readFileSync(resolve(SHELL_ROOT, 'electron-builder.cjs'), 'utf8')
    for (const rel of [
      '../docs/out',
      '../sheets/out',
      '../slides/out',
      '../pdf/out',
      '../markdown/out',
      '../hangul/out',
    ]) {
      expect(src).toContain(rel)
    }
    expect(src).toContain('../hangul/resources/rhwp-studio/index.html')
    // and the guard is invoked from beforePack, not merely defined
    const beforePack = src.slice(src.indexOf('beforePack:'))
    expect(beforePack).toContain('assertModuleTreesPresent()')
  })
})

describe('Linux package control metadata is Redrob, no upstream brand', () => {
  const pkg = JSON.parse(readFileSync(resolve(SHELL_ROOT, 'package.json'), 'utf8')) as {
    description: string
  }

  it('maintainer and vendor are the Redrob repo identity (never Mainfunc/Genspark)', () => {
    const c = loadBuilderConfig()
    const linux = c.linux as { maintainer: string; vendor: string; description: string }
    // The established Redrob package contact (redrob-labs/redrob-work
    // apps/desktop/package.json author). NOT an invented domain.
    expect(linux.maintainer).toBe('Redrob <support@redrob.io>')
    expect(linux.vendor).toBe('Redrob <support@redrob.io>')
    // No upstream brand may leak into apt/dnf control metadata.
    for (const value of [linux.maintainer, linux.vendor, linux.description]) {
      expect(value).not.toMatch(/mainfunc/i)
      expect(value).not.toMatch(/genspark/i)
      expect(value).not.toMatch(/genoffice/i)
    }
    // Guard against re-introducing the invented team@redrob.ai contact.
    expect(linux.maintainer).not.toMatch(/redrob\.ai/i)
    expect(linux.vendor).not.toMatch(/redrob\.ai/i)
  })

  it('linux.description names the full Redrob Office suite editors', () => {
    const c = loadBuilderConfig()
    const linux = c.linux as { description: string }
    // The software-center / `apt show` blurb must describe the whole suite.
    for (const editor of ['Docs', 'Sheets', 'Slides', 'Markdown', 'PDF', 'Hangul']) {
      expect(linux.description).toContain(editor)
    }
    expect(linux.description).toMatch(/Redrob Office/)
  })

  it('the shell package.json description names the full suite (no upstream brand)', () => {
    for (const editor of ['Docs', 'Sheets', 'Slides', 'Markdown', 'PDF', 'Hangul']) {
      expect(pkg.description).toContain(editor)
    }
    expect(pkg.description).not.toMatch(/mainfunc/i)
    expect(pkg.description).not.toMatch(/genspark/i)
  })
})

describe('OCR helpers are declared per-platform, not for Linux', () => {
  it('the top-level extraResources ships no macOS/Windows OCR helper', () => {
    const c = loadBuilderConfig()
    const top = c.extraResources as Array<{ from: string; to: string }>
    // A top-level OCR entry is why a Linux package warned about (and would try
    // to ship) win-ocr.exe / vision-ocr — helpers that only exist on their own
    // build platform. They must live under the per-platform blocks instead.
    for (const r of top) {
      expect(r.to).not.toContain('ocr/vision-ocr')
      expect(r.to).not.toContain('ocr/win-ocr')
    }
  })

  it('macOS ships vision-ocr and Windows ships win-ocr.exe in their own blocks', () => {
    const c = loadBuilderConfig()
    const mac = (c.mac as { extraResources: Array<{ from: string; to: string }> }).extraResources
    const win = (c.win as { extraResources: Array<{ from: string; to: string }> }).extraResources
    expect(mac.some((r) => r.to === 'ocr/vision-ocr')).toBe(true)
    expect(win.some((r) => r.to === 'ocr/win-ocr.exe')).toBe(true)
    // and no cross-contamination: mac must not ship the Windows helper, vice versa
    expect(mac.some((r) => r.to.includes('win-ocr'))).toBe(false)
    expect(win.some((r) => r.to.includes('vision-ocr'))).toBe(false)
  })

  it('Linux extraResources carries only the Linux xlsx sidecar (no OCR helpers)', () => {
    const c = loadBuilderConfig()
    const linux = (c.linux as { extraResources?: Array<{ from: string; to: string }> })
      .extraResources
    if (linux) {
      for (const r of linux) {
        expect(r.to).not.toContain('ocr/')
      }
    }
  })
})

describe('THIRD-PARTY-NOTICES packaging contract', () => {
  it('the notices file is shipped to the resources root (where the app reads it)', () => {
    const c = loadBuilderConfig()
    const top = c.extraResources as Array<{ from: string; to: string }>
    const entry = top.find((r) => r.to === 'THIRD-PARTY-NOTICES.txt')
    expect(entry).toBeDefined()
    expect(entry!.from).toBe('build/THIRD-PARTY-NOTICES.txt')
  })

  it('a generate-before-build step exists (notices script wired into every dist:*)', () => {
    const scripts = (
      JSON.parse(readFileSync(resolve(SHELL_ROOT, 'package.json'), 'utf8')) as {
        scripts: Record<string, string>
      }
    ).scripts
    expect(scripts.notices).toContain('gen-third-party-notices.mjs')
    for (const target of ['dist:mac', 'dist:win', 'dist:linux']) {
      expect(scripts[target]).toContain('notices')
    }
  })

  it('the generator source (tools/gen-third-party-notices.mjs) exists and targets the shell build dir', () => {
    const gen = readFileSync(resolve(REPO_ROOT, 'tools/gen-third-party-notices.mjs'), 'utf8')
    expect(gen).toContain('THIRD-PARTY-NOTICES.txt')
  })

  it('beforePack fails loudly when the notices file is absent (no silent ship)', () => {
    // The config module defines assertThirdPartyNoticesPresent and calls it from
    // beforePack; electron-builder exits 0 on a missing extraResources source, so
    // this guard is the only thing that keeps a notice-less installer from shipping.
    const src = readFileSync(resolve(SHELL_ROOT, 'electron-builder.cjs'), 'utf8')
    expect(src).toContain('assertThirdPartyNoticesPresent')
    // it is invoked inside beforePack, not merely defined
    const beforePack = src.slice(src.indexOf('beforePack:'))
    expect(beforePack).toContain('assertThirdPartyNoticesPresent()')
  })
})

describe('desktop release workflow targets @genoffice/shell', () => {
  const workflow = readFileSync(
    resolve(REPO_ROOT, '.github/workflows/release-desktop.yml'),
    'utf8',
  )

  it('builds/signs/packages the shell, not the legacy office app', () => {
    expect(workflow).toContain('@genoffice/shell')
    expect(workflow).toContain('--config electron-builder.cjs')
    expect(workflow).toContain('apps/shell/release/')
    expect(workflow).toContain("require('./apps/shell/package.json').version")
  })

  it('does NOT reference the archived legacy application or its release directory', () => {
    expect(workflow).not.toContain('@redrob/office')
    expect(workflow).not.toContain('office/release')
    expect(workflow).not.toContain('electron-builder.yml')
    expect(workflow).not.toContain("require('./office/package.json')")
  })

  it('preserves Authenticode verification for the installer and bundled Code sidecar', () => {
    expect(workflow).toContain('WIN_CSC_LINK')
    expect(workflow).toContain('WIN_CSC_KEY_PASSWORD')
    expect(workflow).toContain('Get-AuthenticodeSignature')
    expect(workflow).toContain('SignerCertificate')
    expect(workflow).toContain('win-unpacked/resources/native/redrob-code.exe')
    expect(workflow).toContain('apps/shell/release/latest.yml')
    expect(workflow).toContain('*-setup.exe')
    expect(workflow).toContain('*-portable.zip')
    expect(workflow).toContain('--win nsis zip --x64')
    expect(workflow).toContain('node scripts/check-release-asset-names.mjs apps/shell/release')
  })

  it('generates THIRD-PARTY-NOTICES before packaging (beforePack asserts it exists)', () => {
    // This job runs electron-builder directly, not the dist:* scripts that
    // would run `notices`, so it must generate the file itself. Without this
    // step the v0.8.0 Windows job failed: beforePack's
    // assertThirdPartyNoticesPresent threw on the missing file.
    const noticesIdx = workflow.indexOf('run notices')
    const packageIdx = workflow.indexOf('--win nsis')
    expect(noticesIdx).toBeGreaterThan(-1)
    expect(packageIdx).toBeGreaterThan(-1)
    // ordering: notices step precedes the electron-builder package step
    expect(noticesIdx).toBeLessThan(packageIdx)
    // and it runs after the build (the generator reads the built out dirs)
    const buildIdx = workflow.indexOf('run: pnpm build')
    expect(buildIdx).toBeGreaterThan(-1)
    expect(buildIdx).toBeLessThan(noticesIdx)
  })
})


describe('Linux release workflow attaches to the GitHub Release', () => {
  const workflow = readFileSync(resolve(REPO_ROOT, '.github/workflows/release-linux.yml'), 'utf8')

  it('triggers on v* tags (the same tag the desktop release workflow uses)', () => {
    expect(workflow).toContain('tags:')
    expect(workflow).toContain('"v*"')
    const desktop = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/release-desktop.yml'),
      'utf8',
    )
    expect(desktop).toContain('"v*"')
  })

  it('verifies the tag matches apps/shell/package.json version', () => {
    expect(workflow).toContain("require('./apps/shell/package.json').version")
    expect(workflow).toContain('does not match Redrob Office')
  })

  it('installs rpmbuild and stable Rust, and uses pnpm 9.15 / Node 24', () => {
    expect(workflow).toContain('install --yes --no-install-recommends rpm')
    expect(workflow).toContain('dtolnay/rust-toolchain@stable')
    expect(workflow).toContain('version: 9.15.0')
    expect(workflow).toContain("node-version: \"24\"")
  })

  it('builds the Redrob Code sidecar, which beforePack refuses to package without', () => {
    expect(workflow).toContain('repository: redrob-labs/redrob-code')
    expect(workflow).toContain('redrob-linux-x64/bin/redrob')
    expect(workflow).toContain('../apps/shell/build/redrob-code')
  })

  it('builds the unsigned Linux AppImage/deb/rpm for the shell', () => {
    expect(workflow).toContain('--filter @genoffice/shell exec electron-builder')
    expect(workflow).toContain('--linux AppImage deb rpm')
    expect(workflow).toContain('--publish never')
  })

  it('generates third-party notices before packaging', () => {
    const noticesIdx = workflow.indexOf('run: pnpm --filter @genoffice/shell run notices')
    const packageIdx = workflow.indexOf('--linux AppImage deb rpm')
    expect(noticesIdx).toBeGreaterThan(-1)
    expect(noticesIdx).toBeLessThan(packageIdx)
  })

  it('stages exactly the three artifacts named by electron-builder.cjs, with sha256 sidecars', () => {
    expect(workflow).toContain('stage "redrob-office-${APP_VERSION}-linux-x86_64.AppImage"')
    expect(workflow).toContain('stage "redrob-office-${APP_VERSION}-linux-x86_64.deb"')
    expect(workflow).toContain('stage "redrob-office-${APP_VERSION}-linux-x86_64.rpm"')
    expect(workflow).toContain('node scripts/check-release-asset-names.mjs release-assets')
    expect(workflow).toContain('sha256sum "$1" > "$1.sha256"')
  })

  it('attaches the updater feed, because a release without it never updates', () => {
    expect(workflow).toContain('latest-linux.yml')
    expect(workflow).toContain('GENOFFICE_UPDATE_REPO: ${{ github.repository }}')
  })

  it('uploads with --clobber so a re-run repairs one platform without failing', () => {
    expect(workflow).toContain('gh release upload "$RELEASE_TAG" release-assets/* --clobber')
  })

  it('names no CDN host, bucket or credential', () => {
    expect(workflow).not.toContain('cdn.redrob.ai')
    expect(workflow).not.toContain('REDROB_CDN')
    expect(workflow).not.toContain('aws s3')
  })
})


describe('the update feed comes from GitHub Releases, not a CDN', () => {
  const builder = readFileSync(resolve(SHELL_ROOT, 'electron-builder.cjs'), 'utf8')
  const desktop = readFileSync(resolve(REPO_ROOT, '.github/workflows/release-desktop.yml'), 'utf8')

  it('publishes through the github provider, gated on GENOFFICE_UPDATE_REPO', () => {
    expect(builder).toContain("provider: 'github'")
    expect(builder).toContain('GENOFFICE_UPDATE_REPO')
    expect(builder).not.toContain("provider: 'generic'")
    expect(builder).not.toContain('GENOFFICE_UPDATE_URL')
  })

  it('only published releases feed the updater', () => {
    expect(builder).toContain("releaseType: 'release'")
  })

  it('writes no publish config when the variable is unset, so fork builds do not self-update', () => {
    expect(builder).toContain('if (updateRepo) {')
  })

  it('attaches the signed installers and their feed files to the release', () => {
    expect(desktop).toContain('softprops/action-gh-release@v2')
    expect(desktop).toContain('files: release-assets/*')
    expect(desktop).toContain('apps/shell/release/latest.yml')
    expect(desktop).toContain('apps/shell/release/latest-mac.yml')
  })

  it('the desktop workflow no longer touches a CDN', () => {
    expect(desktop).not.toContain('cdn.redrob.ai')
    expect(desktop).not.toContain('REDROB_CDN')
    expect(desktop).not.toContain('aws s3')
  })
})


describe('Redrob Code sidecar packaging', () => {
  it('ships the platform sidecar at the runtime paths the transport resolves', () => {
    const c = loadBuilderConfig()
    const mac = (c.mac as { extraResources: Array<{ from: string; to: string }> }).extraResources
    const win = (c.win as { extraResources: Array<{ from: string; to: string }> }).extraResources
    const linux = (c.linux as { extraResources: Array<{ from: string; to: string }> }).extraResources
    expect(mac.some((entry) => entry.to === 'native/redrob-code')).toBe(true)
    expect(win.some((entry) => entry.to === 'native/redrob-code.exe')).toBe(true)
    expect(linux.some((entry) => entry.to === 'native/redrob-code')).toBe(true)
  })

  it('fails packaging when the staged Redrob Code binary is missing', () => {
    const source = readFileSync(resolve(SHELL_ROOT, 'electron-builder.cjs'), 'utf8')
    expect(source).toContain('function assertRedrobCodeBinaryPresent()')
    expect(source.slice(source.indexOf('beforePack:'))).toContain('assertRedrobCodeBinaryPresent()')
  })
})


describe('Redrob Code release workflow wiring', () => {
  it('builds and stages the Code sidecar for Windows, macOS, and Linux', () => {
    const desktop = readFileSync(resolve(REPO_ROOT, '.github/workflows/release-desktop.yml'), 'utf8')
    const linux = readFileSync(resolve(REPO_ROOT, '.github/workflows/release-linux.yml'), 'utf8')
    expect(desktop).toContain('redrob-windows-x64/bin/redrob.exe')
    expect(desktop).toContain('redrob-darwin-arm64/bin/redrob')
    expect(linux).toContain('redrob-linux-x64/bin/redrob')
    expect(desktop).toContain('APPLE_CODESIGN_CERT_P12_BASE64')
    expect(desktop).toContain('APPLE_NOTARY_API_KEY_P8_BASE64')
    expect(desktop).toContain('xcrun stapler validate')
  })
})
