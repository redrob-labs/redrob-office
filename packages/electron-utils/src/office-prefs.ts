/**
 * Office-wide working preferences, stored in userData/app-settings.json under
 * `officePrefs` by the shell and broadcast to every editor view on change
 * (`app:office-prefs-changed`), the way the theme is.
 *
 * Pure: no Electron import, so renderers can import it through the
 * `@genoffice/electron-utils/office-prefs` subpath.
 */

/** the editor toolbar: the simplified one by default, the classic ribbon on demand */
export type ToolbarMode = 'simple' | 'classic'
/** Plan writes out what Redrob will do before it changes anything; Run starts at once */
export type ComposerModeValue = 'plan' | 'run'
/** when a Cross-check runs after an answer */
export type CrossCheckLevel = 'off' | 'auto' | 'always'

export interface OfficePrefs {
  toolbar: ToolbarMode
  /** the default for each new message; the panel can change it per message */
  composerMode: ComposerModeValue
  factCheck: CrossCheckLevel
  challenge: CrossCheckLevel
  /** one memory, kept by Redrob; a file can turn it off in its Redrob panel */
  memory: boolean
}

export const OFFICE_PREFS_KEY = 'officePrefs'
export const OFFICE_PREFS_CHANGED = 'app:office-prefs-changed'

export const DEFAULT_OFFICE_PREFS: Readonly<OfficePrefs> = Object.freeze({
  toolbar: 'simple',
  composerMode: 'run',
  factCheck: 'auto',
  challenge: 'auto',
  memory: true,
})

const TOOLBARS: readonly ToolbarMode[] = ['simple', 'classic']
const MODES: readonly ComposerModeValue[] = ['plan', 'run']
const LEVELS: readonly CrossCheckLevel[] = ['off', 'auto', 'always']

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback

/** every field validated; anything unknown or malformed takes the default */
export function normalizeOfficePrefs(raw: unknown, base: OfficePrefs = DEFAULT_OFFICE_PREFS): OfficePrefs {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return {
    toolbar: pick(r.toolbar, TOOLBARS, base.toolbar),
    composerMode: pick(r.composerMode, MODES, base.composerMode),
    factCheck: pick(r.factCheck, LEVELS, base.factCheck),
    challenge: pick(r.challenge, LEVELS, base.challenge),
    memory: typeof r.memory === 'boolean' ? r.memory : base.memory,
  }
}

/** what an editor preload exposes to read and follow the prefs */
export interface OfficePrefsApi {
  getOfficePrefs(): Promise<OfficePrefs | null>
  setOfficePrefs(patch: Partial<OfficePrefs>): Promise<OfficePrefs | null>
  onOfficePrefsChanged(handler: (prefs: OfficePrefs) => void): () => void
}

/** the slice of ipcRenderer the bridge needs (kept structural: no Electron import here) */
export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
}

/**
 * The prefs bridge for an editor preload. The shell owns the store
 * (`home:get-office-prefs` / `home:set-office-prefs`); outside the suite there
 * is no handler and every call resolves to null.
 */
export function officePrefsBridge(ipc: IpcRendererLike): OfficePrefsApi {
  return {
    getOfficePrefs: () =>
      ipc
        .invoke('home:get-office-prefs')
        .then((p) => normalizeOfficePrefs(p))
        .catch(() => null),
    setOfficePrefs: (patch) =>
      ipc
        .invoke('home:set-office-prefs', patch)
        .then((p) => normalizeOfficePrefs(p))
        .catch(() => null),
    onOfficePrefsChanged: (handler) => {
      const listener = (_e: unknown, p: unknown) => handler(normalizeOfficePrefs(p))
      ipc.on(OFFICE_PREFS_CHANGED, listener)
      return () => {
        ipc.removeListener(OFFICE_PREFS_CHANGED, listener)
      }
    },
  }
}

/** apply a partial change from a renderer: only valid fields move */
export function mergeOfficePrefs(current: OfficePrefs, patch: unknown): OfficePrefs {
  return normalizeOfficePrefs(patch, current)
}
