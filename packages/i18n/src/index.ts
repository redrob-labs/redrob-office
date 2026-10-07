export type Lang =
  | 'zh'
  | 'en'
  | 'ja'
  | 'ko'
  | 'fr'
  | 'de'
  | 'es'
  | 'th'
  | 'id'
  | 'ru'
  | 'ar'
  | 'pt'
  | 'it'
  | 'pl'
  | 'nl'
  | 'ms'
  | 'he'
  | 'hi'
  | 'zh-TW'

export const LANGS: readonly Lang[] = [
  'zh',
  'en',
  'ja',
  'ko',
  'fr',
  'de',
  'es',
  'th',
  'id',
  'ru',
  'ar',
  'pt',
  'it',
  'pl',
  'nl',
  'ms',
  'he',
  'hi',
  'zh-TW',
]

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value)
}

/**
 * Languages a person can choose today. English is the master key set and the
 * only complete one; every other table stays in the repo, listed as "Not yet"
 * in the language pickers, until it is brought back up to the English keys.
 * Turning a language back on is adding it here.
 */
export const SELECTABLE_LANGS: readonly Lang[] = ['en']

/** the language every missing string falls back to */
export const MASTER_LANG = 'en' satisfies Lang

export function isSelectableLang(value: unknown): value is Lang {
  return isLang(value) && SELECTABLE_LANGS.includes(value)
}

/**
 * The language the interface actually runs in for a stored or detected one:
 * itself when selectable, otherwise English. A profile saved with a language
 * that is no longer offered therefore opens in English.
 */
export function toSelectableLang(lang: Lang | null | undefined): Lang {
  return isSelectableLang(lang) ? lang : MASTER_LANG
}

/** map a raw locale string ('zh-CN', 'zh-Hans', 'ja-JP', 'ko-KR', …) to a supported Lang */
export function normalizeLang(raw: string | null | undefined): Lang {
  const value = raw?.trim().toLowerCase()
  if (!value) return 'en'
  // traditional-script Chinese variants must win over the generic 'zh' prefix
  if (/^zh[-_](tw|hk|mo|hant)/.test(value)) return 'zh-TW'
  for (const lang of LANGS) {
    if (lang !== 'en' && lang !== 'zh-TW' && value.startsWith(lang)) return lang
  }
  // 'in' is the legacy ISO code for Indonesian still reported by some systems
  if (/^in\b/.test(value) || /^in[-_]/.test(value)) return 'id'
  // 'iw' is the legacy ISO code for Hebrew
  if (/^iw\b/.test(value) || /^iw[-_]/.test(value)) return 'he'
  return 'en'
}

const HTML_LANGS: Record<Lang, string> = {
  zh: 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
  ko: 'ko-KR',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  th: 'th-TH',
  id: 'id-ID',
  ru: 'ru-RU',
  ar: 'ar-SA',
  pt: 'pt-BR',
  it: 'it-IT',
  pl: 'pl-PL',
  nl: 'nl-NL',
  ms: 'ms-MY',
  he: 'he-IL',
  hi: 'hi-IN',
  'zh-TW': 'zh-TW',
}

/** each language's own name for itself, as a language picker lists it */
export const LANG_NATIVE_NAMES: Record<Lang, string> = {
  ar: 'العربية',
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  he: 'עברית',
  hi: 'हिन्दी',
  id: 'Bahasa Indonesia',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  ms: 'Bahasa Melayu',
  nl: 'Nederlands',
  pl: 'Polski',
  pt: 'Português',
  ru: 'Русский',
  th: 'ไทย',
  zh: '简体中文',
  'zh-TW': '繁體中文',
}

export interface LanguageOption {
  value: Lang
  /** the language's own name */
  label: string
  /** `false` for a language listed as "Not yet": shown, never chosen */
  selectable: boolean
}

/**
 * Every language for a picker: the selectable ones first, then the rest in
 * ISO 639 code order (native-script names share no alphabet, so the code is
 * the ordering key), each marked whether it can be chosen yet.
 */
export function languageOptions(): LanguageOption[] {
  const byCode = [...LANGS].sort((a, b) => a.localeCompare(b))
  const ready = byCode.filter((l) => SELECTABLE_LANGS.includes(l))
  const later = byCode.filter((l) => !SELECTABLE_LANGS.includes(l))
  return [...ready, ...later].map((value) => ({
    value,
    label: LANG_NATIVE_NAMES[value],
    selectable: SELECTABLE_LANGS.includes(value),
  }))
}

/** BCP-47 tag for document.documentElement.lang (drives CSS :lang() and Chromium's per-language font fallback) */
export function htmlLang(lang: Lang): string {
  return HTML_LANGS[lang]
}

// ---- platform-native shortcut hints ----
// Dictionaries write shortcut hints in Mac notation (⌘S, ⇧⌘Z, ⌘+Click); on
// Windows/Linux every translated string is rewritten to Ctrl/Alt/Shift form.

const MAC_KEY_NAMES: Record<string, string> = {
  '⌫': 'Backspace',
  '⌦': 'Delete',
  '⏎': 'Enter',
  '↩': 'Enter',
  '␣': 'Space',
}

const HAS_MAC_SYMBOL = /[⌘⌃⌥⇧⌫⌦⏎↩␣]/
const CHORD = /([⌘⌃⌥⇧]+)(F\d{1,2}|[A-Za-z0-9±=`'\\,./;[\]\-←↑→↓⌫⌦⏎↩␣]|\+)?/g

function chordToWin(mods: string, key: string | undefined): string {
  const parts: string[] = []
  if (mods.includes('⌘') || mods.includes('⌃')) parts.push('Ctrl')
  if (mods.includes('⌥')) parts.push('Alt')
  if (mods.includes('⇧')) parts.push('Shift')
  if (key) parts.push(MAC_KEY_NAMES[key] ?? key)
  return parts.join('+')
}

/** rewrite Mac shortcut notation in a UI string to Windows/Linux form (pure) */
export function macShortcutsToWin(text: string): string {
  if (!HAS_MAC_SYMBOL.test(text)) return text
  return text
    .replace(/⌘\/(?=\p{L}{2})/gu, '') // "⌘/Ctrl+Enter" dual-platform listings: keep the Ctrl side
    .replace(CHORD, (_m, mods: string, key: string | undefined) =>
      key === '+' ? `${chordToWin(mods, undefined)}+` : chordToWin(mods, key),
    )
    .replace(/[⌫⌦⏎↩␣]/g, (glyph) => MAC_KEY_NAMES[glyph] ?? glyph)
}

const IS_MAC = (() => {
  const g = globalThis as {
    navigator?: { platform?: string }
    process?: { platform?: string }
  }
  if (g.navigator?.platform) return /mac/i.test(g.navigator.platform)
  return g.process?.platform === 'darwin'
})()

/** platform-aware shortcut display: identity on macOS */
export const platformShortcuts: (text: string) => string = IS_MAC
  ? (text) => text
  : macShortcutsToWin

export type Params = Record<string, string | number>

/** fill {name} placeholders; unknown placeholders are left as-is */
export function format(template: string, params?: Params): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

/**
 * Per-language dictionaries. English defines the key set and must be
 * complete; every other language may be partial, and a missing string falls
 * back to English at runtime.
 */
export type LangDicts<D extends Record<string, string>> = { en: D } & {
  [L in Exclude<Lang, 'en'>]?: Partial<Record<keyof D, string>>
}

/**
 * Identity helper for dictionary shards: keeps literal key inference from the
 * English table while type-checking that no other language uses a key English
 * does not define.
 */
export function defineStrings<D extends Record<string, string>>(dicts: LangDicts<D>): LangDicts<D> {
  return dicts
}

// ---- process-wide current language ----
// Used by Electron main-process code (shell + editor main modules share one
// bundle, so one holder). Renderers get the language over IPC instead.

let uiLang: Lang = MASTER_LANG
const langListeners = new Set<(lang: Lang) => void>()

export function getUiLang(): Lang {
  return uiLang
}

export function setUiLang(lang: Lang): void {
  if (lang === uiLang) return
  uiLang = lang
  for (const listener of langListeners) listener(lang)
}

export function onUiLangChange(listener: (lang: Lang) => void): () => void {
  langListeners.add(listener)
  return () => langListeners.delete(listener)
}

/** one string from a dictionary set: the language's own, else English */
export function lookup<D extends Record<string, string>>(
  dicts: LangDicts<D>,
  lang: Lang,
  key: keyof D,
): string {
  const own = lang === MASTER_LANG ? undefined : dicts[lang]?.[key]
  // the key itself is the last resort only for a key outside the typed set
  return own ?? dicts.en[key] ?? String(key)
}

/**
 * Build a translator over per-language dictionaries. English defines the key
 * set (compile-time checked); a string another language lacks falls back to
 * English, so an incomplete table never shows a key or an empty label.
 */
export function createI18n<D extends Record<string, string>>(dicts: LangDicts<D>) {
  return (lang: Lang, key: keyof D, params?: Params): string =>
    platformShortcuts(format(lookup(dicts, lang, key), params))
}
