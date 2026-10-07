/**
 * @vitest-environment jsdom
 *
 * The Home quick-create cards must show the FULL editor product name
 * ("Redrob Docs", "Redrob Sheets", "Redrob Slides", "Redrob Markdown",
 * "Redrob PDF", "Redrob Hangul") at the normal window width. The title used to
 * ellipsize to "Redrob …". The fix wraps the title to two lines (no ellipsis
 * clipping the brand) and adds a title/aria-label accessibility fallback, with
 * the AI chip moved to the card corner so it does not steal title width.
 *
 * The cards now live in a project's view (Home's own view starts blank from
 * the composer row, see home-composer.test.ts). These tests lock the layout intent (wrapping, corner chip) at the source level so a
 * regression to ellipsis is caught.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const src = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), 'utf8')


describe('quick-card title layout locks (no ellipsis truncation of the brand)', () => {
  const css = () => src('apps/shell/src/renderer/src/home.css')

  it('the title wraps to two lines instead of nowrap+ellipsis', () => {
    const text = css()
    const block = /\.quick-title \{([^}]*)\}/.exec(text)?.[1] ?? ''
    expect(block).toContain('white-space: normal')
    expect(block).toContain('-webkit-line-clamp: 2')
    expect(block).not.toContain('white-space: nowrap')
  })

  it('the AI chip is positioned in the card corner so it does not shrink the title', () => {
    const text = css()
    expect(text).toContain('.ai-chip-corner')
    const block = /\.ai-chip-corner \{([^}]*)\}/.exec(text)?.[1] ?? ''
    expect(block).toContain('position: absolute')
  })

  it('Home renders title + aria-label on the quick cards', () => {
    const home = src('apps/shell/src/renderer/src/Home.tsx')
    expect(home).toContain('title={item.title}')
    expect(home).toContain('aria-label={item.title}')
    expect(home).toContain('ai-chip ai-chip-corner')
  })
})
