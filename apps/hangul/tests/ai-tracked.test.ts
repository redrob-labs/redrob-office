// Tracked AI edits and revision tools (spec task 4.4, R6.4, R8.3).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { Revisions, Session, type Pos } from '@genoffice/hwp-editor'
import { createHangulSkill } from '../src/renderer/ai/hangul-skill'

beforeAll(() => initHwpCoreNode())

const P = (para: number, offset: number): Pos => ({ section: 0, para, offset })

function doc(lines: string[], track: string | null) {
  const s = new Session(HwpCoreDocument.blank(), 'hwpx')
  let p = P(0, 0)
  lines.forEach((l, i) => {
    if (i > 0) p = s.text.split(p)
    p = s.text.insert(p, l)
  })
  const skill = createHangulSkill({ getSession: () => s, getTrack: () => track })
  const run = (name: string, input: Record<string, unknown>) => skill.executeTool({ id: 'x', name, input })
  return { s, run, skill, rev: new Revisions(s) }
}
const body = (s: Session) => Array.from({ length: s.doc.paragraphCount(0) }, (_, i) => s.doc.text(0, i))

describe('AI edits in suggesting mode', () => {
  it('replace_blocks keeps the old paragraph marked deleted and the new one marked inserted; accept gives the rewrite', async () => {
    const { s, run, rev } = doc(['첫 문단입니다.', '둘째'], 'Redrob')
    const seq = s.changeSeq
    await run('replace_blocks', { ids: [s.doc.nodeIdAt(0, 0)], html: '<p>고친 문단</p>' })
    expect(s.changeSeq).toBe(seq + 1)
    expect(body(s)).toEqual(['첫 문단입니다.', '고친 문단', '둘째'])
    expect(rev.list().map((r) => [r.kind, r.author, r.text])).toEqual([
      ['delete', 'Redrob', '첫 문단입니다.'],
      ['insert', 'Redrob', '고친 문단'],
    ])
    rev.acceptAll()
    expect(body(s)).toEqual(['고친 문단', '둘째'])
  })

  it('rejecting a tracked rewrite restores the original exactly', async () => {
    const { s, run, rev } = doc(['첫 문단입니다.', '둘째'], 'Redrob')
    await run('replace_blocks', { ids: [s.doc.nodeIdAt(0, 0)], html: '<p>고친 문단</p><p>추가</p>' })
    rev.rejectAll()
    expect(body(s)).toEqual(['첫 문단입니다.', '둘째'])
  })

  it('replace_text, insert_content and delete_blocks are tracked; undo removes one tool call', async () => {
    const { s, run, rev } = doc(['갑은 을에게 판다.', '끝'], 'Redrob')
    await run('replace_text', { find: '갑', replace: '매도인' })
    expect(body(s)[0]).toBe('갑매도인은 을에게 판다.')
    await run('insert_content', { id: s.doc.nodeIdAt(0, 1), html: '<p>부칙</p>' })
    await run('delete_blocks', { ids: [s.doc.nodeIdAt(0, 1)] })
    expect(rev.list().map((r) => [r.kind, r.text])).toEqual([
      ['delete', '갑'],
      ['insert', '매도인'],
      ['delete', '끝'],
      ['insert', '부칙'],
    ])
    s.undo()
    expect(rev.list()).toHaveLength(3)
    rev.acceptAll()
    expect(body(s)).toEqual(['매도인은 을에게 판다.', '끝', '부칙'])
  })

  it('outside suggesting mode the same tool edits directly', async () => {
    const { s, run, rev } = doc(['첫 문단'], null)
    await run('replace_blocks', { ids: [s.doc.nodeIdAt(0, 0)], html: '<p>고침</p>' })
    expect(body(s)).toEqual(['고침'])
    expect(rev.list()).toEqual([])
  })

  it('the context says when suggesting is on and when changes await review', () => {
    const { skill } = doc(['가'], 'Redrob')
    expect(skill.buildContext!()).toContain('Suggesting mode is on')
  })
})

describe('AI revision tools', () => {
  it('reads, accepts and rejects tracked changes by id', async () => {
    const s = new Session(HwpCoreDocument.open(new Uint8Array(readFileSync(join(__dirname, '../../../packages/hwp-core/tests/fixtures/tracked-changes.hwpx')))), 'hwpx')
    const skill = createHangulSkill({ getSession: () => s })
    const run = (name: string, input: Record<string, unknown>) => skill.executeTool({ id: 'x', name, input })
    expect(skill.buildContext!()).toContain('2 tracked change(s) awaiting review')
    const list = JSON.parse((await run('read_revisions', {})).output) as Array<{ id: number; kind: string; text: string }>
    expect(list.map((r) => [r.kind, r.text])).toEqual([
      ['insert', 'NEW'],
      ['delete', 'OLD'],
    ])
    await run('accept_revision', { ids: [2] })
    expect(s.doc.text(0, 1)).toBe('NEXT NEW PARAGRAPH')
    await run('reject_revision', { all: true })
    expect(s.doc.text(0, 1)).toBe('NEXT  PARAGRAPH')
    expect((await run('accept_revision', { ids: [9] })).isError).toBe(true)
  })
})
