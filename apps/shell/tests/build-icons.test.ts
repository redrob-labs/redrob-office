import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Guard for the packaged macOS `.icns` app icons.
 *
 * The branding audit skips `build/` (binary/packaging assets), so a legacy
 * icon regressing there would otherwise go unnoticed. This test checks the
 * `.icns` files directly: they must be structurally valid ICNS, carry the
 * expected icon resolutions, and must NOT be the byte-identical legacy
 * GenOffice mark. Regenerate with `node apps/shell/build/gen-icns.mjs
 * apps/shell/build apps/docs/build` (needs `icnsutils`).
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..')

const ICNS_FILES = ['apps/shell/build/icon.icns', 'apps/docs/build/icon.icns']

/** md5 of the pre-rebrand GenOffice black-square .icns that used to ship. */
const LEGACY_ICNS_MD5 = 'a6ca83408eb32908bdb732303372a65b'

/** icns element type codes (4-byte ASCII) we expect the Redrob icon to carry. */
const EXPECTED_ELEMENTS = ['is32', 'il32', 'ih32', 'ic07', 'ic08', 'ic09', 'ic10']

function md5(buf: Buffer): string {
  return createHash('md5').update(buf).digest('hex')
}

/** Parse the top-level ICNS element type codes from the container. */
function icnsElementTypes(buf: Buffer): string[] {
  // Header: 'icns' magic (4 bytes) + total length (4 bytes, big-endian).
  expect(buf.subarray(0, 4).toString('ascii')).toBe('icns')
  const total = buf.readUInt32BE(4)
  expect(total).toBeLessThanOrEqual(buf.length)
  const types: string[] = []
  let offset = 8
  while (offset + 8 <= total) {
    const type = buf.subarray(offset, offset + 4).toString('ascii')
    const len = buf.readUInt32BE(offset + 4)
    if (len < 8 || offset + len > total) break
    types.push(type)
    offset += len
  }
  return types
}

describe('packaged .icns app icons are the Redrob mark', () => {
  for (const rel of ICNS_FILES) {
    describe(rel, () => {
      const abs = resolve(REPO_ROOT, rel)

      it('exists', () => {
        expect(existsSync(abs)).toBe(true)
      })

      it('is not the legacy GenOffice icon', () => {
        expect(md5(readFileSync(abs))).not.toBe(LEGACY_ICNS_MD5)
      })

      it('is a valid ICNS carrying the expected resolutions', () => {
        const types = icnsElementTypes(readFileSync(abs))
        for (const el of EXPECTED_ELEMENTS) {
          expect(types, `missing ${el} in ${rel}`).toContain(el)
        }
      })
    })
  }

  it('shell and docs ship the same Redrob icon', () => {
    const [shell, docs] = ICNS_FILES.map((rel) => md5(readFileSync(resolve(REPO_ROOT, rel))))
    expect(shell).toBe(docs)
  })
})
