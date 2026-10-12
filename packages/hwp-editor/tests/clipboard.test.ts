// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, EditorView, REDROB_HWP_MIME, Session, copy, cut, isInternal, paste, tidyHtml, type ClipData, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())

function open(text: string): Session {
  const doc = HwpCoreDocument.blank()
  doc.insertText(0, 0, 0, text)
  return new Session(doc, 'hwpx')
}

const p = (para: number, offset: number): Pos => ({ section: 0, para, offset })
const body = (s: Session) => Array.from({ length: s.doc.paragraphCount(0) }, (_, i) => s.doc.text(0, i))

class FakeTransfer {
  data = new Map<string, string>()
  getData(t: string) {
    return this.data.get(t) ?? ''
  }
  setData(t: string, v: string) {
    this.data.set(t, v)
  }
}

describe('copy and paste within a document', () => {
  it('pastes internally and keeps character formatting', () => {
    const s = open('굵은 보통')
    s.doc.raw.applyCharFormat(0, 0, 0, 2, JSON.stringify({ bold: true }))
    s.select({ anchor: p(0, 0), head: p(0, 5) })
    const data = copy(s)!
    expect(data.text).toBe('굵은 보통')
    expect(data.html).toContain('font-weight:bold')
    expect(isInternal(s, data)).toBe(true)
    s.select({ anchor: p(0, 5), head: p(0, 5) })
    paste(s, data)
    expect(body(s)).toEqual(['굵은 보통굵은 보통'])
    expect(s.text.charPropertiesAt(p(0, 5)).bold).toBe(true)
    expect(s.text.charPropertiesAt(p(0, 8)).bold).toBe(false)
    expect(s.selection.head).toEqual(p(0, 10))
  })

  it('cut removes the selection as one undoable change, and undo brings it back', () => {
    const s = open('잘라낼 부분만')
    s.select({ anchor: p(0, 0), head: p(0, 4) })
    const r = cut(s)!
    expect(r.data.text).toBe('잘라낼 ')
    expect(body(s)).toEqual(['부분만'])
    s.undo()
    expect(body(s)).toEqual(['잘라낼 부분만'])
  })

  it('replaces the selection on paste', () => {
    const s = open('AAA BBB')
    s.select({ anchor: p(0, 0), head: p(0, 3) })
    const data = copy(s)!
    s.select({ anchor: p(0, 4), head: p(0, 7) })
    paste(s, data)
    expect(body(s)).toEqual(['AAA AAA'])
  })
})

describe('paste from elsewhere', () => {
  it('pastes HTML from another application with paragraphs and bold', () => {
    const s = open('끝')
    s.select({ anchor: p(0, 0), head: p(0, 0) })
    paste(s, { text: '제목\n본문', html: '<p><b>제목</b></p><p>본문</p>' })
    expect(body(s)).toEqual(['제목', '본문끝'])
    expect(s.text.charPropertiesAt(p(0, 0)).bold).toBe(true)
  })

  it('never treats another document’s marker as internal', () => {
    const a = open('하나')
    const b = open('둘')
    a.select({ anchor: p(0, 0), head: p(0, 2) })
    const data = copy(a)!
    expect(isInternal(b, data)).toBe(false)
    b.select({ anchor: p(0, 1), head: p(0, 1) })
    paste(b, data)
    expect(body(b)).toEqual(['둘하나'])
  })

  it('falls back to HTML when the system clipboard changed since the copy', () => {
    const s = open('원본')
    s.select({ anchor: p(0, 0), head: p(0, 2) })
    const data = copy(s)!
    const changed: ClipData = { ...data, text: '다른 내용', html: '<p>다른 내용</p>' }
    expect(isInternal(s, changed)).toBe(false)
    s.select({ anchor: p(0, 2), head: p(0, 2) })
    paste(s, changed)
    expect(body(s)).toEqual(['원본다른 내용'])
  })

  it('pastes plain text with line breaks as paragraphs', () => {
    const s = open('')
    paste(s, { text: '첫째\r\n둘째' })
    expect(body(s)).toEqual(['첫째', '둘째'])
  })
})

describe('in a table cell', () => {
  it('copies and pastes inside a cell', () => {
    const s = open('앞')
    s.doc.raw.splitParagraph(0, 0, 1)
    s.doc.raw.createTable(0, 1, 0, 1, 2)
    const c = (offset: number): Pos => ({ section: 0, para: 1, offset, cell: { control: 0, cell: 0, para: 0 } })
    s.text.insert(c(0), '셀글')
    s.select({ anchor: c(0), head: c(2) })
    const data = copy(s)!
    s.select({ anchor: c(2), head: c(2) })
    paste(s, data)
    expect(s.text.text(c(0))).toBe('셀글셀글')
  })
})

describe('DOM clipboard events', () => {
  it('copy, cut and paste events carry all three flavours', () => {
    const s = open('이벤트')
    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new EditorView(root, s, new CommandBus(s), { painter: () => {} })
    s.select({ anchor: p(0, 0), head: p(0, 2) })
    const dt = new FakeTransfer()
    view.onCopy({ clipboardData: dt as unknown as DataTransfer, preventDefault: vi.fn() })
    expect(dt.getData('text/plain')).toBe('이벤')
    expect(dt.getData('text/html')).toContain('이벤')
    expect(dt.getData(REDROB_HWP_MIME)).toBeTruthy()
    s.select({ anchor: p(0, 3), head: p(0, 3) })
    view.onPaste({ clipboardData: dt as unknown as DataTransfer, preventDefault: vi.fn() })
    expect(body(s)).toEqual(['이벤트이벤'])
    view.readOnly = true
    view.onCut({ clipboardData: new FakeTransfer() as unknown as DataTransfer, preventDefault: vi.fn() })
    expect(body(s)).toEqual(['이벤트이벤'])
  })
})

describe('tidyHtml', () => {
  it('drops pretty-print whitespace between blocks but keeps spaces between runs', () => {
    expect(tidyHtml('<html><body>\n<p>a</p>\n<!--x-->\n</body></html>')).toBe('<html><body><p>a</p></body></html>')
    expect(tidyHtml('<p><b>굵게</b> <i>기울임</i></p>')).toBe('<p><b>굵게</b> <i>기울임</i></p>')
  })
})
