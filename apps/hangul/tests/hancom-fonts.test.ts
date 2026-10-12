// 한컴오피스's own font folders as the editor's font provider (task 1.3, E8; R2.5).
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { familyNames, hancomFontRoots, hancomFontSource, scanFonts } from '../src/main/hancom-fonts'

/** A font file with only a name table: family names in English and Korean. */
function fakeFont(names: string[], collection = false): Buffer {
  const strings = names.map((n) => {
    const b = Buffer.alloc(n.length * 2)
    for (let i = 0; i < n.length; i++) b.writeUInt16BE(n.charCodeAt(i), i * 2)
    return b
  })
  const stringOffset = 6 + names.length * 12
  const name = Buffer.alloc(stringOffset + strings.reduce((a, b) => a + b.length, 0))
  name.writeUInt16BE(0, 0)
  name.writeUInt16BE(names.length, 2)
  name.writeUInt16BE(stringOffset, 4)
  let off = 0
  strings.forEach((b, i) => {
    const r = 6 + i * 12
    name.writeUInt16BE(3, r)
    name.writeUInt16BE(1, r + 2)
    name.writeUInt16BE(i === 0 ? 0x409 : 0x412, r + 4)
    name.writeUInt16BE(1, r + 6)
    name.writeUInt16BE(b.length, r + 8)
    name.writeUInt16BE(off, r + 10)
    b.copy(name, stringOffset + off)
    off += b.length
  })
  const base = collection ? 16 : 0
  const dir = Buffer.alloc(12 + 16)
  dir.writeUInt32BE(0x00010000, 0)
  dir.writeUInt16BE(1, 4)
  dir.write('name', 12, 'latin1')
  dir.writeUInt32BE(base + 28, 12 + 8)
  dir.writeUInt32BE(name.length, 12 + 12)
  const ttc = Buffer.alloc(16)
  ttc.write('ttcf', 0, 'latin1')
  ttc.writeUInt32BE(0x00010000, 4)
  ttc.writeUInt32BE(1, 8)
  ttc.writeUInt32BE(16, 12)
  return Buffer.concat([...(collection ? [ttc] : []), dir, name])
}

const dirs: string[] = []
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
})

describe('Hancom font folders', () => {
  it('reads the family names of a font and of the first face in a collection', async () => {
    const d = await mkdtemp(join(tmpdir(), 'hf-'))
    dirs.push(d)
    await writeFile(join(d, 'a.ttf'), fakeFont(['HYGyeonMyeongJo', 'HY견명조']))
    await writeFile(join(d, 'b.ttc'), fakeFont(['Hamchorom', '함초롬'], true))
    expect(await familyNames(join(d, 'a.ttf'))).toEqual(['HYGyeonMyeongJo', 'HY견명조'])
    expect(await familyNames(join(d, 'b.ttc'))).toEqual(['Hamchorom', '함초롬'])
  })

  it('finds faces in nested folders by either name, and serves only what it found', async () => {
    const d = await mkdtemp(join(tmpdir(), 'hf-'))
    dirs.push(d)
    const ttf = join(d, 'Office 2024', 'HOffice130', 'Shared', 'TTF')
    await mkdir(ttf, { recursive: true })
    const bytes = fakeFont(['HYGyeonMyeongJo', 'HY견명조'])
    await writeFile(join(ttf, 'H2GTRE.TTF'), bytes)
    await writeFile(join(ttf, 'readme.txt'), 'not a font')
    const index = await scanFonts([d])
    expect([...index.keys()].sort()).toEqual(['hygyeonmyeongjo', 'hy견명조'])
    const source = hancomFontSource(() => [d])
    expect(Buffer.from((await source('HY견명조'))!)).toEqual(bytes)
    expect(Buffer.from((await source('hygyeonmyeongjo'))!)).toEqual(bytes)
    expect(await source('휴먼명조')).toBeNull()
    expect(await source(join(ttf, 'H2GTRE.TTF'))).toBeNull()
    expect(await source(42)).toBeNull()
  })

  it('looks where 한컴오피스 installs on each platform, plus REDROB_HANGUL_FONT_DIRS', () => {
    const win = hancomFontRoots('win32', { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', REDROB_HANGUL_FONT_DIRS: '' })
    expect(win.some((r) => r.includes('Program Files') && r.endsWith('Hnc'))).toBe(true)
    expect(hancomFontRoots('darwin', {})).toEqual(['/Applications'])
    expect(hancomFontRoots('linux', { REDROB_HANGUL_FONT_DIRS: '/a:/b' })).toEqual(['/opt/hnc', '/opt/hancom', '/a', '/b'])
  })
})
