// Contract: every document kind the shell can create is reachable from the menus,
// not only from the Home screen's quick cards.
//
// Redrob Hangul shipped unreachable from every menu. `newHangulTab()` existed and
// was wired to IPC, the `menuNewHangul` label existed in all locale tables, and
// the Home quick card worked — the menu ENTRIES were simply never added. Nothing
// failed: no type error, no test, and the feature looked present because one
// surface had it.
//
// This asserts on the source text of the menu templates on purpose. The templates
// are built inside module-scope functions that need a live Electron app, so
// executing them in a unit test is not available; what is checkable, and what
// actually broke, is whether each kind's label appears beside a click handler.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mainSource = readFileSync(join(__dirname, '../src/main/index.ts'), 'utf8')

/** Each creatable kind: its menu label key and the function that opens it. */
const KINDS = [
  { label: 'menuNewDoc', open: 'newDocTab' },
  { label: 'menuNewSheet', open: 'newSheetTab' },
  { label: 'menuNewSlide', open: 'newSlideTab' },
  { label: 'menuNewMarkdown', open: 'newMarkdownTab' },
  { label: 'menuNewPdf', open: 'newPdfTab' },
  { label: 'menuNewHangul', open: 'newHangulTab' },
] as const

/**
 * The three menus that offer the New list: the tray/context menu, the File menu
 * of the application menu, and the macOS dock menu. Counted by how many times
 * the Docs entry — the one every New list starts with — appears.
 */
const NEW_MENU_COUNT = 3

describe('menu reachability', () => {
  it.each(KINDS)('$label is offered in every New menu', ({ label }) => {
    const uses = mainSource.split(`tm('${label}')`).length - 1
    expect(uses).toBe(NEW_MENU_COUNT)
  })

  it.each(KINDS)('$open is actually called from a menu, not only from IPC', ({ open }) => {
    // `click: () => newXTab()` / `click: () => void newXTab()`
    const clicks = mainSource.split(new RegExp(`click:\\s*\\(\\)\\s*=>\\s*(?:void\\s+)?${open}\\(`)).length - 1
    expect(clicks).toBeGreaterThanOrEqual(NEW_MENU_COUNT)
  })

  it('every kind has its label in every locale table', () => {
    // The Hangul label was present in all locales while the menu entry was
    // missing, so a label count alone would not have caught the bug — but a
    // label missing from one locale would crash that locale's menu build.
    const localeCount = mainSource.split("menuNewDoc:").length - 1
    expect(localeCount).toBeGreaterThan(1)
    for (const { label } of KINDS) {
      expect(mainSource.split(`${label}:`).length - 1).toBe(localeCount)
    }
  })

  it('the New list has no kind the shell cannot open', () => {
    // Reverse direction: a label wired to nothing is as broken as a handler with
    // no label.
    for (const { label, open } of KINDS) {
      expect(mainSource).toContain(`${label}:`)
      expect(mainSource).toContain(`function ${open}(`)
    }
  })
})
