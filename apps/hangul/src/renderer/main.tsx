import { createRoot } from 'react-dom/client'
import { htmlLang, type Lang } from '@genoffice/i18n'
import App from './App'
import { LocaleProvider } from './i18n/locale'
import type { UiTheme } from '../shared/ipc'
import '@genoffice/ui/theme.css'
import '@genoffice/ui/preflight.css'
import '@genoffice/ui/tokens.css'
import './styles.css'
import { applyUiTheme } from '@genoffice/ui'

const applyTheme = (theme: UiTheme): void => applyUiTheme(theme)

void (async () => {
  const [lang, theme] = await Promise.all([
    window.hangulApi.getLanguage().catch(() => 'zh' as const),
    window.hangulApi.getTheme().catch(() => 'system' as const),
  ])
  document.documentElement.lang = htmlLang(lang as Lang)
  applyTheme(theme)
  window.hangulApi.onThemeChanged(applyTheme)
  createRoot(document.getElementById('root')!).render(
    <LocaleProvider initial={lang}>
      <App />
    </LocaleProvider>,
  )
})()
