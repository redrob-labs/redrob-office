import { isLang, isSelectableLang, normalizeLang, toSelectableLang, type Lang } from '@genoffice/i18n'

export interface StartupLangInput {
  /** GENOFFICE_LANG, the developer override */
  envLang?: string
  /** the `language` value stored in app-settings.json, if any */
  saved?: unknown
  /** app.getLocale() */
  systemLocale: string
}

export interface StartupLang {
  lang: Lang
  /**
   * The stored language is no longer offered: write `lang` back so the
   * setting and what the person sees agree from now on.
   */
  migrate: boolean
}

/**
 * Which language the interface opens in. Only selectable languages run; a
 * profile saved with another one opens in English and is migrated, and a
 * system locale outside the selectable set also lands on English.
 */
export function resolveStartupLang(input: StartupLangInput): StartupLang {
  if (input.envLang) return { lang: toSelectableLang(normalizeLang(input.envLang)), migrate: false }
  if (isLang(input.saved)) {
    if (isSelectableLang(input.saved)) return { lang: input.saved, migrate: false }
    return { lang: toSelectableLang(input.saved), migrate: true }
  }
  return { lang: toSelectableLang(normalizeLang(input.systemLocale)), migrate: false }
}
