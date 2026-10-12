// 최근 문서 from inside the Hangul editor (task 2.6): only Hangul files, newest first.
import { describe, expect, it } from 'vitest'
import { hangulRecentFiles } from '../src/main/hangul-main'

describe('Hangul recent files', () => {
  it('keeps the .hwp and .hwpx entries of the suite recent list, in order, at most 20', () => {
    const all = ['/a/계약서.hwpx', '/a/메모.docx', '/a/옛.HWP', '/a/표.xlsx', ...Array.from({ length: 30 }, (_, i) => `/b/${i}.hwp`)]
    const r = hangulRecentFiles(all)
    expect(r.slice(0, 3)).toEqual(['/a/계약서.hwpx', '/a/옛.HWP', '/b/0.hwp'])
    expect(r).toHaveLength(20)
  })
})
