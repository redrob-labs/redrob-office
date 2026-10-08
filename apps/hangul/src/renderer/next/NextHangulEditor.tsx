/**
 * The owned Hangul editor (spec .kiro/specs/hangul-editor), mounted only when
 * main reports editor kind 'next' (REDROB_HANGUL_EDITOR=next, unpackaged).
 *
 * The engine (packages/hwp-core) paints every document pixel; EditorView
 * (packages/hwp-editor) owns input, caret, selection, IME and the clipboard.
 * This component is the frame around it: open and save through the existing
 * host seam (window.hangulApi), dirty state to main for the close prompt, and
 * the shared EditorFrame with real undo/redo and formatting toggles. The full
 * 한글 ribbon and dialogs are Phase 2.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { coreVersion, initHwpCore } from '@genoffice/hwp-core'
import { CommandBus, Comments, EditorView, Revisions, catchUpComments, catchUpRevisions, changedParagraphs, revisionCommands } from '@genoffice/hwp-editor'
import { HwpCoreDocument } from '@genoffice/hwp-core'
import { catchUpItems, type CatchUpItem } from '@genoffice/versions'
import type { ShareApi } from '@genoffice/sync-client'
import '@genoffice/ui/collab/versions.css'
import '@genoffice/ui/collab/share.css'
import {
  Alert,
  Badge,
  Button,
  CatchUp,
  PresenceFaces,
  SHARE_STRINGS,
  ShareDialog,
  VersionHistory,
  verT,
  EditorFrame,
  Input,
  StatusBar,
  frameCopy,
  frameT,
  useFrameState,
} from '@genoffice/ui'
import { useI18n } from '../i18n/locale'
import { HangulAiPanel, type AiPreset } from '../ai/AiPanel'
import { CommentsRail } from './CommentsRail'
import { useHangulLive } from './useHangulLive'
import type { SaveMode } from '../../shared/ipc'
import { CharShapeDialog, ParaShapeDialog } from './ShapeDialogs'
import { TableCellDialog } from './TableDialogs'
import { ObjectPropertiesDialog } from './ObjectDialogs'
import { ClickHereDialog, HyperlinkDialog } from './FieldDialogs'
import { StyleDialog } from './StyleDialog'
import { ChartDialog } from './ChartDialog'
import { AboutDialog, PageHideDialog } from './InfoDialogs'
import {
  BulletShapeDialog,
  ColumnSettingsDialog,
  DeleteRowsColsDialog,
  EndnoteShapeDialog,
  FieldEditDialog,
  GridSettingsDialog,
  HeaderFooterTemplateDialog,
  InsertRowsColsDialog,
  NumberingShapeDialog,
  PageBorderDialog,
  SectionSettingsDialog,
  SymbolsDialog,
} from './MoreDialogs'
import { fieldAt } from '@genoffice/hwp-editor'
import { DIALOG_FIRST, runHostCommand, type HostDeps, type HostDialog } from './host-commands'
import { FindDialog, PageSetupDialog } from './FindPageDialogs'
import { InsertPromptDialog, usePicturePicker, type InsertKind } from './InsertDialogs'
import { HangulRibbon, HangulSimpleToolbar, clipboardCopy, clipboardPaste, commandLabel } from './HangulRibbon'
import { COMMAND_LABELS } from '../i18n/command-labels'
import { HwpPasswordError, base64ToBytes, newDocument, openDocument, saveDocument, type OpenedDocument } from './document'

type Phase =
  | { kind: 'loading' }
  | { kind: 'password'; bytes: Uint8Array; fileName: string; wrong: boolean }
  | { kind: 'error'; message: string }
  | { kind: 'ready' }

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string }

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

/** The request Redrob runs for a comment that mentions it (same contract as Docs). */
export function redrobCommentPrompt(threadId: number, text: string): string {
  const body = text.replace(/\s+/g, ' ').trim().slice(0, 600)
  return `A comment in this document mentions @Redrob (comment thread ${threadId}): "${body}". Answer it in its thread with reply_comment, threadId ${threadId}. Do not change the document and do not resolve the comment.`
}

export function NextHangulEditor(): React.JSX.Element {
  const { t, lang } = useI18n()
  const frame = useFrameState(window.hangulApi, 'hangul-frame-panel-width')
  const frameText = frameCopy(lang)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })
  const [panelOpen, setPanelOpen] = useState(false)
  const [mode, setMode] = useState<'editing' | 'suggesting' | 'viewing'>('editing')
  const modeRef = useRef(mode)
  modeRef.current = mode
  const revisionsRef = useRef<Revisions | null>(null)
  const stopRecordingRef = useRef<(() => void) | null>(null)
  const authorRef = useRef('User')
  const [dialog, setDialog] = useState<HostDialog | null>(null)
  const [revision, refresh] = useReducer((n: number) => n + 1, 0)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentComposing, setCommentComposing] = useState(false)
  const [author, setAuthor] = useState('User')
  const [aiPreset, setAiPreset] = useState<AiPreset | null>(null)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [catchUp, setCatchUp] = useState<{ since: string; items: CatchUpItem[] } | null>(null)
  const visitedRef = useRef<string | null>(null)
  /** bumped when the document is replaced in memory (a live room's newer shared version) */
  const [docGen, setDocGen] = useState(0)
  const commentsRef = useRef<Comments | null>(null)
  useEffect(() => {
    void window.hangulApi.authorName?.().then((n) => n && (setAuthor(n), (authorRef.current = n))).catch(() => {})
  }, [])
  const openedRef = useRef<OpenedDocument | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const pathRef = useRef<string>('')
  const picture = usePicturePicker(() => viewRef.current, refresh)

  const doSave = useCallback(async (saveMode: SaveMode, format?: 'hwp' | 'hwpx'): Promise<boolean> => {
    const opened = openedRef.current
    if (!opened) return false
    setSaveState({ kind: 'saving' })
    try {
      const out = await saveDocument(opened, window.hangulApi, saveMode, format ?? opened.format)
      if (!out.saved) {
        setSaveState({ kind: 'idle' })
        // 'tracked-changes' refuses only a conversion to .hwp, which this editor never asks for.
        return false
      }
      pathRef.current = out.path
      setSaveState({ kind: 'saved' })
      window.hangulApi.setDirty(opened.session.dirty)
      refresh()
      return true
    } catch (e) {
      setSaveState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      return false
    }
  }, [])

  const [markupHidden, setMarkupHidden] = useState(false)
  const [gridPx, setGridPx] = useState(20)
  // What host commands reach; refreshed every render so it sees the latest state setters.
  const hostDepsRef = useRef<HostDeps>(null as unknown as HostDeps)
  hostDepsRef.current = {
    openDialog: setDialog,
    save: (m, format) => void doSave(m, format),
    clipboard: (kind) => {
      const v = viewRef.current
      if (v) void (kind === 'paste' ? clipboardPaste(v) : clipboardCopy(v, kind === 'cut')).then(refresh)
    },
    run: (id, params) => {
      const v = viewRef.current
      if (!v || !v.bus.has(id) || !v.bus.isEnabled(id, params)) return false
      v.run(id, params)
      return true
    },
    pickPicture: () => picture.open(),
    comments: (compose) => {
      setCommentsOpen(compose ? true : (o) => !o)
      if (compose) setCommentComposing(true)
    },
    versions: () => setVersionsOpen(true),
    setToolbar: (choice) => frame.setToolbar(choice),
    toggleMarkup: () => setMarkupHidden((h) => !h),
    objectKind: () => viewRef.current?.session.object?.kind ?? null,
    inTable: () => !!viewRef.current?.session.selection.head.cell,
    inField: () => (viewRef.current ? fieldAt(viewRef.current.session) !== null : false),
  }

  const mount = useCallback((opened: OpenedDocument) => {
    openedRef.current = opened
    setPhase({ kind: 'ready' })
  }, [])

  const load = useCallback(
    async (bytes: Uint8Array, fileName: string, password?: string) => {
      try {
        mount(await openDocument(bytes, fileName, password))
      } catch (e) {
        if (e instanceof HwpPasswordError) setPhase({ kind: 'password', bytes, fileName, wrong: password !== undefined })
        else setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    },
    [mount],
  )

  // Open the pending document once.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await initHwpCore()
        const path = await window.hangulApi.consumePending()
        if (cancelled) return
        if (!path) return mount(newDocument())
        pathRef.current = path
        const { base64, fileName } = await window.hangulApi.readBytes(path)
        if (!cancelled) await load(base64ToBytes(base64), fileName)
      } catch (e) {
        if (!cancelled) setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load, mount])

  // The document body's accessible name follows the UI language.
  useEffect(() => {
    viewRef.current?.setInputLabel(t('nextDocumentBody'))
  }, [lang])

  // Mount the editor view once a document is open.
  useEffect(() => {
    const opened = openedRef.current
    const host = hostRef.current
    if (phase.kind !== 'ready' || !opened || !host || viewRef.current) return
    const bus = new CommandBus(opened.session)
    const view = new EditorView(host, opened.session, bus, {
      mac: isMac,
      inputLabel: t('nextDocumentBody'),
      // The main process opens http(s) and mailto links in the browser and refuses anything else.
      onOpenLink: (uri) => void window.open(uri, '_blank', 'noopener'),
      onRender: refresh,
      dialogFirst: DIALOG_FIRST,
      onUnhandledCommand: (id, params) => runHostCommand(hostDepsRef.current, id, params),
    })
    viewRef.current = view
    commentsRef.current = new Comments(opened.session)
    revisionsRef.current = new Revisions(opened.session)
    for (const c of revisionCommands(revisionsRef.current, {
      isRecording: () => modeRef.current === 'suggesting',
      setRecording: (on) => setMode(on ? 'suggesting' : 'editing'),
    }))
      bus.register(c)
    // A document that arrives with memos opens with them showing, as in 한글.
    if (commentsRef.current.threads().length) setCommentsOpen(true)
    const offChange = opened.session.onChange(() => {
      window.hangulApi.setDirty(opened.session.dirty)
      setSaveState((s) => (s.kind === 'saved' ? { kind: 'idle' } : s))
      refresh()
    })
    const offSettle = opened.session.onSettle(refresh)
    view.focus()
    refresh()
    return () => {
      offChange()
      offSettle()
      view.dispose()
      viewRef.current = null
      commentsRef.current = null
      opened.session.dispose()
      stopRecordingRef.current?.()
      stopRecordingRef.current = null
      revisionsRef.current = null
    }
  }, [phase.kind, doSave, docGen])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.readOnly = mode === 'viewing'
    view.recording = mode === 'suggesting'
    // Suggesting records typing and deleting as tracked changes, signed with this computer's user.
    stopRecordingRef.current?.()
    stopRecordingRef.current = null
    if (mode === 'suggesting' && revisionsRef.current) stopRecordingRef.current = revisionsRef.current.record(view.bus, authorRef.current)
    refresh()
  }, [mode, phase.kind, docGen])

  // Tracked changes are marked on the page: insertions underlined, deletions struck through.
  useEffect(() => {
    const view = viewRef.current
    const rev = revisionsRef.current
    if (!view || !rev) return
    for (const k of view.overlay.decorationKeys()) if (k.startsWith('rev:')) view.overlay.clearDecoration(k)
    for (const r of rev.list()) {
      const range = rev.range(r)
      try {
        view.overlay.setDecoration({ key: `rev:${r.id}`, kind: r.kind === 'insert' ? 'suggestion-insert' : 'suggestion-delete', rects: view.session.text.selectionRects(range.anchor, range.head), label: `${r.author} · ${r.kind === 'insert' ? t('reviewInserted') : t('reviewDeleted')}` })
      } catch {
        /* mid-relayout; the next render paints it */
      }
    }
  }, [revision, t])

  // Shell menu Save / Save As, and the close prompt.
  useEffect(() => {
    const offSave = window.hangulApi.onSaveRequest((m) => {
      void doSave(m).then((ok) => window.hangulApi.sendSaveRequestAck(ok))
    })
    const offClose = window.hangulApi.onCloseSaveRequest(() => {
      void doSave('save').then((ok) => window.hangulApi.sendCloseSaveResult(ok))
    })
    const offRename = window.hangulApi.onFileRenamed((p) => {
      pathRef.current = p
      if (openedRef.current) openedRef.current.fileName = p.split(/[\\/]/).pop() ?? openedRef.current.fileName
      refresh()
    })
    return () => {
      offSave()
      offClose()
      offRename()
    }
  }, [doSave])

  // Live typing in a shared file (the shell holds the room).
  const live = useHangulLive({
    api: window.hangulApi,
    path: phase.kind === 'ready' ? pathRef.current || null : null,
    view: viewRef.current,
    reload: (bytes) => {
      const old = openedRef.current
      if (!old) return
      void openDocument(bytes, old.fileName, old.password).then((next) => {
        openedRef.current = next
        setDocGen((g) => g + 1)
      })
    },
    onChange: refresh,
  })

  // Catch-up on open: what others did since this person last had the file open.
  useEffect(() => {
    const opened = openedRef.current
    const path = pathRef.current
    const api = window.hangulApi
    if (phase.kind !== 'ready' || !opened || !path || visitedRef.current === path || !api.markVisit) return
    visitedRef.current = path
    void (async () => {
      const since = await api.markVisit!(path)
      if (!since || visitedRef.current !== path) return
      const s = opened.session
      const items: CatchUpItem[] = catchUpItems({ since, me: authorRef.current, comments: catchUpComments(s), revisions: catchUpRevisions(s), waitingFigures: 0 })
      // Plain edits: compare with the newest version saved before the last visit.
      try {
        const versions = (await api.listVersions?.(path)) ?? []
        const then = versions.find((v) => Date.parse(v.at) <= Date.parse(since))
        const b64 = then ? await api.readVersion?.(path, then.id) : null
        if (b64) {
          const old = HwpCoreDocument.open(base64ToBytes(b64), opened.password)
          const changed = changedParagraphs(old, s.doc)
          old.dispose()
          if (changed.length) items.push({ kind: 'edits', count: changed.length, at: changed[0]! })
        }
      } catch {
        /* an unreadable old version only loses the edits line */
      }
      if (items.length) {
        setCatchUp({ since, items })
        setPanelOpen(true)
      }
    })()
  }, [phase.kind])

  const showCatchUpItem = (item: CatchUpItem) => {
    const view = viewRef.current
    if (!view) return
    if (item.kind === 'comment') {
      setCommentsOpen(true)
      const th = commentsRef.current?.thread(Number(item.commentId))
      if (th) view.session.select(commentsRef.current!.range(th))
    } else if (item.kind === 'suggestion' || item.kind === 'edits') {
      const loc = view.session.doc.locate(item.at)
      if (loc && !loc.path.length) view.session.select({ anchor: { section: loc.section, para: loc.para, offset: 0 }, head: { section: loc.section, para: loc.para, offset: 0 } })
    }
    view.render()
    view.focus()
  }

  // Commented text is highlighted on the page (overlay decorations, never the canvas).
  useEffect(() => {
    const view = viewRef.current
    const comments = commentsRef.current
    if (!view || !comments) return
    for (const k of view.overlay.decorationKeys()) if (k.startsWith('comment:')) view.overlay.clearDecoration(k)
    if (!commentsOpen) return
    for (const th of comments.threads()) {
      if (th.resolved) continue
      const r = comments.range(th)
      try {
        view.overlay.setDecoration({ key: `comment:${th.id}`, kind: 'comment', rects: view.session.text.selectionRects(r.anchor, r.head), label: th.root.text })
      } catch {
        /* the anchor is mid-relayout; the next render paints it */
      }
    }
  }, [revision, commentsOpen])

  if (phase.kind === 'loading') {
    return (
      <div className="hangul-notice-wrap">
        <Alert tone="info" className="hangul-notice">
          {t('nextLoading')}
        </Alert>
      </div>
    )
  }
  if (phase.kind === 'error') {
    return (
      <div className="hangul-notice-wrap">
        <Alert tone="danger" className="hangul-notice">
          {t('loadFailed', { error: phase.message })}
        </Alert>
      </div>
    )
  }
  if (phase.kind === 'password') return <PasswordForm phase={phase} onSubmit={(pw) => void load(phase.bytes, phase.fileName, pw)} />

  const opened = openedRef.current!
  const s = opened.session
  const view = viewRef.current
  const run = (id: string) => () => {
    view?.run(id)
    view?.focus()
    refresh()
  }
  const fileButtons = (classic: boolean) => (
    <div className="hangul-file-buttons">
      <Button size="sm" onClick={() => void doSave('save')} loading={saveState.kind === 'saving'}>
        {t('save')}
      </Button>
      {classic ? (
        <Button size="sm" variant="secondary" onClick={() => void doSave('saveAs')}>
          {t('saveAs')}
        </Button>
      ) : null}
    </div>
  )
  const ribbonProps = { view, mac: isMac, readOnly: mode === 'viewing', onRan: refresh, onCommand: (id: string) => void runHostCommand(hostDepsRef.current, id) }
  const tools = (classic: boolean) => (
    <div className="hangul-toolbar">
      {classic ? <HangulRibbon {...ribbonProps} /> : <HangulSimpleToolbar {...ribbonProps} />}
      {fileButtons(classic)}
    </div>
  )
  const info = s.doc.info()
  const substituted = info.fontSubstitutions.length
    ? info.fontSubstitutions.map((f) => String(f.requested ?? JSON.stringify(f))).join(', ')
    : ''

  return (
    <div className="hangul-root">
      <EditorFrame
        strings={frameText.frame}
        fileName={opened.fileName || t('untitled')}
        onUndo={run('edit:undo')}
        onRedo={run('edit:redo')}
        canUndo={s.canUndo && mode === 'editing'}
        canRedo={s.canRedo && mode === 'editing'}
        saveStatus={
          <span className="hangul-status" role="status" aria-live="polite">
            <button type="button" className="hangul-save-status" aria-haspopup="dialog" title={verT('verOpen')} onClick={() => setVersionsOpen(true)}>
              {s.dirty ? frameT(lang, 'unsaved') : frameT(lang, 'saved')}
            </button>
            {saveState.kind === 'saved' && !s.dirty ? (
              <Badge tone="success" size="sm" dot>
                {t('saved')}
              </Badge>
            ) : null}
            {saveState.kind === 'error' ? (
              <Badge tone="danger" size="sm" dot>
                {t('saveFailed', { error: saveState.message })}
              </Badge>
            ) : null}
          </span>
        }
        faces={
          live.faces.length ? (
            <PresenceFaces people={live.faces} strings={{ label: t('liveFaces'), person: t('livePerson'), personHere: t('livePersonHere'), more: t('liveMore'), joined: t('liveJoined'), left: t('liveLeft') }} />
          ) : undefined
        }
        share={
          window.hangulApi.shareStatus ? (
            <Button size="sm" variant="secondary" aria-haspopup="dialog" onClick={() => setShareOpen(true)}>
              {SHARE_STRINGS.button}
            </Button>
          ) : undefined
        }
        search={{
          tools: [
            { id: 'versions', label: verT('verOpen'), keywords: ['history', '버전'], run: () => setVersionsOpen(true) },
            { id: 'save', label: t('save'), run: () => void doSave('save') },
            { id: 'save-as', label: t('saveAs'), run: () => void doSave('saveAs') },
            ...(view ? view.bus.ids().filter((id) => COMMAND_LABELS[id]).map((id) => ({ id, label: commandLabel(id, lang), run: run(id), disabled: !view.bus.isEnabled(id) })) : []),
            { id: 'ask', label: t('askRedrob'), keywords: ['redrob', 'ai'], run: () => setPanelOpen(true) },
            { id: 'comments', label: t('commentsOpen'), keywords: ['memo', '메모', 'comment'], run: () => setCommentsOpen(true) },
            { id: 'comment-new', label: t('commentsNew'), keywords: ['memo', '메모', 'comment'], run: () => (setCommentsOpen(true), setCommentComposing(true)), disabled: !view || view.session.selection.anchor === view.session.selection.head },
          ],
          strings: frameText.search,
        }}
        mode={{
          value: mode,
          onChange: (m) => setMode(m === 'viewing' ? 'viewing' : m === 'suggesting' && opened.format === 'hwpx' ? 'suggesting' : 'editing'),
          strings: frameText.mode,
          // HWP 5.0 revisions are undocumented (P-1): suggesting needs an .hwpx document.
          unavailable: opened.format === 'hwpx' ? [] : ['suggesting'],
        }}
        toolbar={frame.toolbar}
        onToolbarChange={frame.setToolbar}
        toolbarStrings={frameText.toolbar}
        banner={
          opened.trackedChanges === true ? (
            <Alert tone="info" title={t('nextTrackedTitle')} className="hangul-tracked-banner">
              {t('nextTrackedBody')}
            </Alert>
          ) : undefined
        }
        simpleToolbar={tools(false)}
        classicToolbar={tools(true)}
        rail={
          commentsOpen && view && commentsRef.current ? (
            <CommentsRail
              view={view}
              comments={commentsRef.current}
              me={author}
              revision={revision}
              composing={commentComposing}
              onComposingChange={setCommentComposing}
              onChanged={() => {
                window.hangulApi.setDirty(s.dirty)
                refresh()
              }}
              onAskRedrob={(threadId, text) => {
                setPanelOpen(true)
                setAiPreset({ text: redrobCommentPrompt(threadId, text), nonce: Date.now() })
              }}
              onClose={() => setCommentsOpen(false)}
            />
          ) : undefined
        }
        railWidth={300}
        panel={
          <div className="hangul-panel-stack">
          {catchUp && <CatchUp since={catchUp.since} items={catchUp.items} onShow={showCatchUpItem} onDismiss={() => setCatchUp(null)} />}
          <HangulAiPanel
            preset={aiPreset}
            readOnly={mode === 'viewing'}
            onCollapse={() => setPanelOpen(false)}
            deps={{
              getSession: () => openedRef.current?.session ?? null,
              getView: () => viewRef.current,
              getTrack: () => (modeRef.current === 'suggesting' ? 'Redrob' : null),
              onRunDone: () => {
                const opened = openedRef.current
                if (opened) window.hangulApi.setDirty(opened.session.dirty)
                refresh()
              },
            }}
          />
          </div>
        }
        panelOpen={panelOpen}
        onPanelOpenChange={setPanelOpen}
        panelWidth={frame.panelWidth}
        onPanelWidthChange={frame.setPanelWidth}
        status={
          <StatusBar
            label={frameT(lang, 'status')}
            items={[
              mode === 'viewing' ? frameText.mode.viewing : mode === 'suggesting' ? frameText.mode.suggesting : frameText.mode.editing,
              ...(live.state.kind === 'live' ? [live.state.readOnly ? t('liveReadOnly') : t('liveOn')] : []),
              ...(revisionsRef.current && revisionsRef.current.list().length ? [t('reviewPending', { count: revisionsRef.current.list().length })] : []),
              `${s.doc.pageCount()} pp`,
              ...(s.layoutPending ? [t('nextPagesPending')] : []),
              ...(substituted ? [t('nextFontsSubstituted', { fonts: substituted })] : []),
              t('nextEngine', { version: coreVersion() }),
              t('nextAttribution'),
            ]}
            connection={{ online: frame.online, onlineLabel: frameT(lang, 'online'), offlineLabel: frameT(lang, 'offline') }}
          />
        }
      >
        {/* the document is Korean whatever the interface language */}
        <div ref={hostRef} className={markupHidden ? 'hangul-next-host hangul-hide-markup' : 'hangul-next-host'} style={{ ['--hangul-grid' as string]: `${gridPx}px` }} lang="ko" />
        <VersionHistory open={versionsOpen} onClose={() => setVersionsOpen(false)} path={pathRef.current || null} fileName={opened.fileName} api={window.hangulApi} />
        {window.hangulApi.shareStatus ? <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} path={pathRef.current || null} fileName={opened.fileName || t('untitled')} api={window.hangulApi as ShareApi} /> : null}
        {view && dialog === 'char-shape' ? <CharShapeDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && (dialog === 'find' || dialog === 'replace') ? <FindDialog view={view} replace={dialog === 'replace'} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {picture.input}
        {view && dialog && dialog.includes(':') ? <InsertPromptDialog view={view} kind={dialog as InsertKind} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'page-setup' ? <PageSetupDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'object-props' && view.session.object ? <ObjectPropertiesDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'hyperlink' ? <HyperlinkDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'click-here' ? <ClickHereDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'styles' ? <StyleDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'chart' ? <ChartDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'table-props' && view.bus.isEnabled('table:set-properties', { props: {} }) ? <TableCellDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'table-borders' && view.bus.isEnabled('table:set-properties', { props: {} }) ? <TableCellDialog view={view} initialTab="border" onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'page-hide' ? <PageHideDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {dialog === 'about' ? <AboutDialog engine={`rhwp ${String(info.version ?? '')}`.trim()} onClose={() => (setDialog(null), viewRef.current?.focus())} /> : null}
        {view && dialog === 'insert-rows-cols' ? <InsertRowsColsDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'delete-rows-cols' ? <DeleteRowsColsDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'columns' ? <ColumnSettingsDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'section' ? <SectionSettingsDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'page-border' ? <PageBorderDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'endnote-shape' ? <EndnoteShapeDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'hf-template' ? <HeaderFooterTemplateDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'numbering-shape' ? <NumberingShapeDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'bullet-shape' ? <BulletShapeDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'symbols' ? <SymbolsDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'field-edit' ? <FieldEditDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {dialog === 'grid' ? <GridSettingsDialog size={gridPx} onSize={setGridPx} onClose={() => (setDialog(null), viewRef.current?.focus())} /> : null}
        {view && dialog === 'para-shape' ? <ParaShapeDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
      </EditorFrame>
    </div>
  )
}

function PasswordForm({ phase, onSubmit }: { phase: Extract<Phase, { kind: 'password' }>; onSubmit: (pw: string) => void }): React.JSX.Element {
  const { t } = useI18n()
  const [pw, setPw] = useState('')
  return (
    <div className="hangul-notice-wrap">
      <form
        className="hangul-password"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(pw)
        }}
      >
        <Alert tone={phase.wrong ? 'danger' : 'info'} title={t('nextPasswordTitle')}>
          {phase.wrong ? t('nextPasswordWrong') : phase.fileName}
        </Alert>
        <Input type="password" label={t('nextPasswordLabel')} value={pw} autoFocus onChange={(e) => setPw(e.target.value)} />
        <Button type="submit" disabled={!pw}>
          {t('nextPasswordOpen')}
        </Button>
      </form>
    </div>
  )
}
