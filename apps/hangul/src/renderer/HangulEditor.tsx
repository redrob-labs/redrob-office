/**
 * The Hangul (.hwp/.hwpx) editor surface for the GenOffice / Redrob shell.
 *
 * GenOffice ships no Hangul app, so the editing surface comes from rhwp. The
 * @rhwp/editor SDK (MIT, Copyright 2025-2026 Edward Kim) iframe-embeds
 * rhwp-studio with its full menu, toolbar, and table editing, and exposes
 * exportHwp/exportHwpx plus a notifySaved persistence contract. This component
 * mounts that editor into a container, loads the document's bytes through the
 * host seam (window.hangulApi.readBytes), and on save runs the exact
 * export -> host.save -> notifySaved contract implemented in the pure,
 * unit-tested hangul-save.ts.
 *
 * The studio is served from an app-local loopback origin (never a public CDN);
 * see studio-origin.ts. The live iframe cannot run under the headless test env,
 * so the testable logic lives in hangul-save.ts and studio-origin.ts; this file
 * is a dev / manual smoke. See the repository NOTICE for rhwp (MIT) attribution.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createEditor, type RhwpEditor } from '@rhwp/editor'
import { useI18n } from './i18n/locale'
import { saveHangulDocument } from './hangul-save'
import { resolveStudioOrigin, type StudioOriginResult } from './studio-origin'
import type { HangulFormat, SaveMode } from '../shared/ipc'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** The document format the open path names, defaulting to hwp. */
function formatOf(fileName: string): HangulFormat {
  return fileName.toLowerCase().endsWith('.hwpx') ? 'hwpx' : 'hwp'
}

export function HangulEditor(): React.JSX.Element {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<RhwpEditor | null>(null)
  const fileNameRef = useRef<string>('')
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  // The studio origin is served by the host (an app-local loopback origin over
  // the bundled, offline studio build), so it is resolved asynchronously. Null
  // means it is still resolving; a settled result names the URL or the reason.
  const [origin, setOrigin] = useState<StudioOriginResult | null>(null)

  useEffect(() => {
    let cancelled = false
    void resolveStudioOrigin(window.hangulApi).then((result) => {
      if (!cancelled) setOrigin(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Mount the studio and load the pending document's bytes once the origin is
  // known. The iframe reloads if moved, so the editor is created fresh and
  // destroyed on unmount rather than reparented.
  const studioUrl = origin?.studioUrl ?? null
  useEffect(() => {
    if (!studioUrl) return
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    let created: RhwpEditor | null = null
    setReady(false)
    setLoadError(null)
    ;(async () => {
      try {
        const editor = await createEditor(container, { studioUrl })
        if (cancelled) {
          editor.destroy()
          return
        }
        created = editor
        editorRef.current = editor
        const pending = await window.hangulApi.consumePending()
        if (pending) {
          const { base64, fileName } = await window.hangulApi.readBytes(pending)
          fileNameRef.current = fileName
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
          if (cancelled) return
          await editor.loadFile(bytes, fileName)
        }
        if (cancelled) return
        setReady(true)
      } catch (err) {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
      created?.destroy()
      if (editorRef.current === created) editorRef.current = null
    }
  }, [studioUrl])

  const doSave = useCallback(
    async (mode: SaveMode): Promise<boolean> => {
      const editor = editorRef.current
      if (!editor) return false
      setSaveState('saving')
      setSaveError(null)
      try {
        const fileName = fileNameRef.current
        const result = await saveHangulDocument(editor, window.hangulApi, {
          format: fileName ? formatOf(fileName) : 'hwp',
          mode,
          fileName: fileName || undefined,
        })
        if (!result.saved) {
          setSaveState('idle')
          return false
        }
        if (result.path) {
          fileNameRef.current = result.path.split(/[\\/]/).pop() ?? fileNameRef.current
        }
        window.hangulApi.setDirty(false)
        setSaveState('saved')
        return true
      } catch (err) {
        setSaveState('error')
        setSaveError(err instanceof Error ? err.message : String(err))
        return false
      }
    },
    [],
  )

  // Mirror rhwp's document-changed events to the host as the dirty flag so the
  // shell's close guard prompts before discarding edits.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !ready) return
    return editor.onDocumentChanged(() => {
      window.hangulApi.setDirty(true)
      setSaveState('idle')
    })
  }, [ready])

  // Shell menu Save / Save As -> export via rhwp and write.
  useEffect(
    () =>
      window.hangulApi.onSaveRequest((mode) => {
        void doSave(mode).then((ok) => {
          if (!ok) window.hangulApi.sendSaveRequestAck(false)
        })
      }),
    [doSave],
  )

  // Main picked "Save" in the close prompt -> save and reply.
  useEffect(
    () =>
      window.hangulApi.onCloseSaveRequest(() => {
        void doSave('save').then((ok) => window.hangulApi.sendCloseSaveResult(ok))
      }),
    [doSave],
  )

  // Ctrl/Cmd+S saves, matching the other editors in the shell.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void doSave('save')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doSave])

  // While the origin is still resolving (null), show a settling notice rather
  // than reaching for origin.studioUrl, which is not known yet.
  if (!origin) {
    return (
      <div className="hangul-notice-wrap">
        <p className="hangul-notice" role="status">
          {t('resolvingStudio')}
        </p>
      </div>
    )
  }

  // A settled result with no URL means no offline studio is available. Never
  // reach the public CDN: show the offline notice instead.
  if (!origin.studioUrl) {
    return (
      <div className="hangul-notice-wrap">
        <p className="hangul-notice" role="status">
          {t('offlineUnavailable')}
        </p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="hangul-notice-wrap">
        <p className="hangul-notice hangul-notice-error" role="alert">
          {t('loadFailed', { error: loadError })}
        </p>
      </div>
    )
  }

  return (
    <div className="hangul-root">
      <div className="hangul-toolbar">
        <button
          type="button"
          className="hangul-save-button"
          disabled={!ready || saveState === 'saving'}
          onClick={() => void doSave('save')}
        >
          {saveState === 'saving' ? t('saving') : t('save')}
        </button>
        {saveState === 'saved' ? <span className="hangul-status">{t('saved')}</span> : null}
        {saveState === 'error' && saveError ? (
          <span className="hangul-status hangul-status-error">
            {t('saveFailed', { error: saveError })}
          </span>
        ) : null}
        <span className="hangul-powered">{t('poweredBy')}</span>
      </div>
      <div ref={containerRef} className="hangul-studio-container" />
    </div>
  )
}
