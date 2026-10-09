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
  ko: {
    titleBar: '제목 표시줄',
    tools: '도구',
    undo: '실행 취소',
    redo: '다시 실행',
    resizePanel: 'Redrob 패널 크기 조정',
    searchPlaceholder: '도구를 찾거나 Redrob에게 물어보세요',
    searchShortcut: 'Alt Q',
    searchAsk: 'Redrob에게 묻기: "{q}"',
    searchResults: '도구',
    toolbar: '도구 모음',
    toolbarSimple: '간단히',
    toolbarSimpleHint: '자주 쓰는 도구를 한 줄로',
    toolbarClassic: '클래식',
    toolbarClassicHint: '모든 도구를 탭으로',
    toolbarTipTitle: '모든 도구가 필요하세요?',
    toolbarTipBody: '클래식으로 바꾸면 리본 전체를 탭으로 볼 수 있습니다. ⌘F1을 눌러도 됩니다. 설정은 모든 파일에 같은 선택을 유지합니다.',
    toolbarTipDismiss: '확인',
    mode: '모드',
    modeEditing: '편집',
    modeSuggesting: '제안',
    modeViewing: '보기',
    modeEditingHint: '파일을 바로 고칩니다.',
    modeSuggestingHint: '입력한 내용은 내 제안으로 표시되고 다른 사람이 받아들일 수 있습니다.',
    modeViewingHint: '읽고 메모를 남깁니다. 파일을 고치려면 편집으로 바꾸세요.',
    status: '상태',
    online: '온라인',
    offline: '오프라인',
    pageOf: '{total}쪽 중 {current}쪽',
    words: '{n}단어',
    comments: '메모 {n}개',
    zoomIn: '확대',
    zoomOut: '축소',
    zoom: '확대/축소',
    fit: '맞춤',
    askRedrob: 'Redrob에게 묻기',
    oldFormatTitle: '이전 {fmt} 파일',
    oldFormatBody: '그대로 열립니다. 모든 기능을 쓰려면 현재 형식으로 사본을 저장하세요.',
    oldFormatSave: '{fmt} 사본 저장',
    oldFormatKeep: '{fmt} 유지',
    outline: '개요',
    sources: '출처',
    saved: '저장됨',
    unsaved: '아직 저장 안 됨',
    saving: '저장 중...',
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
