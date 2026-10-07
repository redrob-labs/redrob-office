// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, EditorView, Session, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())

function longDoc(paras = 300): Uint8Array {
  const d = HwpCoreDocument.blank()
  let p = 0
  for (let i = 0; i < paras; i++) {
    d.insertText(0, p, 0, `${i}. 대한민국 헌법 제1조 대한민국은 민주공화국이다. 주권은 국민에게 있다.`)
    p = JSON.parse(d.raw.splitParagraph(0, p, d.paragraphLength(0, p))).paraIdx
  }
  const b = d.export('hwpx')
  d.dispose()
  return b
}

function session(bytes: Uint8Array, para: number): Session {
  const s = new Session(HwpCoreDocument.open(bytes), 'hwpx')
  const at: Pos = { section: 0, para, offset: s.doc.paragraphLength(0, para) }
  s.select({ anchor: at, head: at })
  return s
}

const paint = (s: Session) => Array.from({ length: s.doc.pageCount() }, (_, p) => s.doc.raw.getPageLayerTree(p))

describe('deferred pagination while typing (task 1.9)', () => {
  it('defers during user typing and settles to the same pages as typing without deferral', () => {
    const bytes = longDoc()
    const a = session(bytes, 20)
    const b = session(bytes, 20)
    const busA = new CommandBus(a)
    const busB = new CommandBus(b)
    const text = '추가되는 문장이 여러 줄로 넘어가 쪽 나눔을 바꿀 만큼 길다. '.repeat(6)
    for (const ch of text) {
      busA.run('edit:insert-text', { text: ch })
      busB.run('edit:insert-text', { text: ch }, 'ai') // 'ai' never defers
      if (ch === '.') {
        busA.run('edit:split-paragraph')
        busB.run('edit:split-paragraph', undefined, 'ai')
      }
    }
    expect(a.layoutPending).toBe(true)
    expect(b.layoutPending).toBe(false)
    a.settle()
    expect(a.layoutPending).toBe(false)
    expect(a.doc.pageCount()).toBe(b.doc.pageCount())
    expect(paint(a)).toEqual(paint(b))
  })

  it('settles before formatting, undo and export', () => {
    const s = session(longDoc(50), 3)
    const bus = new CommandBus(s)
    bus.run('edit:insert-text', { text: '가' })
    expect(s.layoutPending).toBe(true)
    bus.run('edit:undo')
    expect(s.layoutPending).toBe(false)
    bus.run('edit:insert-text', { text: '나' })
    s.export('hwp')
    expect(s.layoutPending).toBe(false)
    bus.run('edit:insert-text', { text: '다' })
    s.select({ anchor: { section: 0, para: 3, offset: 0 }, head: { section: 0, para: 3, offset: 2 } })
    bus.run('format:bold')
    expect(s.layoutPending).toBe(false)
  })

  it('the view settles after the idle time and relayouts pages', async () => {
    const s = session(longDoc(50), 3)
    const root = document.createElement('div')
    document.body.appendChild(root)
    let settled = 0
    s.onSettle(() => settled++)
    const view = new EditorView(root, s, new CommandBus(s), { painter: () => {}, settleAfterMs: 5 })
    view.run('edit:insert-text', { text: '가' })
    view.run('edit:insert-text', { text: '나' })
    expect(settled).toBe(0)
    await new Promise((r) => setTimeout(r, 30))
    expect(settled).toBe(1)
    expect(s.layoutPending).toBe(false)
    view.dispose()
  })
})
