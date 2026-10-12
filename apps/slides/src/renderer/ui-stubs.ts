// UI-ONLY BUILD: the slides renderer reached the Electron main process through
// window.slidesApi (a very large surface: open/save, every element/slide edit,
// export, presenter, AI) plus window.desktop (attachments) and window.projectApi.
// The Konva render layer draws a plain-data RenderSlide view-model, so the UI
// renders; but with no backend there is no deck to open and every edit op is a
// no-op. Because SlidesApi has ~130 methods that nearly all return
// `RenderSlide | null`, the stub is a Proxy that answers every method call with
// an inert default - async null for operations, a no-op unsubscribe for on*/
// event subscribers, and void for fire-and-forget - cast to the interface type.
// This is a faithful "nothing happens" stand-in, not a reimplementation.
import type { SlidesApi } from '../shared/ipc'
import type { ProjectApi } from '@genoffice/project-store'

// Methods whose name implies an event subscription return an unsubscribe fn;
// fire-and-forget methods return void; everything else resolves to null.
const inert = (name: string) => {
  if (name.startsWith('on')) return () => () => {}
  if (/^(presenterSync|presenterInk|audienceNav|insightsFact|setAutoSavePref|reportCloseSaveResult|nativeClipboard)$/.test(name)) {
    return () => undefined
  }
  return async () => null
}

const makeStub = <T,>(): T =>
  new Proxy({} as Record<string, unknown>, {
    get: (_t, prop: string) => inert(prop),
  }) as T

const slidesApi = makeStub<SlidesApi>()
const projectApi = makeStub<ProjectApi>()
const desktop = makeStub<Record<string, (...a: unknown[]) => Promise<unknown>>>()

export function installUiStubs(): void {
  const w = window as unknown as Record<string, unknown>
  if (!w.slidesApi) w.slidesApi = slidesApi
  if (!w.projectApi) w.projectApi = projectApi
  if (!w.desktop) w.desktop = desktop
}

installUiStubs()
