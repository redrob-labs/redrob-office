/**
 * Set Up Show (ppt/presProps.xml <p:showPr>): parse, write, and the save →
 * reopen round trip, on a deck that has the part and on one that lacks it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  createBlankPptx,
  getShowSettings,
  openPptx,
  parseShowSettings,
  savePptx,
  setShowSettings,
  showSlideIndexes,
  DEFAULT_SHOW_SETTINGS,
} from '../src/index'
import { presPropsPath, withShowPr } from '../src/pres-props'

const here = dirname(fileURLToPath(import.meta.url))
const fx = (name: string) => readFileSync(join(here, 'fixtures', name))

describe('parseShowSettings', () => {
  it("uses PowerPoint's defaults when the part or element is absent", () => {
    expect(parseShowSettings(null)).toEqual(DEFAULT_SHOW_SETTINGS)
    expect(parseShowSettings('<p:presentationPr/>')).toEqual(DEFAULT_SHOW_SETTINGS)
  })

  it('reads kiosk, loop, timings, narration and a slide range', () => {
    const xml =
      '<p:presentationPr><p:showPr loop="1" showNarration="0" useTimings="0"><p:browse/><p:sldRg st="2" end="4"/><p:penClr><a:srgbClr val="FF0000"/></p:penClr></p:showPr></p:presentationPr>'
    expect(parseShowSettings(xml)).toEqual({
      type: 'speaker',
      loop: true,
      useTimings: false,
      showNarration: false,
      range: { kind: 'slides', from: 2, to: 4 },
    })
    expect(parseShowSettings('<p:showPr><p:kiosk restart="300000"/><p:custShow id="0"/></p:showPr>')).toMatchObject({
      type: 'kiosk',
      loop: true,
      range: { kind: 'custom', id: '0' },
    })
  })
})

describe('withShowPr', () => {
  it('replaces showPr in place and keeps the pen colour and the rest of the part', () => {
    const xml =
      '<p:presentationPr><p:showPr showNarration="1"><p:present/><p:sldAll/><p:penClr><a:prstClr val="red"/></p:penClr></p:showPr><p:extLst><p:ext uri="x"/></p:extLst></p:presentationPr>'
    const next = withShowPr(xml, { ...DEFAULT_SHOW_SETTINGS, loop: true })
    expect(next).toContain('<p:showPr loop="1" showNarration="1"><p:present/><p:sldAll/><p:penClr><a:prstClr val="red"/></p:penClr></p:showPr>')
    expect(next).toContain('<p:extLst><p:ext uri="x"/></p:extLst></p:presentationPr>')
  })

  it('inserts showPr before clrMru and extLst when there is none', () => {
    const next = withShowPr('<p:presentationPr><p:prnPr/><p:clrMru/><p:extLst/></p:presentationPr>', DEFAULT_SHOW_SETTINGS)
    expect(next.indexOf('<p:prnPr/>')).toBeLessThan(next.indexOf('<p:showPr'))
    expect(next.indexOf('<p:showPr')).toBeLessThan(next.indexOf('<p:clrMru/>'))
  })
})

describe('setShowSettings round trip', () => {
  it('survives save and reopen on a real deck', async () => {
    const opened = await openPptx(fx('01_standard_business.pptx'))
    const written = setShowSettings(opened, {
      type: 'speaker',
      loop: true,
      useTimings: false,
      showNarration: true,
      range: { kind: 'slides', from: 2, to: 3 },
    })
    expect(written.range).toEqual({ kind: 'slides', from: 2, to: 3 })
    const reopened = await openPptx(await savePptx(opened))
    expect(getShowSettings(reopened)).toEqual(written)
  })

  it('creates and registers the part on a deck without one, and normalizes a kiosk', async () => {
    const opened = await openPptx(await createBlankPptx())
    opened.archive.entries.delete('ppt/presProps.xml')
    const written = setShowSettings(opened, { ...DEFAULT_SHOW_SETTINGS, type: 'kiosk', loop: false, useTimings: false, range: { kind: 'slides', from: 1, to: 9 } })
    expect(written).toMatchObject({ type: 'kiosk', loop: true, useTimings: true, range: { kind: 'all' } })
    const path = presPropsPath(opened.archive)
    expect(path).toBe('ppt/presProps.xml')
    expect(opened.archive.readText('[Content_Types].xml')).toContain('PartName="/ppt/presProps.xml"')
    const reopened = await openPptx(await savePptx(opened))
    expect(getShowSettings(reopened)).toEqual(written)
  })
})

describe('showSlideIndexes', () => {
  it('turns a 1-based range into deck indexes, clamped to the deck', () => {
    expect(showSlideIndexes({ ...DEFAULT_SHOW_SETTINGS, range: { kind: 'slides', from: 2, to: 9 } }, 4)).toEqual([1, 2, 3])
    expect(showSlideIndexes(DEFAULT_SHOW_SETTINGS, 3)).toEqual([0, 1, 2])
  })
})
