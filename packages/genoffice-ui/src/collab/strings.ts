/**
 * Version history and catch-up copy. English is the master; the other
 * languages fall back to it. These parts take no language prop, so they follow
 * the page's <html lang>, which every renderer sets from the interface language.
 */
import { createI18n, defineStrings, normalizeLang, type Lang } from '@genoffice/i18n'

const en = {
  verTitle: 'Version history',
  verOpen: 'Version history',
  verCurrent: 'Current',
  verRestore: 'Restore',
  verRestoreLabel: 'Restore the version from {at}',
  verRestored: 'A copy of this version opens beside the current one. Nothing is lost.',
  verRestoreFailed: 'That version could not be restored. The current file is unchanged.',
  verAuto: 'Autosaved',
  verEmpty: 'No versions yet. Each save keeps one on this computer.',
  verName: 'Name the current version',
  verNameLabel: 'Version name',
  verNameSave: 'Name it',
  verNamed: 'Named versions stay when older ones are thinned.',
  verClose: 'Close',
  verUnsaved: 'Save once to start the history.',
  catchTitle: 'Since you last had it open, {when}',
  catchComment: '{name} commented: "{text}"',
  catchReply: '{name} replied in a thread: "{text}"',
  catchSuggestion: '{name} suggested {n} changes.',
  catchSuggestionOne: '{name} suggested a change.',
  catchFigures: '{n} linked figures wait for you.',
  catchFiguresOne: '1 linked figure waits for you.',
  catchEdits: '{n} paragraphs changed.',
  catchEditsOne: 'A paragraph changed.',
  catchShow: 'Show me',
  catchDismiss: 'Dismiss',
} as const

const ko: Partial<Record<keyof typeof en, string>> = {
  verTitle: '버전 기록',
  verOpen: '버전 기록',
  verCurrent: '현재',
  verRestore: '복원',
  verRestoreLabel: '{at} 버전 복원',
  verRestored: '이 버전의 사본이 현재 파일 옆에 열립니다. 잃는 것은 없습니다.',
  verRestoreFailed: '그 버전을 복원하지 못했습니다. 현재 파일은 그대로입니다.',
  verAuto: '자동 저장',
  verEmpty: '아직 버전이 없습니다. 저장할 때마다 이 컴퓨터에 하나씩 남습니다.',
  verName: '현재 버전에 이름 붙이기',
  verNameLabel: '버전 이름',
  verNameSave: '이름 붙이기',
  verNamed: '이름 붙인 버전은 오래된 버전을 정리할 때도 남습니다.',
  verClose: '닫기',
  verUnsaved: '한 번 저장하면 기록이 시작됩니다.',
  catchTitle: '마지막으로 연 뒤({when}) 바뀐 점',
  catchComment: '{name}님의 메모: "{text}"',
  catchReply: '{name}님이 스레드에 답함: "{text}"',
  catchSuggestion: '{name}님이 변경 {n}건을 제안했습니다.',
  catchSuggestionOne: '{name}님이 변경 1건을 제안했습니다.',
  catchFigures: '연결된 수치 {n}개가 기다리고 있습니다.',
  catchFiguresOne: '연결된 수치 1개가 기다리고 있습니다.',
  catchEdits: '문단 {n}개가 바뀌었습니다.',
  catchEditsOne: '문단 1개가 바뀌었습니다.',
  catchShow: '보기',
  catchDismiss: '닫기',
}

const translate = createI18n(defineStrings({ en, ko }))

/** The interface language of this page (its <html lang>), for parts that take no language prop. */
export function pageLang(): Lang {
  return typeof document === 'undefined' ? 'en' : normalizeLang(document.documentElement.lang)
}

export type VerStringKey = keyof typeof en

export function verT(key: VerStringKey, params?: Record<string, string | number>, lang: Lang = pageLang()): string {
  return translate(lang, key, params)
}
