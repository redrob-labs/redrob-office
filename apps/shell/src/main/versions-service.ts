/// Version history and last visits for the whole app. Kept apart from
/// index.ts so the path checks are unit-testable without Electron.
import { isAbsolute, extname } from 'node:path'
import { VERSIONS_CHANNELS } from '@genoffice/versions'
import type { VersionStore } from '@genoffice/versions/store'

/** Documents that keep a history: the formats an editor here saves. */
const HISTORY_EXTS = new Set(['.docx', '.xlsx', '.xlsm', '.pptx', '.md', '.markdown', '.hwp', '.hwpx', '.pdf'])

/** A path a renderer may ask about: absolute, a document type, no NUL. */
export function isHistoryPath(p: unknown): p is string {
  return (
    typeof p === 'string' &&
    p.length > 0 &&
    p.length <= 4096 &&
    !p.includes('\u0000') &&
    isAbsolute(p) &&
    HISTORY_EXTS.has(extname(p).toLowerCase())
  )
}

const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

export interface IpcHandleLike {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void
}

export interface VersionsServiceDeps {
  store: VersionStore
  /** opens a restored copy in a new tab */
  openPath: (path: string) => void
}

export function registerVersionsIpc(ipc: IpcHandleLike, deps: VersionsServiceDeps): void {
  ipc.handle(VERSIONS_CHANNELS.list, (_e, path) => (isHistoryPath(path) ? deps.store.list(path) : []))
  ipc.handle(VERSIONS_CHANNELS.name, (_e, path, id, name) => {
    if (!isHistoryPath(path) || !isId(id) || typeof name !== 'string') return null
    return deps.store.name(path, id, name)
  })
  ipc.handle(VERSIONS_CHANNELS.restore, async (_e, path, id) => {
    if (!isHistoryPath(path) || !isId(id)) return null
    const copy = await deps.store.restoreCopy(path, id)
    if (copy) deps.openPath(copy)
    return copy
  })
  ipc.handle(VERSIONS_CHANNELS.visit, (_e, path) => (isHistoryPath(path) ? deps.store.markVisit(path) : null))
}
