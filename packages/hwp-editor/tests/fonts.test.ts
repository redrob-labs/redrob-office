import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { FontEnvironment, fontNames } from '../src'

beforeAll(() => initHwpCoreNode())

// A blank document asks for 함초롬바탕 and 함초롬돋움.
function env(installed: string[], extra: Partial<ConstructorParameters<typeof FontEnvironment>[1]> = {}) {
  const doc = HwpCoreDocument.blank()
  doc.insertText(0, 0, 0, '제1조 목적')
  const have = new Set(installed)
  return new FontEnvironment(() => doc, { check: (f) => have.has(f), ...extra })
}

describe('fonts on this machine (task 1.3, E8)', () => {
  it('reads the chains the core paints a page with', () => {
    const doc = HwpCoreDocument.blank()
    doc.insertText(0, 0, 0, '본문')
    const chains = doc.pageFontChains(0)
    expect(chains.length).toBeGreaterThan(0)
    expect(chains[0]![0]).toBe('함초롬바탕')
    expect(chains[0]!.at(-1)).toBe('serif')
    expect(doc.info().fontSubstitutions).toEqual([])
  })

  it('a page drawn with the faces it asks for is faithful', () => {
    const e = env(['함초롬바탕', '함초롬돋움'])
    expect(e.missing()).toEqual([])
    expect(e.page(0)).toMatchObject({ faces: ['함초롬바탕'], faithful: true })
  })

  it('a face known by its other name counts as installed', () => {
    expect(fontNames('함초롬바탕')).toContain('HCR Batang')
    expect(env(['HCR Batang', 'HCR Dotum']).page(0).faithful).toBe(true)
  })

  it('a missing face is reported with the face that draws it, and its page claims no fidelity', () => {
    const e = env(['Batang', '함초롬돋움'])
    expect(e.missing()).toEqual([{ face: '함초롬바탕', paintedWith: 'Batang' }])
    expect(e.page(0)).toMatchObject({ faithful: false, missing: [{ face: '함초롬바탕', paintedWith: 'Batang' }] })
    // nothing but a generic family left
    expect(env([]).missing().find((m) => m.face === '함초롬바탕')?.paintedWith).toBeNull()
  })

  it('a provider fills a gap once, and what it loads counts as available', async () => {
    const asked: string[] = []
    const added: string[] = []
    const e = env(['함초롬돋움'], {
      provider: async (face) => (asked.push(face), face === '함초롬바탕' ? new Uint8Array([0, 1, 0, 0]) : null),
      fonts: { add: (f: FontFace) => added.push(f.family) },
      makeFace: (family) => ({ family, load: async () => undefined }) as unknown as FontFace,
    })
    expect(await e.provide()).toEqual(['함초롬바탕'])
    expect(added).toEqual(['함초롬바탕'])
    expect(e.page(0).faithful).toBe(true)
    expect(await e.provide()).toEqual([])
    expect(asked).toEqual(['함초롬바탕'])
  })
})
