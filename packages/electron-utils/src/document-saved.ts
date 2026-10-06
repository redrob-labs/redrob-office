/**
 * One save bus for every editor.
 *
 * Each editor's main process calls `emitDocumentSaved` after its atomic write succeeds,
 * with the bytes that are now on disk (still encrypted when the file is). The shell
 * subscribes once and records version history and uploads shared files from it, so a
 * feature added there works in every editor at the same time.
 *
 * Kept on globalThis because the shell bundles each editor's main process, and a second
 * copy of this module must still reach the listeners the shell installed. Listeners run
 * synchronously and must not throw into a save; failures are contained here.
 */
export type DocumentSaved = {
  path: string
  bytes: Uint8Array
  /** an autosave rather than a save the person asked for */
  auto: boolean
  /** which editor wrote it */
  editor: 'docs' | 'sheets' | 'slides' | 'pdf' | 'markdown' | 'hangul'
}

export type DocumentSavedListener = (event: DocumentSaved) => void

const SLOT = Symbol.for('redrob.office.documentSaved')
type Slot = { [SLOT]?: Set<DocumentSavedListener> }

function listeners(): Set<DocumentSavedListener> {
  const g = globalThis as Slot
  return (g[SLOT] ??= new Set())
}

/** Subscribe; returns an unsubscribe. */
export function onDocumentSaved(listener: DocumentSavedListener): () => void {
  listeners().add(listener)
  return () => listeners().delete(listener)
}

/** Announce a completed save. Never throws. */
export function emitDocumentSaved(event: DocumentSaved): void {
  for (const listener of [...listeners()]) {
    try {
      listener(event)
    } catch (e) {
      console.warn('[save-bus] listener failed:', e instanceof Error ? e.message : String(e))
    }
  }
}
