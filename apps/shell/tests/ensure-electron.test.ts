import { describe, expect, it } from 'vitest'
// The postinstall electron-bootstrap logic lives at the repo root because it
// spans both Electron majors (shell = 43, office = 35). We test its pure
// decision helpers here, in the workspace that owns the shell dev-launch that
// the bug (`Error: Electron uninstall`) broke.
// @ts-expect-error - plain .mjs helper module, no type declarations
import { decideAction, isBinaryPresent } from '../../../scripts/ensure-electron-lib.mjs'

describe('isBinaryPresent', () => {
  it('is false when path.txt is absent', () => {
    expect(
      isBinaryPresent({ pathFileExists: false, pathFileContents: '', distBinaryExists: false }),
    ).toBe(false)
  })

  it('is false when path.txt is present but empty', () => {
    expect(
      isBinaryPresent({ pathFileExists: true, pathFileContents: '   ', distBinaryExists: true }),
    ).toBe(false)
  })

  it('is false when path.txt points at a dist binary that does not exist (the reported bug)', () => {
    expect(
      isBinaryPresent({
        pathFileExists: true,
        pathFileContents: 'electron',
        distBinaryExists: false,
      }),
    ).toBe(false)
  })

  it('is true when path.txt and the dist binary both exist', () => {
    expect(
      isBinaryPresent({
        pathFileExists: true,
        pathFileContents: 'electron',
        distBinaryExists: true,
      }),
    ).toBe(true)
  })

  it('trusts ELECTRON_OVERRIDE_DIST_PATH without a dist binary', () => {
    expect(
      isBinaryPresent({
        pathFileExists: true,
        pathFileContents: 'electron',
        distBinaryExists: false,
        overrideDistPath: '/some/prebuilt/electron',
      }),
    ).toBe(true)
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
