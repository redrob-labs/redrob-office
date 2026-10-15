import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

describe('the asset-name check over a built release directory', () => {
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

  it('PASSES a directory of launcher-named packages and feed files, without a manifest or checksums', () => {
    // redrob-launcher.json and SHA256SUMS.txt are written by the shared publish job
    // (redrob-labs/.github release-publish.yml) over the downloaded artifacts; the build
    // jobs check apps/shell/release before that, so neither may be required here.
    const dir = releaseDir({ [PACKAGE]: '', 'latest-linux.yml': '' })
    try {
      const result = check(dir)
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toContain(`${PACKAGE} ok`)
      expect(result.stdout).not.toContain('redrob-launcher.json')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("ignores electron-builder's own files and the publish job's side files", () => {
    // The build jobs run the check over apps/shell/release as electron-builder left it,
    // which holds builder-debug.yml (and builder-effective-config.yaml) beside the
    // packages. v0.10.0's macOS and Windows jobs failed on exactly that.
    const dir = releaseDir({
      [PACKAGE]: '',
      'latest-linux.yml': '',
      'builder-debug.yml': '',
      'builder-effective-config.yaml': '',
      'redrob-launcher.json': '{ "schema": 1, "sharedAccount": true }\n',
    })
    try {
      const result = check(dir)
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).not.toContain('builder-debug.yml')
      expect(result.stdout).toContain(`${PACKAGE} ok`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('FAILS a name the launcher does not read', () => {
    const dir = releaseDir({ 'Redrob-Office-Setup-0.0.0.exe': '' })
    try {
      const result = check(dir)
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('not a name the launcher reads')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('the repository carries no manifest writer, checksum step or release-create of its own', () => {
    // Those are the shared publish job's. A second copy here would drift from it.
    expect(existsSync(resolve(REPO_ROOT, 'scripts/write-launcher-manifest.mjs'))).toBe(false)
    const desktop = readFileSync(resolve(REPO_ROOT, '.github/workflows/release-desktop.yml'), 'utf8')
    expect(desktop).not.toContain('write-launcher-manifest')
    expect(desktop).not.toContain('softprops/action-gh-release')
    expect(desktop).not.toContain('gh release')
    expect(desktop).not.toContain('sha256sum')
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

describe('the release workflow (release-desktop.yml) targets @genoffice/shell', () => {
  const workflow = readFileSync(
    resolve(REPO_ROOT, '.github/workflows/release-desktop.yml'),
    'utf8',
  )
  const job = (name: string) => {
    const start = workflow.indexOf(`\n  ${name}:\n`)
    expect(start, name).toBeGreaterThan(-1)
    const next = workflow.slice(start + 1).search(/\n  [a-z-]+:\n/)
    return next === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + next)
  }

  it('is the one release workflow: Windows, macOS and Linux from one tag, then one publish', () => {
    expect(existsSync(resolve(REPO_ROOT, '.github/workflows/release-linux.yml'))).toBe(false)
    expect(workflow).toContain('"v*"')
    for (const name of ['version', 'windows', 'macos', 'linux', 'publish']) expect(job(name)).toBeTruthy()
    for (const name of ['windows', 'macos', 'linux']) expect(job(name)).toContain('needs: version')
    expect(job('publish')).toContain('needs: [version, windows, macos, linux]')
  })

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

  it('resolves one commit for the tag and builds exactly that commit on every leg', () => {
    // v0.8.3 was dispatched with --ref develop while the tag pointed at main: the build jobs
    // did a bare checkout and published develop's bytes under main's version number.
    const version = job('version')
    expect(version).toContain('git merge-base --is-ancestor "$TAG_SHA" origin/main')
    expect(version).toContain('does not match Redrob Office (apps/shell) version')
    expect(version).toContain('echo "sha=$TAG_SHA"')
    for (const name of ['windows', 'macos', 'linux']) {
      expect(job(name), name).toContain('ref: ${{ needs.version.outputs.sha }}')
    }
    expect(workflow).not.toContain("inputs.tag || github.ref")
  })

  it('has a dry run: workflow_dispatch with dry_run builds the dispatched ref and publishes nothing', () => {
    expect(workflow).toContain('dry_run:')
    expect(workflow).toContain('type: boolean')
    const version = job('version')
    expect(version).toContain('if [ "$DRY_RUN" = true ]; then')
    expect(version).toContain('echo "sha=$GITHUB_SHA"')
    expect(version).toContain('echo "publish=false"')
    expect(job('publish')).toContain("needs.version.outputs.publish == 'true'")
  })

  it('signs Windows through the shared sign-windows recipe over OIDC, never a certificate file', () => {
    // The federated credential accepts repo:redrob-labs/*:environment:release
    // only, so the job must run in that environment and mint an id-token.
    const windowsJob = job('windows')
    expect(windowsJob).toContain('environment: release')
    expect(windowsJob).toContain('id-token: write')
    expect(windowsJob).toContain('uses: azure/login@v3')
    expect(windowsJob).toContain('GENOFFICE_WIN_SIGN_MODE: production')
    for (const name of ['ARTIFACT_SIGNING_ENDPOINT', 'ARTIFACT_SIGNING_ACCOUNT', 'ARTIFACT_SIGNING_CERT_PROFILE']) {
      expect(windowsJob).toContain(`${name}: \${{ secrets.${name} }}`)
    }
    // the shared recipe: checked out for the electron-builder hook, called as a step for the sidecar
    expect(windowsJob).toContain('repository: redrob-labs/.github')
    expect(windowsJob).toContain('path: .redrob-shared')
    expect(windowsJob).toContain('uses: redrob-labs/.github/actions/sign-windows@main')
    expect(windowsJob).toContain('files: apps/shell/build/redrob-code.exe')
    expect(windowsJob).toContain('SIGN_DESCRIPTION: Redrob Office')
    expect(windowsJob).toContain('EXPECTED_CN: McKinley Rice, Inc.')
    // the repository's own recipe is gone, along with every certificate-file path
    expect(existsSync(resolve(REPO_ROOT, 'scripts/win-sign.ps1'))).toBe(false)
    expect(workflow).not.toContain('scripts/win-sign.ps1')
    expect(workflow).not.toContain('Microsoft.ArtifactSigning.Client')
    for (const gone of ['WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD', 'CSC_LINK: ${{ secrets.WIN', '.pfx', 'AZURE_CLIENT_SECRET', 'NotTrusted', 'UnknownError']) {
      expect(workflow).not.toContain(gone)
    }
    // and one full Authenticode check over the bytes that ship
    expect(windowsJob).toContain('verify /pa /v')
    expect(windowsJob).toContain('win-unpacked/resources/native/redrob-code.exe')
  })

  it('logs in to Azure after the build and immediately before signing', () => {
    // GitHub's OIDC token lives minutes. A login before the ~12-minute suite build
    // left signtool without a usable credential (it fell back to a browser prompt
    // and hung), so the order must be: build, login, sign sidecar, sign+package.
    const windowsJob = job('windows')
    const build = windowsJob.indexOf('run: pnpm build')
    const login = windowsJob.indexOf('uses: azure/login@v3')
    const sidecar = windowsJob.indexOf('uses: redrob-labs/.github/actions/sign-windows@main')
    const pack = windowsJob.indexOf('exec electron-builder --config electron-builder.cjs --win')
    expect(build).toBeGreaterThan(-1)
    expect(login).toBeGreaterThan(build)
    expect(sidecar).toBeGreaterThan(login)
    expect(pack).toBeGreaterThan(sidecar)
    // between the login and the package step only the sidecar signing runs; no build
    const packStep = windowsJob.lastIndexOf('- name:', pack)
    const between = windowsJob.slice(login, packStep)
    expect(between).toContain('- name: Sign the Redrob Code sidecar')
    expect(between).not.toContain('run: pnpm')
    // the login is skipped when signing is not configured, and takes only the plain IDs
    const loginStep = windowsJob.slice(windowsJob.lastIndexOf('- name:', login), sidecar)
    expect(loginStep).toContain("if: env.AZURE_CLIENT_ID != ''")
    for (const name of ['AZURE_CLIENT_ID', 'AZURE_TENANT_ID', 'AZURE_SUBSCRIPTION_ID']) {
      expect(loginStep).toContain(`\${{ secrets.${name} }}`)
    }
    // the build step itself does not package (packaging is where the sign hook runs)
    expect(windowsJob.slice(0, login)).not.toContain('electron-builder --config')
  })

  it('wires the electron-builder signing hook to the shared sign.ps1 and nothing else', () => {
    const builder = readFileSync(resolve(REPO_ROOT, 'apps/shell/electron-builder.cjs'), 'utf8')
    expect(builder).toContain("'../../scripts/win-sign.cjs'")
    const hook = readFileSync(resolve(REPO_ROOT, 'scripts/win-sign.cjs'), 'utf8')
    expect(hook).toContain("'.redrob-shared', 'actions', 'sign-windows', 'sign.ps1'")
    // no recipe of its own: no signtool invocation, no dlib, no metadata, no verify
    for (const gone of ['signtool.exe', 'Invoke-SignTool', '/dlib', 'metadata.json', 'Get-AuthenticodeSignature', 'WIN_CSC', '.pfx', 'ExcludeCredentials']) {
      expect(hook).not.toContain(gone)
    }
    // the CI checkout of the shared repository is never committed
    expect(readFileSync(resolve(REPO_ROOT, '.gitignore'), 'utf8')).toContain('.redrob-shared/')
  })

  it('uploads release-* artifacts the shared publish job collects, with the updater feed files', () => {
    expect(job('windows')).toContain('name: release-windows-x64')
    expect(job('macos')).toContain('name: release-macos-arm64')
    expect(job('linux')).toContain('name: release-linux-x64')
    expect(workflow).toContain('apps/shell/release/latest.yml')
    expect(workflow).toContain('apps/shell/release/latest-mac.yml')
    expect(workflow).toContain('apps/shell/release/latest-linux.yml')
    expect(workflow).toContain('*-setup.exe')
    expect(workflow).toContain('*-portable.zip')
    expect(workflow).toContain('--win nsis zip --x64')
    expect(workflow).toContain('node scripts/check-release-asset-names.mjs apps/shell/release')
    expect(workflow).not.toContain('signed-windows')
    expect(workflow).not.toContain('signed-macos')
  })

  it('publishes through the shared release-publish job, only on a tag and only when every leg is green', () => {
    const publish = job('publish')
    expect(publish).toContain('uses: redrob-labs/.github/.github/workflows/release-publish.yml@main')
    expect(publish).toContain('title: Redrob Office')
    expect(publish).toContain('launcher_manifest: true')
    expect(publish).toContain('publish: true')
    expect(publish).toContain('version: ${{ needs.version.outputs.version }}')
    expect(publish).toContain('target: ${{ needs.version.outputs.sha }}')
    expect(publish).toContain("!contains(needs.*.result, 'failure')")
    expect(publish).toContain("!contains(needs.*.result, 'cancelled')")
    expect(publish).toContain('contents: write')
  })

  it('generates THIRD-PARTY-NOTICES before packaging (beforePack asserts it exists)', () => {
    // This job runs electron-builder directly, not the dist:* scripts that
    // would run `notices`, so it must generate the file itself. Without this
    // step the v0.8.0 Windows job failed: beforePack's
    // assertThirdPartyNoticesPresent threw on the missing file.
    for (const name of ['windows', 'macos', 'linux']) {
      const body = job(name)
      const buildIdx = body.indexOf('run: pnpm build')
      const noticesIdx = body.indexOf('run notices')
      const packageIdx = body.indexOf('exec electron-builder --config electron-builder.cjs')
      expect(buildIdx, name).toBeGreaterThan(-1)
      expect(noticesIdx, name).toBeGreaterThan(buildIdx)
      expect(packageIdx, name).toBeGreaterThan(noticesIdx)
    }
  })

  it('the Linux leg installs rpmbuild and stable Rust, uses pnpm 9.15 / Node 24, and ships the three packages', () => {
    const linux = job('linux')
    expect(linux).toContain('install --yes --no-install-recommends rpm')
    expect(linux).toContain('dtolnay/rust-toolchain@stable')
    expect(linux).toContain('version: 9.15.0')
    expect(linux).toContain('node-version: "24"')
    expect(linux).toContain('--linux AppImage deb rpm')
    expect(linux).toContain('--publish never')
    expect(linux).toContain('"redrob-office-${APP_VERSION}-linux-x86_64.AppImage"')
    expect(linux).toContain('"redrob-office-${APP_VERSION}-linux-x86_64.deb"')
    expect(linux).toContain('"redrob-office-${APP_VERSION}-linux-x86_64.rpm"')
    expect(linux).toContain('GENOFFICE_UPDATE_REPO: ${{ github.repository }}')
  })

  it('names no CDN host, bucket or credential', () => {
    expect(workflow).not.toContain('cdn.redrob.ai')
    expect(workflow).not.toContain('REDROB_CDN')
    expect(workflow).not.toContain('aws s3')
  })
})


describe('gitflow is the shared caller', () => {
  it('calls redrob-labs/.github gitflow.yml and carries no type list of its own', () => {
    const gitflow = readFileSync(resolve(REPO_ROOT, '.github/workflows/gitflow.yml'), 'utf8')
    expect(gitflow).toContain('uses: redrob-labs/.github/.github/workflows/gitflow.yml@main')
    expect(gitflow).not.toContain('ALLOWED_TYPES')
    expect(gitflow).toContain('pull-requests: write')
  })
})


describe('the update feed comes from GitHub Releases, not a CDN', () => {
  const builder = readFileSync(resolve(SHELL_ROOT, 'electron-builder.cjs'), 'utf8')

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
  it('fetches and stages the released Code sidecar for Windows, macOS, and Linux', () => {
    const desktop = readFileSync(resolve(REPO_ROOT, '.github/workflows/release-desktop.yml'), 'utf8')
    expect(desktop).toContain('scripts/fetch-redrob-code.sh windows-x64')
    expect(desktop).toContain('scripts/fetch-redrob-code.sh darwin-arm64')
    expect(desktop).toContain('scripts/fetch-redrob-code.sh linux-x64')
    expect(desktop).not.toContain('repository: redrob-labs/redrob-code')
    expect(desktop).not.toContain('oven-sh/setup-bun')
    expect(desktop).toContain('APPLE_CODESIGN_CERT_P12_BASE64')
    expect(desktop).toContain('APPLE_NOTARY_API_KEY_P8_BASE64')
    expect(desktop).toContain('xcrun stapler validate')
    // The bundled sidecar is the engine's newest release, resolved once by the version job and
    // handed to every leg; a pin file would only go stale (0.10.6 shipped a months-old engine).
    expect(existsSync(resolve(REPO_ROOT, 'apps/shell/redrob-code.version'))).toBe(false)
    expect(desktop).toContain('engine: ${{ steps.engine.outputs.tag }}')
    expect(desktop).toContain('gh api repos/redrob-labs/redrob-code/releases/latest --jq .tag_name')
    expect(desktop.match(/REDROB_CODE_VERSION: \$\{\{ needs\.version\.outputs\.engine \}\}/g)).toHaveLength(3)
    const script = readFileSync(resolve(REPO_ROOT, 'scripts/fetch-redrob-code.sh'), 'utf8')
    expect(script).toContain('tag="${REDROB_CODE_VERSION:-}"')
    expect(script).toContain('gh release view --repo "$repo" --json tagName --jq .tagName')
    expect(script).toContain('SHA256SUMS.txt')
    expect(script).toContain('sha256 -c -')
    expect(script).toContain('shasum -a 256')
    expect(script).toContain('apps/shell/build/$target')
    expect(script).toContain('apps/shell/build/redrob-code.version')
  })
})
