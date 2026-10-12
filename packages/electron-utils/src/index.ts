// UI-ONLY BUILD: @genoffice/electron-utils originally bundled Electron main-process
// helpers (app menu, context menu, drop-open, remote-image, print-to-pdf, etc.),
// which are backend and import 'electron'. The app renderers only ever imported
// the browser-safe office-prefs module from this package, so this UI-only build
// ships just that: the OfficePrefs types/constants and nothing that touches Electron.
export * from './office-prefs'
