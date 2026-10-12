import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { Session, styleList, type Pos } from '@genoffice/hwp-editor'
import type { ToolExecution } from '@genoffice/agent-core'
import { createHangulSkill } from '../src/renderer/ai/hangul-skill'
import { parseBlocks } from '../src/renderer/ai/blocks'

beforeAll(() => initHwpCoreNode())

function blank(lines: string[]): Session {
  const doc = HwpCoreDocument.blank()
  const s = new Session(doc, 'hwpx')
  let p: Pos = { section: 0, para: 0, offset: 0 }
  lines.forEach((line, i) => {
    if (i > 0) p = s.text.split(p)
    p = s.text.insert(p, line)
  })
  return s
}

function skillFor(s: Session) {
  const skill = createHangulSkill({ getSession: () => s })
  let n = 0
  const run = async (name: string, input: Record<string, unknown>): Promise<ToolExecution> => skill.executeTool({ id: `c${++n}`, name, input })
  return { skill, run }
}

const body = (s: Session) => Array.from({ length: s.doc.paragraphCount(0) }, (_, i) => s.doc.text(0, i))
const ids = (s: Session) => Array.from({ length: s.doc.paragraphCount(0) }, (_, i) => s.doc.nodeIdAt(0, i)!)
const styleId = (s: Session, name: string) => styleList(s).find((x) => x.name === name)!.id

describe('context', () => {
  it('lists paragraphs by Node id, cells under their table, and the frozen selection', () => {
    const s = new Session(HwpCoreDocument.open(new Uint8Array(readFileSync(join(__dirname, 'fixtures/sample.hwpx')))), 'hwpx')
    const { skill } = skillFor(s)
    s.select({ anchor: { section: 0, para: 1, offset: 0 }, head: { section: 0, para: 1, offset: 4 } })
    const ctx = skill.buildContext!()
    const [table, cell, next] = [s.doc.nodeIdAt(0, 0), s.doc.nodeIdInCell(0, 0, 2, 0, 0), s.doc.nodeIdAt(0, 1)]
    expect(ctx).toContain(`table 1×1 in ${table}`)
    expect(ctx).toContain(`${cell} | cell r0c0 | CELL`)
    expect(ctx).toContain(`${next} | p | NEXT PARAGRAPH`)
    expect(ctx).toContain(`User selection: paragraphs ${next}`)
    expect(ctx).toContain('Selected text: NEXT')
  })
})

describe('read_blocks', () => {
  it('returns restricted HTML with ids, runs, headings and tables', async () => {
    const s = blank(['제목', '본문 굵게 끝'])
    s.doc.raw.applyStyle(0, 0, styleId(s, '개요 1'))
    s.text.applyCharFormat({ section: 0, para: 1, offset: 3 }, { section: 0, para: 1, offset: 5 }, { bold: true })
    const { run } = skillFor(s)
    const [h, p] = ids(s)
    const r = await run('read_blocks', { ids: [h, p] })
    expect(r.isError).toBeFalsy()
    expect(r.output).toContain(`<h1 data-id="${h}">제목</h1>`)
    expect(r.output).toContain(`<p data-id="${p}">본문 <strong>굵게</strong> 끝</p>`)

    const t = new Session(HwpCoreDocument.open(new Uint8Array(readFileSync(join(__dirname, 'fixtures/sample.hwpx')))), 'hwpx')
    const host = t.doc.nodeIdAt(0, 0)!
    const cell = t.doc.nodeIdInCell(0, 0, 2, 0, 0)!
    const rt = await skillFor(t).run('read_blocks', { ids: [host] })
    expect(rt.output).toContain(`<table data-host="${host}" data-rows="1" data-cols="1"><tr><td><p data-id="${cell}">CELL</p></td></tr></table>`)
  })
})

describe('replace_blocks', () => {
  it('rewrites paragraphs as one undo step, keeping each role’s exact shapes', async () => {
    const s = blank(['제목', '첫 문단', '둘째 문단', '끝'])
    s.doc.raw.applyStyle(0, 0, styleId(s, '개요 1'))
    // The body paragraphs carry direct formatting (14 pt, centred) the rewrite must keep.
    s.text.applyCharFormat({ section: 0, para: 1, offset: 0 }, { section: 0, para: 1, offset: 4 }, { fontSize: 1400 })
    s.doc.raw.applyParaFormat(0, 1, JSON.stringify({ alignment: 'center' }))
    const before = s.doc.readNodes(ids(s).slice(0, 2))
    const { run } = skillFor(s)
    const [h, a, b] = ids(s)
    const seq = s.changeSeq
    const r = await run('replace_blocks', { ids: [h, a, b], html: '<h1>새 제목</h1><p>하나</p><p>둘 <strong>강조</strong></p><p>셋</p>' })
    expect(r.isError).toBeFalsy()
    expect(r.mutated).toBe(true)
    expect(body(s)).toEqual(['새 제목', '하나', '둘 강조', '셋', '끝'])
    expect(s.changeSeq).toBe(seq + 1)
    const after = s.doc.readNodes(ids(s).slice(0, 4))
    const ok = (x: (typeof after)[number]) => (x.missing ? null : x)
    // The heading keeps the heading's style and shapes; body paragraphs keep the body's.
    expect(ok(after[0]!)!.styleId).toBe(ok(before[0]!)!.styleId)
    expect(ok(after[0]!)!.paraShapeId).toBe(ok(before[0]!)!.paraShapeId)
    for (const k of [1, 2, 3]) {
      expect(ok(after[k]!)!.paraShapeId).toBe(ok(before[1]!)!.paraShapeId)
      expect(ok(after[k]!)!.charShapes[0]!.charShapeId).toBe(ok(before[1]!)!.charShapes[0]!.charShapeId)
    }
    expect(s.text.charPropertiesAt({ section: 0, para: 2, offset: 3 }).bold).toBe(true)
    expect(s.text.charPropertiesAt({ section: 0, para: 2, offset: 1 }).bold).toBe(false)
    // The old ids are gone except the reused first paragraph; the result names the new ones.
    expect(s.doc.locate(b)).toBeNull()
    expect(r.output).toMatch(/New ids: \d+(, \d+){3}/)
    // One undo restores everything.
    s.undo()
    expect(body(s)).toEqual(['제목', '첫 문단', '둘째 문단', '끝'])
    // And it survives a save and reopen.
    await run('replace_blocks', { ids: [ids(s)[3]!], html: '<p>마지막</p>' })
    const back = HwpCoreDocument.open(s.export('hwpx'))
    expect(back.text(0, 3)).toBe('마지막')
  })

  it('applies 개요 styles to headings when the replaced text had none', async () => {
    const s = blank(['본문'])
    const { run } = skillFor(s)
    await run('replace_blocks', { ids: ids(s), html: '<h2>절</h2><p>내용</p>' })
    expect(body(s)).toEqual(['절', '내용'])
    expect(JSON.parse(s.doc.raw.getStyleAt(0, 0)).name).toBe('개요 2')
    expect(JSON.parse(s.doc.raw.getStyleAt(0, 1)).name).toBe('바탕글')
  })

  it('rewrites a table cell in place', async () => {
    const s = new Session(HwpCoreDocument.open(new Uint8Array(readFileSync(join(__dirname, 'fixtures/sample.hwpx')))), 'hwpx')
    const cell = s.doc.nodeIdInCell(0, 0, 2, 0, 0)!
    const r = await skillFor(s).run('replace_blocks', { ids: [cell], html: '<p>셀 하나</p><p>셀 둘</p>' })
    expect(r.isError).toBeFalsy()
    expect(s.text.text({ section: 0, para: 0, offset: 0, cell: { control: 2, cell: 0, para: 0 } })).toBe('셀 하나')
    expect(s.text.text({ section: 0, para: 0, offset: 0, cell: { control: 2, cell: 0, para: 1 } })).toBe('셀 둘')
  })

  it('refuses ids that are not one run, and a stale id, without touching the document', async () => {
    const s = blank(['a', 'b', 'c'])
    const { run } = skillFor(s)
    const [a, , c] = ids(s)
    const r = await run('replace_blocks', { ids: [a, c], html: '<p>x</p>' })
    expect(r.isError).toBe(true)
    expect(r.output).toContain('consecutive')
    await run('delete_blocks', { ids: [c] })
    const stale = await run('replace_blocks', { ids: [c], html: '<p>x</p>' })
    expect(stale.output).toContain('no longer exists')
    expect(body(s)).toEqual(['a', 'b'])
  })
})

describe('insert_content and delete_blocks', () => {
  it('inserts after and before an anchor and at the end', async () => {
    const s = blank(['하나', '셋'])
    const { run } = skillFor(s)
    const [one, three] = ids(s)
    await run('insert_content', { id: one, html: '<p>둘</p>' })
    await run('insert_content', { id: one, where: 'before', html: '<p>영</p>' })
    await run('insert_content', { where: 'end', html: '<ul><li>가</li><li>나</li></ul>' })
    expect(body(s)).toEqual(['영', '하나', '둘', '셋', '• 가', '• 나'])
    expect(s.doc.locate(three)).not.toBeNull()
  })

  it('a body paragraph inserted after a heading does not inherit the heading', async () => {
    const s = blank(['제목', '본문'])
    s.doc.raw.applyStyle(0, 0, styleId(s, '개요 1'))
    const { run } = skillFor(s)
    await run('insert_content', { id: ids(s)[0], html: '<p>새 본문</p>' })
    expect(body(s)).toEqual(['제목', '새 본문', '본문'])
    // The anchor had no body template, so the new paragraph keeps no heading style.
    expect(JSON.parse(s.doc.raw.getStyleAt(0, 1)).name).not.toBe('개요 1')
  })

  it('inserts a table from HTML', async () => {
    const s = blank(['앞'])
    const { run } = skillFor(s)
    const r = await run('insert_content', { id: ids(s)[0], html: '<table><tr><th>구분</th><th>값</th></tr><tr><td>A</td><td>1</td></tr></table><p>뒤</p>' })
    expect(r.isError).toBeFalsy()
    const outline = s.doc.outline()
    const table = outline.sections[0]!.paragraphs.flatMap((p) => p.controls ?? []).find((c) => c.kind === 'table')
    expect(table?.rows).toBe(2)
    expect(table?.cols).toBe(2)
    expect(body(s)[0]).toBe('앞')
    expect(body(s).at(-1)).toBe('뒤')
  })

  it('deletes non-consecutive paragraphs in one step', async () => {
    const s = blank(['a', 'b', 'c', 'd'])
    const { run } = skillFor(s)
    const [a, , c] = ids(s)
    const seq = s.changeSeq
    await run('delete_blocks', { ids: [a, c] })
    expect(body(s)).toEqual(['b', 'd'])
    expect(s.changeSeq).toBe(seq + 1)
  })
})

describe('find_text and replace_text', () => {
  it('finds in body and cells and replaces in place keeping formatting', async () => {
    const s = blank(['갑은 을에게', '을은 갑에게'])
    s.text.applyCharFormat({ section: 0, para: 0, offset: 0 }, { section: 0, para: 0, offset: 6 }, { bold: true })
    const { run } = skillFor(s)
    const f = await run('find_text', { query: '갑' })
    expect(f.output).toContain('2 match(es)')
    const r = await run('replace_text', { find: '갑', replace: '매도인' })
    expect(r.output).toContain('Replaced 2')
    expect(body(s)).toEqual(['매도인은 을에게', '을은 매도인에게'])
    expect(s.text.charPropertiesAt({ section: 0, para: 0, offset: 2 }).bold).toBe(true)
    const none = await run('replace_text', { find: '없음', replace: 'x' })
    expect(none.mutated).toBe(false)
    expect(s.canUndo).toBe(true)
    s.undo()
    expect(body(s)).toEqual(['갑은 을에게', '을은 갑에게'])
  })
})

describe('apply_commands and set_header_footer', () => {
  it('runs formatting commands on id and range targets as one undo step', async () => {
    const s = blank(['가나다라', '마바사'])
    const { run } = skillFor(s)
    const [a, b] = ids(s)
    const seq = s.changeSeq
    const r = await run('apply_commands', {
      commands: [
        { command: 'format:char-shape-apply', range: { id: a, from: 0, to: 2 }, params: { props: { bold: true, fontSize: 1600 } } },
        { command: 'format:para-shape-apply', ids: [b], params: { props: { alignment: 'center' } } },
      ],
    })
    expect(r.isError).toBeFalsy()
    expect(r.output).not.toContain('not applicable')
    expect(s.changeSeq).toBe(seq + 1)
    expect(s.text.charPropertiesAt({ section: 0, para: 0, offset: 1 }).bold).toBe(true)
    expect(s.text.charPropertiesAt({ section: 0, para: 0, offset: 1 }).fontSize).toBe(1600)
    expect(s.text.charPropertiesAt({ section: 0, para: 0, offset: 3 }).bold).toBe(false)
    expect(JSON.parse(s.doc.raw.getParaPropertiesAt(0, 1)).alignment).toBe('center')
    const bad = await run('apply_commands', { commands: [{ command: 'edit:undo' }] })
    expect(bad.isError).toBe(true)
  })

  it('sets, replaces and removes a header', async () => {
    const s = blank(['본문'])
    const { run } = skillFor(s)
    await run('set_header_footer', { kind: 'header', text: '제1차 회의' })
    expect(JSON.parse(s.doc.raw.getHeaderFooter(0, true, 0)).text).toBe('제1차 회의')
    await run('set_header_footer', { kind: 'header', text: '제2차 회의' })
    expect(JSON.parse(s.doc.raw.getHeaderFooter(0, true, 0)).text).toBe('제2차 회의')
    await run('set_header_footer', { kind: 'header', remove: true })
    expect(JSON.parse(s.doc.raw.getHeaderFooter(0, true, 0)).exists).toBe(false)
  })
})

describe('claimed-edit guard', () => {
  it('asks for a correction when the reply claims an edit no tool made', () => {
    const { skill } = skillFor(blank(['a']))
    expect(skill.verifyResponse!('문단을 수정했습니다.', [])).toMatch(/no editing tool succeeded/)
    expect(skill.verifyResponse!('문단을 수정했습니다.', [{ name: 'replace_blocks', ok: true }])).toBeNull()
    expect(skill.verifyResponse!('이 문서는 계약서입니다.', [])).toBeNull()
  })
})

describe('parseBlocks', () => {
  it('maps the restricted dialect to roles and runs', () => {
    const b = parseBlocks('<h2>제목</h2><p style="text-align:center">가 <b>나</b><br>다</p><ol><li>하나</li></ol>')
    expect(b).toEqual([
      { type: 'para', role: { kind: 'heading', level: 2 }, runs: [{ text: '제목' }] },
      { type: 'para', role: { kind: 'body' }, runs: [{ text: '가 ' }, { text: '나', bold: true }], align: 'center' },
      { type: 'para', role: { kind: 'body' }, runs: [{ text: '다' }], align: 'center' },
      { type: 'para', role: { kind: 'list', ordered: true }, runs: [{ text: '1. ' }, { text: '하나' }] },
    ])
  })
})

describe('templates from neighbours', () => {
  it('body text after a lone heading takes the default style', async () => {
    const s = blank(['제목'])
    s.doc.raw.applyStyle(0, 0, styleId(s, '개요 1'))
    await skillFor(s).run('insert_content', { id: ids(s)[0], html: '<p>본문</p>' })
    expect(JSON.parse(s.doc.raw.getStyleAt(0, 1)).name).toBe('바탕글')
  })

  it('a rewritten heading-only run borrows the body look from the next paragraph', async () => {
    const s = blank(['제목', '본문'])
    s.doc.raw.applyStyle(0, 0, styleId(s, '개요 1'))
    s.text.applyCharFormat({ section: 0, para: 1, offset: 0 }, { section: 0, para: 1, offset: 2 }, { fontSize: 1300 })
    await skillFor(s).run('replace_blocks', { ids: [ids(s)[0]], html: '<h1>제목</h1><p>요약</p>' })
    expect(body(s)).toEqual(['제목', '요약', '본문'])
    expect(s.text.charPropertiesAt({ section: 0, para: 1, offset: 1 }).fontSize).toBe(1300)
  })
})

describe('documents without styles', () => {
  it('inserts after a heading-less anchor without applying a missing style', async () => {
    const s = blank(['본문'])
    const skill = createHangulSkill({ getSession: () => s })
    // Simulate a style-less document: the fallback must not name a style that is not there.
    const names = styleList(s).map((x) => x.name)
    expect(names).toContain('바탕글')
    const r = await skill.executeTool({ id: 'x', name: 'insert_content', input: { id: ids(s)[0], html: '<p>둘</p>' } })
    expect(r.isError).toBeFalsy()
  })
})
