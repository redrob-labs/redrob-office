import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { buildPeopleXml, parseDocx, parsePeopleXml, saveDocx } from '../src/index'
import { buildDocx } from './helpers/build-docx'

const WORD_PEOPLE =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<w15:people xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">' +
  '<w15:person w15:author="Jae Gardner"><w15:presenceInfo w15:providerId="AD" w15:userId="S::jae@redrob.ai::1"/></w15:person>' +
  '<w15:person w15:author="Seunghyun &amp; Co"/>' +
  '</w15:people>'

describe('people.xml', () => {
  it('reads each person and their presence', () => {
    expect(parsePeopleXml(WORD_PEOPLE)).toEqual([
      { author: 'Jae Gardner', providerId: 'AD', userId: 'S::jae@redrob.ai::1' },
      { author: 'Seunghyun & Co' },
    ])
  })

  it('adds only people it does not list, leaving existing entries byte-identical', () => {
    expect(buildPeopleXml([{ author: 'Jae Gardner' }], WORD_PEOPLE)).toBeNull()
    const out = buildPeopleXml([{ author: 'Felix Kim', providerId: 'Redrob', userId: 'u-1' }, { author: 'Jae Gardner' }], WORD_PEOPLE)!
    expect(out.startsWith(WORD_PEOPLE.replace('</w15:people>', ''))).toBe(true)
    expect(parsePeopleXml(out).map((p) => p.author)).toEqual(['Jae Gardner', 'Seunghyun & Co', 'Felix Kim'])
    expect(out).toContain('w15:providerId="Redrob" w15:userId="u-1"')
  })

  it('a document without people.xml gains the part, its relationship and content type on save', async () => {
    const parsed = await parseDocx(await buildDocx({ bodyXml: '<w:p><w:r><w:t>Hello</w:t></w:r></w:p>' }))
    expect(parsed.people).toBeUndefined()
    const blocks = parsed.blocks
      .filter((b) => !b.hidden && b.docxIndex !== null)
      .map((b) => ({ kind: 'original' as const, docxIndex: b.docxIndex! }))
    const saved = await saveDocx(parsed, blocks, {
      comments: [{ id: '0', author: 'Felix Kim', text: 'Looks right' }],
      people: [{ author: 'Felix Kim' }],
    })
    const zip = await JSZip.loadAsync(saved)
    expect(await zip.file('word/people.xml')!.async('string')).toContain('w15:author="Felix Kim"')
    expect(await zip.file('word/_rels/document.xml.rels')!.async('string')).toContain(
      'http://schemas.microsoft.com/office/2011/relationships/people',
    )
    expect(await zip.file('[Content_Types].xml')!.async('string')).toContain('wordprocessingml.people+xml')
    const reparsed = await parseDocx(saved)
    expect(reparsed.people).toEqual([{ author: 'Felix Kim' }])
  })
})
