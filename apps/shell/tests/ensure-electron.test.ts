import { describe, expect, it } from 'vitest'
// The postinstall electron-bootstrap logic lives at the repo root because it
// spans both Electron majors (shell = 43, office = 35). We test its pure
// decision helpers here, in the workspace that owns the shell dev-launch that
// the bug (`Error: Electron uninstall`) broke.
// @ts-expect-error - plain .mjs helper module, no type declarations
import { decideAction, expectedPathTxt, inspectBinary, isBinaryPresent } from '../../../scripts/ensure-electron-lib.mjs'

const LINUX = 'electron'

/** A fully-present, version-matched Linux install. */
const present = {
  pathFileExists: true,
  pathFileContents: LINUX,
  distBinaryExists: true,
  expectedPathTxt: LINUX,
  distVersion: 'v43.6.0',
  packageVersion: '43.6.0',
}

describe('expectedPathTxt', () => {
  it('is the platform executable path electron install.js writes', () => {
    expect(expectedPathTxt('linux')).toBe('electron')
    expect(expectedPathTxt('win32')).toBe('electron.exe')
    expect(expectedPathTxt('darwin')).toBe('Electron.app/Contents/MacOS/Electron')
  })
})

describe('inspectBinary', () => {
  it('is present when path.txt, dist binary, and version all match', () => {
    const r = inspectBinary(present)
    expect(r.present).toBe(true)
    expect(r.reason).toBe('ok')
  })

  it('is absent when path.txt is missing or empty', () => {
    expect(inspectBinary({ ...present, pathFileExists: false }).reason).toBe('no-path-txt')
    expect(inspectBinary({ ...present, pathFileContents: '   ' }).reason).toBe('empty-path-txt')
  })

  it('rejects a path.txt from the wrong platform', () => {
    const r = inspectBinary({ ...present, pathFileContents: 'electron.exe' }) // win path on linux
    expect(r.present).toBe(false)
    expect(r.reason).toBe('path-txt-platform-mismatch')
  })

  it('is absent when the dist binary is missing (the original reported bug)', () => {
    expect(inspectBinary({ ...present, distBinaryExists: false }).reason).toBe('no-dist-binary')
  })

  it('rejects a version mismatch between dist/version and the package version', () => {
    const r = inspectBinary({ ...present, distVersion: 'v99.0.0' })
    expect(r.present).toBe(false)
    expect(r.reason).toBe('version-mismatch')
  })

  it('accepts version with or without a leading v', () => {
    expect(inspectBinary({ ...present, distVersion: '43.6.0' }).present).toBe(true)
  })

  it('rejects a missing dist/version', () => {
    expect(inspectBinary({ ...present, distVersion: '' }).reason).toBe('no-dist-version')
  })

  it('honors ELECTRON_OVERRIDE_DIST_PATH only when the override path exists', () => {
    expect(
      inspectBinary({
        ...present,
        distBinaryExists: false,
        overrideDistPath: '/prebuilt/electron',
        overrideDistExists: true,
      }).reason,
    ).toBe('override-dist-path')
    const missing = inspectBinary({
      ...present,
      overrideDistPath: '/prebuilt/electron',
      overrideDistExists: false,
    })
    expect(missing.present).toBe(false)
    expect(missing.reason).toBe('override-dist-path-missing')
  })

  it('isBinaryPresent is the boolean wrapper', () => {
    expect(isBinaryPresent(present)).toBe(true)
    expect(isBinaryPresent({ ...present, distVersion: 'v1.0.0' })).toBe(false)
  })
})

describe('decideAction', () => {
  it('skips a consumer with no electron dependency', () => {
    expect(decideAction({ resolved: false, binaryPresent: false, installerExists: false })).toBe(
      'skip-no-dep',
    )
  })

  it('is a no-op when the binary is already present (idempotent re-run)', () => {
    expect(decideAction({ resolved: true, binaryPresent: true, installerExists: true })).toBe(
      'ok-present',
    )
  })

  it('runs the installer when the binary is missing but install.js exists', () => {
    expect(decideAction({ resolved: true, binaryPresent: false, installerExists: true })).toBe(
      'run-installer',
    )
  })

  it('fails loudly when the binary is missing and there is no installer', () => {
    expect(decideAction({ resolved: true, binaryPresent: false, installerExists: false })).toBe(
      'fail-no-installer',
    )
  })
})
