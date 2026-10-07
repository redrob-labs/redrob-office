/**
 * The editor frame's copy, shared by every editor so the title bar, toolbar
 * switch, mode menu and status bar say the same thing everywhere. English is
 * the master table; other languages fall back to it (see @genoffice/i18n).
 */
import { createI18n, defineStrings, platformShortcuts, type Lang } from '@genoffice/i18n'
import type { CommandSearchStrings } from './CommandSearch'
import type { EditorFrameStrings } from './EditorFrame'
import type { ModeMenuStrings, ToolbarSwitchStrings } from './parts'

export const frameStrings = defineStrings({
  en: {
    titleBar: 'Title bar',
    tools: 'Tools',
    undo: 'Undo',
    redo: 'Redo',
    resizePanel: 'Resize the Redrob panel',
    searchPlaceholder: 'Search tools, or ask Redrob',
    searchShortcut: 'Alt Q',
    searchAsk: 'Ask Redrob: "{q}"',
    searchResults: 'Tools',
    toolbar: 'Toolbar',
    toolbarSimple: 'Simple',
    toolbarSimpleHint: 'One row of the everyday tools',
    toolbarClassic: 'Classic',
    toolbarClassicHint: 'Every tool, in tabs',
    toolbarTipTitle: 'Want every tool?',
    toolbarTipBody:
      'Switch to Classic for the full ribbon in tabs, or press ⌘F1. Settings keeps your choice for every file.',
    toolbarTipDismiss: 'Got it',
    mode: 'Mode',
    modeEditing: 'Editing',
    modeSuggesting: 'Suggesting',
    modeViewing: 'Viewing',
    modeEditingHint: 'Change the file directly.',
    modeSuggestingHint: 'What you type is marked as your suggestion for the others to accept.',
    modeViewingHint: 'Read and comment. Switch to Editing to change the file.',
    status: 'Status',
    online: 'Online',
    offline: 'Offline',
    pageOf: 'Page {current} of {total}',
    words: '{n} words',
    comments: '{n} comments',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    zoom: 'Zoom',
    fit: 'Fit',
    askRedrob: 'Ask Redrob',
    oldFormatTitle: 'An older {fmt} file',
    oldFormatBody: 'It opens as it is. Save a copy in the current format to use every feature.',
    oldFormatSave: 'Save a {fmt} copy',
    oldFormatKeep: 'Keep {fmt}',
    outline: 'Outline',
    sources: 'Sources',
    saved: 'Saved',
    unsaved: 'Not saved yet',
    saving: 'Saving...',
  },
})

export type FrameStringKey = keyof typeof frameStrings.en

const translate = createI18n(frameStrings)

/** one frame string in a language, {placeholders} filled, shortcuts in platform form */
export function frameT(lang: Lang, key: FrameStringKey, params?: Record<string, string | number>): string {
  return translate(lang, key, params)
}

/** the prop bundles EditorFrame and its parts take, in one language */
export function frameCopy(lang: Lang): {
  frame: EditorFrameStrings
  search: CommandSearchStrings
  toolbar: ToolbarSwitchStrings
  mode: ModeMenuStrings
} {
  const t = (k: FrameStringKey, p?: Record<string, string | number>) => frameT(lang, k, p)
  return {
    frame: {
      titleBar: t('titleBar'),
      undo: t('undo'),
      redo: t('redo'),
      resizePanel: t('resizePanel'),
      tools: t('tools'),
    },
    search: {
      placeholder: t('searchPlaceholder'),
      shortcut: t('searchShortcut'),
      ask: (q) => t('searchAsk', { q }),
      results: t('searchResults'),
    },
    toolbar: {
      label: t('toolbar'),
      simple: t('toolbarSimple'),
      simpleHint: t('toolbarSimpleHint'),
      classic: t('toolbarClassic'),
      classicHint: t('toolbarClassicHint'),
      tipTitle: t('toolbarTipTitle'),
      tipBody: platformShortcuts(t('toolbarTipBody')),
      tipDismiss: t('toolbarTipDismiss'),
    },
    mode: {
      label: t('mode'),
      editing: t('modeEditing'),
      suggesting: t('modeSuggesting'),
      viewing: t('modeViewing'),
      editingHint: t('modeEditingHint'),
      suggestingHint: t('modeSuggestingHint'),
      viewingHint: t('modeViewingHint'),
    },
  }
}
