import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, Session, compareDocuments } from '../src'

beforeAll(() => initHwpCoreNode())

function doc(paras: string[]): HwpCoreDocument {
  const s = new Session(HwpCoreDocument.blank(), 'hwpx')
  const bus = new CommandBus(s)
  paras.forEach((t, i) => {
    if (i) bus.run('edit:split-paragraph')
    bus.run('edit:insert-text', { text: t })
  })
  return HwpCoreDocument.open(s.export('hwpx'))
}

describe('문서 비교 (compare documents, task 2.6)', () => {
  it('finds added, removed and changed paragraphs, in this document’s order', () => {
    const mine = doc(['제1조 목적', '제2조 정의 (개정)', '제3조 기간', '제4조 해지'])
    const theirs = doc(['제1조 목적', '제2조 정의', '제2조의2 비밀유지', '제3조 기간'])
    const r = compareDocuments(mine, theirs)
    expect(r.map((e) => [e.kind, e.mine, e.theirs])).toEqual([
      ['changed', '제2조 정의 (개정)', '제2조 정의'],
      ['removed', '', '제2조의2 비밀유지'],
      ['added', '제4조 해지', ''],
    ])
    expect(r[0]!.at).toEqual({ section: 0, para: 1 })
    // the removed one is shown before 제3조, the next paragraph both have
    expect(r[1]!.at).toEqual({ section: 0, para: 2 })
    expect(r[2]!.at).toEqual({ section: 0, para: 3 })
  })

  it('the same document has no differences', () => {
    const d = doc(['가', '나', '다'])
    expect(compareDocuments(d, doc(['가', '나', '다']))).toEqual([])
  })
})
