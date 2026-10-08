/**
 * Hangul in the shared EditorFrame (handoff 07-hangul): the editor is wrapped
 * by the frame every editor uses, and the document stays Korean whatever the
 * interface language.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(join(__dirname, '../src/renderer/next/NextHangulEditor.tsx'), 'utf8')

describe('Hangul in the EditorFrame', () => {
  it('renders inside the shared EditorFrame', () => {
    expect(src).toContain('<EditorFrame')
  })

  it('marks the document host Korean whatever the interface language', () => {
    expect(src).toMatch(/className=\{[^}]*hangul-next-host[^}]*\}[^>]*lang="ko"/)
  })
})
