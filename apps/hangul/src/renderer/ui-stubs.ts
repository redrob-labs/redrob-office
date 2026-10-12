// UI-ONLY BUILD, LIVE ENGINE: the Hangul editor engine (@genoffice/hwp-editor
// over the hwp-core WASM) is NOT stubbed - it runs in the renderer and the
// editor host (src/renderer/next) drives it, so editing works in the browser.
// What IS stubbed is only window.hangulApi: the Electron bridge for reading and
// writing .hwp/.hwpx bytes, the versions/share/live collaboration bridges, print
// and AI. With these inert the editor opens a blank document you can edit;
// opening/saving files, collaboration and AI are no-ops. Imported first in main.tsx.
import type { HangulApi } from '../shared/ipc'

const inert = (name: string) => {
  if (name.startsWith('on')) return () => () => {}
  if (/^(insightsFact|setDirty|notify|report|send|log|mark)/.test(name)) return () => undefined
  return async () => null
}
const makeStub = <T,>(): T =>
  new Proxy({} as Record<string, unknown>, { get: (_t, p: string) => inert(p) }) as T

export function installUiStubs(): void {
  const w = window as unknown as Record<string, unknown>
  if (!w.hangulApi) w.hangulApi = makeStub<HangulApi>()
}

installUiStubs()
