import type { VersionInfo } from './model'

/** Version history over IPC; the shell's main process owns the store. */
export const VERSIONS_CHANNELS = {
  list: 'versions:list',
  name: 'versions:name',
  restore: 'versions:restore',
  visit: 'versions:visit',
} as const

/** What an editor preload exposes. Every call is about a document this view has open. */
export interface VersionsApi {
  /** newest first; empty outside the suite */
  listVersions(path: string): Promise<VersionInfo[]>
  nameVersion(path: string, id: string, name: string): Promise<VersionInfo | null>
  /** opens a copy of the version beside the document; resolves with the copy's path */
  restoreVersion(path: string, id: string): Promise<string | null>
  /** records this visit; resolves with the previous one (null on a first visit) */
  markVisit(path: string): Promise<string | null>
}

export interface VersionsBridgeIpc {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
}

const isVersion = (v: unknown): v is VersionInfo =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as VersionInfo).id === 'string' &&
  typeof (v as VersionInfo).at === 'string' &&
  typeof (v as VersionInfo).by === 'string'

export function versionsBridge(ipc: VersionsBridgeIpc): VersionsApi {
  return {
    listVersions: (path) =>
      ipc
        .invoke(VERSIONS_CHANNELS.list, path)
        .then((r) => (Array.isArray(r) ? r.filter(isVersion) : []))
        .catch(() => []),
    nameVersion: (path, id, name) =>
      ipc.invoke(VERSIONS_CHANNELS.name, path, id, name).then((r) => (isVersion(r) ? r : null)),
    restoreVersion: (path, id) =>
      ipc.invoke(VERSIONS_CHANNELS.restore, path, id).then((r) => (typeof r === 'string' ? r : null)),
    markVisit: (path) =>
      ipc
        .invoke(VERSIONS_CHANNELS.visit, path)
        .then((r) => (typeof r === 'string' ? r : null))
        .catch(() => null),
  }
}
