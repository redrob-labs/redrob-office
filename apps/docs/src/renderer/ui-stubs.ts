// UI-ONLY BUILD: the docs renderer reached the Electron main process through
// window.desktop (DesktopApi: open/save docx, file IO, print, AI stream, fonts)
// and window.projectApi. The TipTap/ProseMirror editor runs client-side, so the
// editor works standalone against an in-memory document; every backend op is a
// no-op. DesktopApi is large, so the stub is a Proxy answering every method with
// an inert default - async null for operations, a no-op unsubscribe for on*/
// event subscribers, void for fire-and-forget. Live collaboration (sync-client)
// has no server here, so it stays disabled. Imported first in main.tsx.
import type { DesktopApi } from '../shared/ipc'
import type { ProjectApi } from '@genoffice/project-store'

const inert = (name: string) => {
  if (name.startsWith('on')) return () => () => {}
  if (/^(insightsFact|setDirty|notify|report|send)/.test(name)) return () => undefined
  return async () => null
}
const makeStub = <T,>(): T =>
  new Proxy({} as Record<string, unknown>, { get: (_t, p: string) => inert(p) }) as T

export function installUiStubs(): void {
  const w = window as unknown as Record<string, unknown>
  if (!w.desktop) w.desktop = makeStub<DesktopApi>()
  if (!w.projectApi) w.projectApi = makeStub<ProjectApi>()
}

installUiStubs()
