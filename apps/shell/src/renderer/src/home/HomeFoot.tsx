import { useEffect, useState, type ReactElement } from 'react'
import { Select, ThemeSwitch, applyUiTheme, type ThemeMode } from '@genoffice/ui'
import { isSelectableLang, languageOptions } from '@genoffice/i18n'
import { useI18n } from '../locale'

const LANG_OPTIONS = languageOptions()

/**
 * The foot of Home's sidebar: theme (system, light, dark and nothing else)
 * and language. Settings sits under it (AccountEntry).
 */
export function HomeFoot(): ReactElement {
  const { t, lang, setLang } = useI18n()
  const [theme, setTheme] = useState<ThemeMode>('system')

  useEffect(() => {
    let live = true
    void window.aiOffice
      .getTheme()
      .then((mode) => {
        if (live) setTheme(mode)
      })
      .catch(() => {})
    const off = window.aiOffice.onThemeChanged((mode) => setTheme(mode))
    return () => {
      live = false
      off()
    }
  }, [])

  const chooseTheme = (mode: ThemeMode) => {
    setTheme(mode)
    applyUiTheme(mode)
    void window.aiOffice.setTheme(mode)
  }

  return (
    <div className="home-foot">
      <ThemeSwitch
        size="sm"
        value={theme}
        label={t('theme')}
        labels={{ system: t('themeSystem'), light: t('themeLight'), dark: t('themeDark') }}
        onChange={chooseTheme}
      />
      <label className="go-visually-hidden" htmlFor="home-foot-lang">
        {t('language')}
      </label>
      <Select
        id="home-foot-lang"
        className="home-foot__lang"
        size="sm"
        value={lang}
        options={LANG_OPTIONS.map((o) => ({
          value: o.value,
          label: o.selectable ? o.label : `${o.label} - ${t('langNotYet')}`,
          disabled: !o.selectable,
        }))}
        onChange={(_e, option) => {
          if (option && isSelectableLang(option.value)) setLang(option.value)
        }}
      />
    </div>
  )
}
