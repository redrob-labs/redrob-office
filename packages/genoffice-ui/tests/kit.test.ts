import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Button, IconButton, applyTheme, icons } from '../src/index'

// jsdom replaces import.meta.url's scheme, so resolve from the package root
// vitest runs in rather than from this file's URL.
const PKG_ROOT = process.cwd()
const require = createRequire(join(PKG_ROOT, 'package.json'))

describe('@genoffice/ui re-exports the Redrob design system', () => {
  it('renders a kit Button with its rr-btn classes', () => {
    const html = renderToStaticMarkup(createElement(Button, { variant: 'primary' }, 'Save'))
    expect(html).toContain('rr-btn')
    expect(html).toContain('rr-btn--primary')
    expect(html).toContain('Save')
  })

  it('exposes kit components and icons alongside the legacy exports', () => {
    expect(typeof IconButton).toBe('function')
    expect(Object.keys(icons).length).toBeGreaterThan(0)
  })

  it('applyTheme writes the rendered theme onto the target element', () => {
    const el = document.createElement('div')
    applyTheme(el, 'dark')
    expect(el.getAttribute('data-theme')).toBe('dark')
    applyTheme(el, 'light')
    expect(el.getAttribute('data-theme')).toBe('light')
  })

  it('theme.css imports the kit tokens before the kit styles', () => {
    const css = readFileSync(join(PKG_ROOT, 'src/theme.css'), 'utf8')
    const tokens = css.indexOf("@import '@redrob-labs/ui/tokens.css'")
    const styles = css.indexOf("@import '@redrob-labs/ui/styles.css'")
    expect(tokens).toBeGreaterThan(-1)
    expect(styles).toBeGreaterThan(tokens)
  })

  it('pins the kit at exactly 1.0.2', () => {
    const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'))
    expect(pkg.dependencies['@redrob-labs/ui']).toBe('1.0.2')
    const installed = require('@redrob-labs/ui/package.json') as { version: string; license: string }
    expect(installed.version).toBe('1.0.2')
    expect(installed.license).toBe('MIT')
  })
})
