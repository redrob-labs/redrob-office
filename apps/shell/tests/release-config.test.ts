import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Release/packaging contract for the Redrob Office suite shell (@genoffice/shell).
 *
 * Two things this locks:
 *  1. the PACKAGED product name is "Redrob Office", while the upgrade identity
 *     (appId), the executable name, and the update-feed artifact filenames stay
 *     on their historic values so a display rename never breaks auto-update; and
 *  2. the desktop release workflow builds/signs/packages THIS shell, not the
 *     legacy @redrob/office recruiting app.
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

  it('pins artifact/update-feed filenames to the historic "Redrob-" base (not productName)', () => {
    const c = loadBuilderConfig()
    // If these keyed off productName they would become "Redrob Office-…", a new
    // filename electron-updater would not recognize as the same lineage.
    expect((c.mac as { artifactName: string }).artifactName).toBe('Redrob-${version}-${arch}.${ext}')
    expect((c.nsis as { artifactName: string }).artifactName).toBe('Redrob-Setup-${version}.${ext}')
    expect((c.linux as { artifactName: string }).artifactName).toBe('Redrob-${version}.${ext}')
    // deb/rpm keep their pinned package + artifact names (apt/dnf upgrade lineage)
    expect((c.deb as { packageName: string }).packageName).toBe('redrob')
    expect((c.rpm as { packageName: string }).packageName).toBe('redrob')
    expect((c.deb as { artifactName: string }).artifactName).toBe('redrob_${version}_${arch}.deb')
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

  it('does NOT reference the legacy @redrob/office / office/release / office version', () => {
    expect(workflow).not.toContain('@redrob/office')
    expect(workflow).not.toContain('office/release')
    expect(workflow).not.toContain('electron-builder.yml')
    expect(workflow).not.toContain("require('./office/package.json')")
  })

  it('preserves Authenticode verification and updater metadata upload', () => {
    expect(workflow).toContain('WIN_CSC_LINK')
    expect(workflow).toContain('WIN_CSC_KEY_PASSWORD')
    expect(workflow).toContain('Get-AuthenticodeSignature')
    expect(workflow).toContain('SignerCertificate')
    expect(workflow).toContain('apps/shell/release/latest.yml')
    expect(workflow).toContain('*Setup*.exe')
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


describe('Office CDN publisher workflow', () => {
  const workflow = readFileSync(
    resolve(REPO_ROOT, '.github/workflows/release-office-cdn.yml'),
    'utf8',
  )

  it('triggers on v* tags (the same tag the Windows release workflow uses)', () => {
    expect(workflow).toContain('tags:')
    expect(workflow).toContain('"v*"')
    // shares the tag with the GitHub Windows release workflow
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
    expect(workflow).toContain('apt-get install -y rpm')
    expect(workflow).toContain('dtolnay/rust-toolchain@stable')
    expect(workflow).toContain('version: 9.15.0')
    expect(workflow).toContain('node-version: "24"')
  })

  it('builds the unsigned Linux AppImage/deb/rpm for the shell', () => {
    expect(workflow).toContain('@genoffice/shell')
    expect(workflow).toContain('--config electron-builder.cjs')
    expect(workflow).toContain('--linux AppImage deb rpm')
    expect(workflow).toContain('--publish never')
  })

  it('generates third-party notices before packaging', () => {
    const noticesIdx = workflow.indexOf('run notices')
    const packageIdx = workflow.indexOf('--linux AppImage deb rpm')
    expect(noticesIdx).toBeGreaterThan(-1)
    expect(packageIdx).toBeGreaterThan(-1)
    // notices step comes before the package step
    expect(noticesIdx).toBeLessThan(packageIdx)
  })

  it('stages exactly the three artifacts named by electron-builder.cjs and their sha256 sidecars', () => {
    const c = loadBuilderConfig()
    const appimage = (c.linux as { artifactName: string }).artifactName
    const deb = (c.deb as { artifactName: string }).artifactName
    const rpm = (c.rpm as { artifactName: string }).artifactName
    // the workflow builds the concrete names from ${APP_VERSION}; assert the
    // template shape it uses lines up with the config templates
    expect(appimage).toBe('Redrob-${version}.${ext}')
    expect(workflow).toContain('Redrob-${APP_VERSION}.AppImage')
    expect(deb).toBe('redrob_${version}_${arch}.deb')
    expect(workflow).toContain('redrob_${APP_VERSION}_amd64.deb')
    expect(rpm).toBe('redrob-${version}.${arch}.rpm')
    expect(workflow).toContain('redrob-${APP_VERSION}.x86_64.rpm')
    // sha256 sidecars are produced for each
    expect(workflow).toContain('sha256sum')
  })

  it('uploads no extra junk (no blockmaps, latest*.yml, or the unpacked tree)', () => {
    // Only the cdn-staging dir (the 3 artifacts + their .sha256) is uploaded.
    expect(workflow).toContain('cdn-staging')
    expect(workflow).not.toContain('.blockmap')
    expect(workflow).not.toContain('latest-linux.yml')
    expect(workflow).not.toContain('linux-unpacked')
  })

  it('uses the org CDN vars/secrets and the "office" prefix', () => {
    expect(workflow).toContain('vars.REDROB_CDN_BUCKET')
    expect(workflow).toContain('secrets.REDROB_CDN_ACCESS_KEY_ID')
    expect(workflow).toContain('secrets.REDROB_CDN_SECRET_ACCESS_KEY')
    expect(workflow).toContain('CDN_PREFIX: office')
    expect(workflow).toContain('/${CDN_PREFIX}/${APP_VERSION}')
  })

  it('gates publish + verify on credentials so forks build-only (no publish, no false success)', () => {
    expect(workflow).toContain('has_cdn_credentials')
    // both the upload and the verify step are guarded
    const publishGuard = workflow.indexOf("if: steps.guard.outputs.has_cdn_credentials == 'true'")
    expect(publishGuard).toBeGreaterThan(-1)
    // guard is evaluated from the presence of the bucket + keys
    expect(workflow).toContain('[ -n "$REDROB_CDN_BUCKET" ]')
    expect(workflow).toContain('Building packages only; nothing will be uploaded')
  })

  it('verifies every public versioned CloudFront URL by HTTP GET and checksum match', () => {
    expect(workflow).toContain('CDN_PUBLIC_HOST')
    expect(workflow).toContain('curl --fail')
    expect(workflow).toContain('Checksum mismatch')
    // the versioned verify step retrieves under the same office/<version> path
    // it uploaded
    expect(workflow).toContain('https://${CDN_PUBLIC_HOST}/${CDN_PREFIX}/${APP_VERSION}')
  })

  it('uploads versioned as immutable and promotes latest by re-uploading local bytes (no server-side copy)', () => {
    // office/<version>/ is written once and cached forever.
    expect(workflow).toContain('public, max-age=31536000, immutable')
    // office/latest/ must be revalidated on every fetch, or clients keep a
    // stale release after the pointer moves.
    expect(workflow).toContain('no-cache, max-age=0, must-revalidate')

    // The PutObject-only CDN credentials cannot Head/Get/List, so latest must
    // be promoted by re-uploading the local staged files, NOT by a server-side
    // s3://<version>/ -> s3://latest/ copy (which HeadObjects the source and
    // 403s — the v0.8.0 failure). The promote step must upload from the local
    // cdn-staging dir and must not reference an s3:// source or a copy's
    // metadata-directive.
    const promote = workflow.slice(
      workflow.indexOf('Promote verified artifacts to office/latest'),
      workflow.indexOf('Verify public latest CloudFront URLs'),
    )
    expect(promote).toContain('aws s3 cp "$f"')
    expect(promote).toContain('${CDN_PREFIX}/latest')
    expect(promote).not.toContain('--metadata-directive')
    // no s3:// SOURCE in the promote cp (would trigger a HeadObject)
    expect(promote).not.toMatch(/aws s3 cp "s3:\/\//)
    expect(promote).not.toContain('${CDN_PREFIX}/${APP_VERSION}')
  })

  it('the latest promotion depends on no Head/Get/List S3 permission', () => {
    // Guard against reintroducing operations the PutObject-only credentials
    // cannot perform on the CDN bucket. Inspect only executable lines (drop
    // comment lines, which legitimately mention the s3->s3 copy we avoid).
    const commandLines = workflow
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n')
    expect(commandLines).not.toContain('aws s3api head-object')
    expect(commandLines).not.toContain('aws s3api get-object')
    expect(commandLines).not.toContain('aws s3api list-objects')
    expect(commandLines).not.toContain('aws s3 ls')
    // and no s3://->s3:// copy/move/sync anywhere in the actual commands
    expect(commandLines).not.toMatch(/aws s3 (cp|mv|sync) "?s3:\/\/[^"]*"? "?s3:\/\//)
  })

  it('verifies the versioned prefix BEFORE any latest write (order + gate)', () => {
    const versionedVerify = workflow.indexOf('Verify public versioned CloudFront URLs')
    const promote = workflow.indexOf('Promote verified artifacts to office/latest')
    const latestVerify = workflow.indexOf('Verify public latest CloudFront URLs')
    expect(versionedVerify).toBeGreaterThan(-1)
    expect(promote).toBeGreaterThan(-1)
    expect(latestVerify).toBeGreaterThan(-1)
    // strict order: verify versioned -> promote latest -> verify latest
    expect(versionedVerify).toBeLessThan(promote)
    expect(promote).toBeLessThan(latestVerify)
  })

  it('verifies every public latest CloudFront URL by HTTP GET and checksum match', () => {
    expect(workflow).toContain('https://${CDN_PUBLIC_HOST}/${CDN_PREFIX}/latest')
    // both a versioned and a latest verify loop exist (two curl --fail loops)
    const curlCount = (workflow.match(/curl --fail/g) ?? []).length
    expect(curlCount).toBeGreaterThanOrEqual(2)
    expect(workflow).toContain('Checksum mismatch for latest/')
  })

  it('never moves latest on preview / fork / no-credentials (can_promote_latest gate)', () => {
    expect(workflow).toContain('can_promote_latest')
    // promotion + latest-verify are gated on can_promote_latest, not merely on
    // credentials
    expect(workflow).toContain("if: steps.guard.outputs.can_promote_latest == 'true'")
    // can_promote_latest requires a real tag push (github.event_name == push)
    // AND credentials; a workflow_dispatch preview or fork does not qualify
    expect(workflow).toContain('"${{ github.event_name }}" = "push"')
    expect(workflow).toContain('office/latest/ will NOT be moved')
  })

  it('does not touch Windows signing or the GitHub Release (that stays in release-desktop.yml)', () => {
    expect(workflow).not.toContain('WIN_CSC_LINK')
    expect(workflow).not.toContain('action-gh-release')
    expect(workflow).not.toContain('--win')
  })

  it('publishes office/latest/ under version-free filenames', () => {
    // A latest URL with the version in it stops being the latest release the
    // moment the next one ships, so anything that links it (the Console product
    // page) would serve an old build from a URL claiming otherwise. latest/
    // therefore gets its own names; the versioned prefix keeps the stamped ones.
    for (const name of [
      'redrob-office-x64.AppImage',
      'redrob-office-x64.deb',
      'redrob-office-x64.rpm',
    ]) {
      expect(workflow).toContain(name)
    }
    const promote = workflow.slice(
      workflow.indexOf('Promote verified artifacts to office/latest'),
      workflow.indexOf('Verify public latest CloudFront URLs'),
    )
    // promoted from the version-free staging tree, never the stamped one
    expect(promote).toContain('cdn-latest/*')
    expect(promote).not.toContain('cdn-staging/*')
  })

  it('regenerates each sidecar so it names the file beside it', () => {
    // office/<version>/Redrob-0.8.2.AppImage.sha256 and
    // office/latest/redrob-office-x64.AppImage.sha256 hold the same hash but
    // different filenames; a copied sidecar would break `sha256sum -c` for
    // whichever name the reader actually downloaded.
    const stage = workflow.slice(
      workflow.indexOf('Stage artifacts and compute sha256 sidecars'),
      workflow.indexOf('Upload build artifacts'),
    )
    expect(stage).toContain('cd "$OUT" && sha256sum "$1"')
    expect(stage).toContain('cd "$LATEST" && sha256sum "$2"')
  })
})

describe('signed Windows installer reaches the CDN', () => {
  const workflow = readFileSync(
    resolve(REPO_ROOT, '.github/workflows/release-desktop.yml'),
    'utf8',
  )
  const cdn = workflow.slice(workflow.indexOf('Publish signed Windows installer to CDN'))

  it('publishes the installer the signing job produced, not a rebuilt one', () => {
    // Rebuilding would produce an UNSIGNED exe. The CDN copy has to be the same
    // bytes the Authenticode verification passed, which means the artifact.
    expect(cdn).toContain('needs: [windows]')
    expect(cdn).toContain('name: signed-windows')
    expect(cdn).toContain('Redrob-Setup-${APP_VERSION}.exe')
    expect(cdn).not.toContain('electron-builder')
  })

  it('uploads only the installer (blockmap and latest.yml stay on the Release)', () => {
    const stage = cdn.slice(
      cdn.indexOf('Stage the installer'),
      cdn.indexOf('Publish immutable versioned installer'),
    )
    expect(stage).not.toContain('.blockmap')
    expect(stage).not.toContain('latest.yml')
  })

  it('carries the version-free name under office/latest/', () => {
    expect(cdn).toContain('redrob-office-x64-setup.exe')
  })

  it('keeps the two-phase contract: versioned verify gates the latest write', () => {
    const versionedVerify = cdn.indexOf('Verify public versioned CloudFront URLs')
    const promote = cdn.indexOf('Promote verified installer to office/latest')
    const latestVerify = cdn.indexOf('Verify public latest CloudFront URLs')
    expect(versionedVerify).toBeGreaterThan(-1)
    expect(versionedVerify).toBeLessThan(promote)
    expect(promote).toBeLessThan(latestVerify)
    expect(cdn).toContain('public, max-age=31536000, immutable')
    expect(cdn).toContain('no-cache, max-age=0, must-revalidate')
    expect(cdn).toContain('Checksum mismatch')
  })

  it('needs no Head/Get/List permission the CDN credentials do not have', () => {
    const commandLines = cdn
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n')
    expect(commandLines).not.toMatch(/aws s3 (cp|mv|sync) "?s3:\/\/[^"]*"? "?s3:\/\//)
    expect(commandLines).not.toContain('aws s3api head-object')
    expect(commandLines).not.toContain('aws s3 ls')
  })

  it('never moves latest on a preview run, a fork, or without credentials', () => {
    expect(cdn).toContain('can_promote_latest')
    expect(cdn).toContain('"${{ github.event_name }}" = "push"')
    expect(cdn).toContain('office/latest/ will NOT be moved')
  })

  it('does not gate the GitHub Release on the CDN upload', () => {
    // The Release is the updater's feed and the tag's record; a CDN outage must
    // not withhold it. Only the signing job is a prerequisite for it.
    const release = workflow.slice(workflow.indexOf('name: Publish GitHub Release'))
    expect(release).toContain('needs: [windows]')
    expect(release).not.toContain('needs: [windows, cdn]')
  })
})
