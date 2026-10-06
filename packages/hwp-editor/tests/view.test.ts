// @vitest-environment jsdom
// The view layer in jsdom. jsdom has no canvas, so the engine painter is
// replaced by a recorder; layout, overlay geometry, the input proxy, Korean
// IME composition, shortcuts and mouse hit testing all use the real engine.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, EditorView, Session, resolveKey, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())

interface Paint {
  page: number
  scale: number
}

function mount(text = '', opts: { zoom?: number; dpr?: number; onUnhandledCommand?: (id: string) => boolean } = {}) {
  const doc = HwpCoreDocument.blank()
  if (text) doc.insertText(0, 0, 0, text)
  const s = new Session(doc, 'hwpx')
  const end: Pos = { section: 0, para: 0, offset: doc.paragraphLength(0, 0) }
  s.select({ anchor: end, head: end })
  const root = document.createElement('div')
  Object.defineProperty(root, 'clientHeight', { value: 900, configurable: true })
  document.body.appendChild(root)
  const paints: Paint[] = []
  const view = new EditorView(root, s, new CommandBus(s), {
    zoom: opts.zoom,
    devicePixelRatio: () => opts.dpr ?? 1,
    painter: (page, _canvas, scale) => paints.push({ page, scale }),
    onUnhandledCommand: opts.onUnhandledCommand,
  })
  return { s, view, paints, root }
}

const body = (s: Session) => Array.from({ length: s.doc.paragraphCount(0) }, (_, p) => s.doc.text(0, p))

function key(view: EditorView, k: string, mods: Partial<{ ctrl: boolean; shift: boolean; alt: boolean; meta: boolean; code: string; composing: boolean }> = {}) {
  const e = { key: k, code: mods.code, ctrlKey: !!mods.ctrl, metaKey: !!mods.meta, shiftKey: !!mods.shift, altKey: !!mods.alt, isComposing: !!mods.composing, preventDefault: vi.fn() }
  view.onKeyDown(e)
  return e
}

describe('pages', () => {
  it('lays out every page and paints the visible ones at zoom × device pixel ratio', () => {
    const { view, paints, s } = mount('', { zoom: 1.5, dpr: 2 })
    const page = view.pages.pages[0]!
    expect(page.element.style.width).toBe(`${s.doc.pageInfo(0).width * 1.5}px`)
    expect(paints).toContainEqual({ page: 0, scale: 3 })
  })

  it('repaints through the engine on zoom, never by scaling a bitmap', () => {
    const { view, paints } = mount('글')
    paints.length = 0
    view.pages.setZoom(2)
    expect(paints).toEqual([{ page: 0, scale: 2 }])
  })

  it('paints only pages near the viewport', () => {
    const { view, paints, s, root } = mount()
    for (let i = 0; i < 400; i++) {
      view.bus.run('edit:insert-text', { text: `${i} 대한민국 헌법 제1조 대한민국은 민주공화국이다.\n` })
    }
    expect(s.doc.pageCount()).toBeGreaterThan(4)
    root.scrollTop = 0
    paints.length = 0
    view.pages.invalidate()
    const painted = new Set(paints.map((p) => p.page))
    expect(painted.has(0)).toBe(true)
    expect(painted.has(s.doc.pageCount() - 1)).toBe(false)
  })
})

describe('overlay', () => {
  it('puts the caret at the engine cursor rect, scaled by zoom', () => {
    const { view, s } = mount('가나다', { zoom: 2 })
    const r = s.text.cursorRect(s.selection.head)
    const caret = view.overlay.caret!
    expect(caret.style.left).toBe(`${r.x * 2}px`)
    expect(caret.style.top).toBe(`${r.y * 2}px`)
    expect(caret.style.height).toBe(`${r.height * 2}px`)
    expect(view.pages.pages[0]!.overlay.contains(caret)).toBe(true)
  })

  it('draws selection boxes and hides the caret while selecting', () => {
    const { view, s } = mount('선택할 글자')
    s.select({ anchor: { section: 0, para: 0, offset: 0 }, head: { section: 0, para: 0, offset: 3 } })
    view.render()
    expect(view.overlay.selectionCount).toBeGreaterThan(0)
    expect(view.overlay.caret).toBeNull()
  })

  it('keeps decorations across relayout', () => {
    const { view, s } = mount('메모 달 곳')
    const rects = s.text.selectionRects({ section: 0, para: 0, offset: 0 }, { section: 0, para: 0, offset: 2 })
    view.overlay.setDecoration({ key: 'c1', kind: 'comment', rects })
    view.bus.run('edit:insert-text', { text: '!' })
    expect(view.overlay.decorationKeys()).toEqual(['c1'])
    expect(view.pages.pages[0]!.overlay.querySelectorAll('.hwp-deco-comment').length).toBe(rects.length)
  })
})

describe('Korean IME composition', () => {
  it('shows the preedit while composing and commits the syllable once', () => {
    const { view, s } = mount('한')
    view.onCompositionStart()
    view.onBeforeInput({ inputType: 'insertCompositionText', data: 'ㄱ', preventDefault: vi.fn() })
    view.onCompositionUpdate('ㄱ')
    view.onCompositionUpdate('그')
    view.onCompositionUpdate('글')
    expect(view.overlay.preedit?.textContent).toBe('글')
    expect(body(s)).toEqual(['한']) // nothing written while composing
    expect(view.overlay.caret).toBeNull()
    view.onCompositionEnd('글')
    expect(body(s)).toEqual(['한글'])
    expect(view.overlay.preedit).toBeNull()
    expect(s.changeSeq).toBe(1)
  })

  it('types a sequence of syllables with one undo step each', () => {
    const { view, s } = mount()
    for (const syl of ['대', '한', '민', '국']) {
      view.onCompositionStart()
      view.onCompositionUpdate(syl)
      view.onCompositionEnd(syl)
    }
    expect(body(s)).toEqual(['대한민국'])
    view.run('edit:undo')
    expect(body(s)).toEqual(['대한민'])
  })

  it('replaces a selection with the committed syllable', () => {
    const { view, s } = mount('바꿀')
    s.select({ anchor: { section: 0, para: 0, offset: 0 }, head: { section: 0, para: 0, offset: 2 } })
    view.onCompositionStart()
    view.onCompositionEnd('새')
    expect(body(s)).toEqual(['새'])
  })

  it('replays an arrow pressed mid-composition after the commit (Windows)', async () => {
    const { view, s } = mount('가나')
    view.onCompositionStart()
    view.onCompositionUpdate('다')
    key(view, 'ArrowLeft', { composing: true })
    view.onCompositionEnd('다')
    expect(s.selection.head.offset).toBe(3)
    await new Promise((r) => setTimeout(r, 1))
    expect(body(s)).toEqual(['가나다'])
    expect(s.selection.head.offset).toBe(2)
  })

  it('does not double the arrow when the browser re-sends it (macOS)', async () => {
    const { view, s } = mount('가나')
    view.onCompositionStart()
    key(view, 'ArrowLeft', { composing: true })
    view.onCompositionEnd('다')
    key(view, 'ArrowLeft')
    await new Promise((r) => setTimeout(r, 1))
    expect(s.selection.head.offset).toBe(2)
  })

  it('Enter during composition commits and then splits', async () => {
    const { view, s } = mount('첫')
    view.onCompositionStart()
    key(view, 'Enter', { composing: true })
    view.onCompositionEnd('줄')
    await new Promise((r) => setTimeout(r, 1))
    expect(body(s)).toEqual(['첫줄', ''])
  })
})

describe('keyboard', () => {
  it('types plain text through beforeinput and ignores Process keys', () => {
    const { view, s } = mount()
    key(view, 'Process', { code: 'KeyA' })
    view.onBeforeInput({ inputType: 'insertText', data: 'abc', preventDefault: vi.fn() })
    expect(body(s)).toEqual(['abc'])
  })

  it('runs 한글 shortcuts, including the physical-key match under the Korean IME', () => {
    const { view, s } = mount('굵게')
    s.select({ anchor: { section: 0, para: 0, offset: 0 }, head: { section: 0, para: 0, offset: 2 } })
    expect(key(view, 'b', { ctrl: true }).preventDefault).toHaveBeenCalled()
    expect(s.text.charPropertiesAt({ section: 0, para: 0, offset: 0 }).bold).toBe(true)
    s.select({ anchor: { section: 0, para: 0, offset: 1 }, head: { section: 0, para: 0, offset: 1 } })
    key(view, 'ㅁ', { ctrl: true, code: 'KeyA' })
    expect(s.text.textBetween(s.selection.anchor, s.selection.head)).toBe('굵게')
  })

  it('maps Cmd to Ctrl on macOS', () => {
    expect(resolveKey({ key: 'z', ctrlKey: false, metaKey: true, shiftKey: false, altKey: false }, true)[0]?.command).toBe('edit:undo')
    expect(resolveKey({ key: 'z', ctrlKey: false, metaKey: true, shiftKey: false, altKey: false }, false)).toEqual([])
  })

  it('hands commands it does not own to the host (Ctrl+S → file:save)', () => {
    const seen: string[] = []
    const { view } = mount('', { onUnhandledCommand: (id) => (seen.push(id), true) })
    expect(key(view, 's', { ctrl: true }).preventDefault).toHaveBeenCalled()
    expect(seen).toEqual(['file:save'])
  })

  it('a plain-key binding does not eat typing when its command is unavailable', () => {
    const { view } = mount()
    // `p` is 한글's object-properties key, only meaningful with an object selected.
    expect(key(view, 'p', { code: 'KeyP' }).preventDefault).not.toHaveBeenCalled()
  })

  it('Shift+arrow extends the selection', () => {
    const { view, s } = mount('abc')
    key(view, 'ArrowLeft', { shift: true })
    key(view, 'ArrowLeft', { shift: true })
    expect(s.text.textBetween(s.selection.anchor, s.selection.head)).toBe('bc')
  })

  it('read-only views move the caret but never edit', () => {
    const { view, s } = mount('읽기')
    view.readOnly = true
    view.onBeforeInput({ inputType: 'insertText', data: 'x', preventDefault: vi.fn() })
    key(view, 'Backspace')
    key(view, 'ArrowLeft')
    expect(body(s)).toEqual(['읽기'])
    expect(s.selection.head.offset).toBe(1)
  })
})

describe('mouse', () => {
  it('places the caret where the engine hit test says and extends with a drag', () => {
    const { view, s } = mount('가나다라마바사')
    const page = view.pages.pages[0]!
    page.element.getBoundingClientRect = () => ({ left: 100, top: 50, right: 100 + page.info.width, bottom: 50 + page.info.height, width: page.info.width, height: page.info.height, x: 100, y: 50, toJSON: () => ({}) })
    const r2 = s.text.cursorRect({ section: 0, para: 0, offset: 2 })
    const r5 = s.text.cursorRect({ section: 0, para: 0, offset: 5 })
    view.onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 100 + r2.x + 1, clientY: 50 + r2.y + r2.height / 2 }))
    expect(s.selection.head.offset).toBe(2)
    view.onMouseMove(new MouseEvent('mousemove', { clientX: 100 + r5.x + 1, clientY: 50 + r5.y + r5.height / 2 }))
    expect(s.text.textBetween(s.selection.anchor, s.selection.head)).toBe('다라마')
  })
})
