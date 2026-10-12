import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, Session, documentHtml, pageRenders } from '../src'

beforeAll(() => initHwpCoreNode())

describe('whole-document exports', () => {
  it('renders every page with its paper size', () => {
    const s = new Session(HwpCoreDocument.blank(), 'hwpx')
    s.text.insert({ section: 0, para: 0, offset: 0 }, '첫 쪽')
    new CommandBus(s).run('page:break')
    const pages = pageRenders(s)
    expect(pages).toHaveLength(2)
    expect(pages[0]!.svg.startsWith('<svg')).toBe(true)
    expect(Math.round(pages[0]!.width)).toBe(794)
  })

  it('exports the body as escaped HTML', () => {
    const s = new Session(HwpCoreDocument.blank(), 'hwpx')
    s.text.insert({ section: 0, para: 0, offset: 0 }, '제1조 <목적> & 범위')
    const html = documentHtml(s)
    expect(html).toContain('제1조 &lt;목적&gt; &amp; 범위')
    expect(html).not.toContain('StartFragment')
    expect(html).not.toContain('<body')
  })
})
