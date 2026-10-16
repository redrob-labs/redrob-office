/// Drag & drop a local document file anywhere in the app window to open it.
///
/// Renderers share one main process (the shell hosts every editor view), so the
/// bridge only has to resolve dropped files to paths and send them over ONE
/// channel; the shell routes each path through its normal open pipeline. The
/// installer runs inside preloads, where `webUtils.getPathForFile` is callable
/// and DOM listeners see real OS drops — paths never cross contextBridge.
///
/// Ownership contract with page-level drop zones: a zone that handles its own
/// file drops (AI attachment panels, slides image insert) cancels the event
/// before it bubbles here (`defaultPrevented`), and this bridge stays out of
/// the way. Text/media drags without OS files are untouched.
import { ipcRenderer, webUtils } from 'electron'

export const DROP_OPEN_CHANNEL = 'app:open-dropped-files'

/** Extensions routed by apps/shell routeDocumentPath — keep in sync there and
 *  with OPEN_DIALOG_EXTENSIONS / OPEN_LOCAL_EXTENSIONS on the home screen. */
export const OPENABLE_DOC_RE = /\.(docx|xlsx|xlsm|xls|csv|pptx|pdf|md|markdown|hwp|hwpx)$/i

/** Recognized-but-unsupported formats. Kept for callers that want to tell a
 *  legacy office format from an arbitrary file; the drop pipeline itself now
 *  reports EVERY non-openable extension ("Unsupported file type: .pem"), since
 *  a drop that does nothing reads as a broken app. */
export const KNOWN_UNSUPPORTED_DOC_RE = /\.(doc|rtf|odt|ppt|pps|odp|ods|xlsb|pages|key|numbers)$/i

/** any file with an extension: what a person would expect a drop to react to */
const HAS_EXTENSION_RE = /\.([A-Za-z0-9]{1,16})$/

/** upper bound on how many files one drop may ask to open */
const MAX_DROPPED_FILES = 20

/** the resolver signature webUtils.getPathForFile satisfies; injectable for tests */
type PathResolver = (file: File) => string

/**
 * Resolve an event's dropped files to local paths. Returns null when the drag
 * carries no OS files at all (internal text/element drags), or [] when it does
 * but none resolve (directories, virtual entries) — both mean "not ours".
 */
export function droppableFilePaths(
  ev: Pick<DragEvent, 'dataTransfer'>,
  getPathForFile: PathResolver,
): string[] | null {
  const transfer = ev.dataTransfer
  if (!transfer || !transfer.types.includes('Files')) return null
  const paths: string[] = []
  for (const file of Array.from(transfer.files)) {
    // non-empty guard covers virtual entries (e.g. page-referenced blobs) that resolve to ''
    const path = getPathForFile(file).trim()
    if (path) paths.push(path)
  }
  return paths
}

/**
 * Sanitize + classify a raw IPC payload: strings only, trimmed, deduped,
 * capped, then split into directly-openable paths and unsupported extensions
 * (unique, first-seen order). Extension-less entries fall out silently.
 */
export function partitionDropPayload(raw: unknown): {
  supported: string[]
  unsupportedExts: string[]
} {
  const supported: string[] = []
  const unsupportedExts: string[] = []
  if (!Array.isArray(raw)) return { supported, unsupportedExts }
  const seen = new Set<string>()
  for (const entry of raw as unknown[]) {
    if (typeof entry !== 'string') continue
    const path = entry.trim()
    if (!path || seen.has(path)) continue
    seen.add(path)
    if (OPENABLE_DOC_RE.test(path)) {
      // keep scanning for unsupported entries even after hitting the open cap
      if (supported.length < MAX_DROPPED_FILES) supported.push(path)
    } else if (HAS_EXTENSION_RE.test(path)) {
      // every other extension is reported, not swallowed: a drop that does
      // nothing is indistinguishable from a broken app
      const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
      if (!unsupportedExts.includes(ext)) unsupportedExts.push(ext)
    }
  }
  return { supported, unsupportedExts }
}

/** Symbol.for keeps repeated installs idempotent when several bundled copies of
 *  this module end up in one process (mirrors navigation-guard). */
const INSTALLED = Symbol.for('genoffice.drop-open-installed')

/**
 * Preload-side hook: makes `drop` fire for document drags anywhere in the
 * page and forwards recognized files to the shell's router. Intentionally not
 * exposed through contextBridge — page code cannot spoof these events with
 * arbitrary paths because payload construction happens here in the preload
 * world only.
 */
export function installDropOpenBridge(): void {
  const holder = globalThis as Record<symbol, boolean | undefined>
  if (typeof window === 'undefined' || holder[INSTALLED]) return
  holder[INSTALLED] = true

  // Without a canceled dragover Chromium never fires `drop`; canceling here is
  // what lets a document-drag land anywhere that isn't already a drop zone.
  window.addEventListener('dragover', (ev: DragEvent) => {
    if (ev.defaultPrevented) return
    if (!ev.dataTransfer?.types.includes('Files')) return
    ev.preventDefault()
  })

  window.addEventListener('drop', (ev: DragEvent) => {
    // first: something in the page already claimed this drop (image insert,
    // AI attachments...) — never second-guess it
    if (ev.defaultPrevented) return
    const paths = droppableFilePaths(ev, (file) => webUtils.getPathForFile(file))
    if (!paths) return
    // every file rides along: the shell opens the documents and tells the
    // person about the rest ("not supported"); folders (no extension) are
    // swallowed here so they neither navigate the page nor produce open attempts
    const payload = paths.filter((p) => HAS_EXTENSION_RE.test(p))
    ev.preventDefault()
    if (payload.length === 0) return
    ipcRenderer.send(DROP_OPEN_CHANNEL, payload.slice(0, MAX_DROPPED_FILES))
  })
}
