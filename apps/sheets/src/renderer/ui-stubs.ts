// UI-ONLY BUILD, LIVE ENGINE: the Univer spreadsheet engine is NOT stubbed - it
// is mounted in the renderer (src/renderer/create-univer + univer-sync) and the
// grid is fully functional. What IS stubbed is only window.desktopApi (the
// Electron bridge: xlsx open/save, the Rust sidecar, file IO, print, AI) and
// window.projectApi. With these inert the app opens a blank live workbook you can
// edit; opening/saving .xlsx files and AI are no-ops. Imported first in main.tsx.
import type { DesktopApi } from '../shared/desktop-api'
import type { ProjectApi } from '@genoffice/project-store'

const inert = (name: string) => {
  if (name.startsWith('on')) return () => () => {}
  if (/^(insightsFact|setDirty|notify|report|send|log)/.test(name)) return () => undefined
  return async () => null
}
const makeStub = <T,>(): T =>
  new Proxy({} as Record<string, unknown>, { get: (_t, p: string) => inert(p) }) as T

export function installUiStubs(): void {
  const w = window as unknown as Record<string, unknown>
  if (!w.desktopApi) Object.defineProperty(w, 'desktopApi', { value: makeStub<DesktopApi>(), configurable: true })
  if (!w.projectApi) Object.defineProperty(w, 'projectApi', { value: makeStub<ProjectApi>(), configurable: true })
}

installUiStubs()
