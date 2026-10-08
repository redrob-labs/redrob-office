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
import { CommandBus, Comments, EditorView } from '@genoffice/hwp-editor'
import {
  Alert,
  Badge,
  Button,
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
import type { SaveMode } from '../../shared/ipc'
import { CharShapeDialog, ParaShapeDialog } from './ShapeDialogs'
import { FindDialog, PageSetupDialog } from './FindPageDialogs'
import { InsertPromptDialog, usePicturePicker, type InsertKind } from './InsertDialogs'
import { HangulRibbon, HangulSimpleToolbar, commandLabel } from './HangulRibbon'
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
  const [mode, setMode] = useState<'editing' | 'viewing'>('editing')
  const [dialog, setDialog] = useState<'char-shape' | 'para-shape' | 'find' | 'replace' | 'page-setup' | InsertKind | null>(null)
  const [revision, refresh] = useReducer((n: number) => n + 1, 0)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentComposing, setCommentComposing] = useState(false)
  const [author, setAuthor] = useState('User')
  const [aiPreset, setAiPreset] = useState<AiPreset | null>(null)
  const commentsRef = useRef<Comments | null>(null)
  useEffect(() => {
    void window.hangulApi.authorName?.().then((n) => n && setAuthor(n)).catch(() => {})
  }, [])
  const openedRef = useRef<OpenedDocument | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const pathRef = useRef<string>('')
  const picture = usePicturePicker(() => viewRef.current, refresh)

  const doSave = useCallback(async (saveMode: SaveMode): Promise<boolean> => {
    const opened = openedRef.current
    if (!opened) return false
    setSaveState({ kind: 'saving' })
    try {
      const out = await saveDocument(opened, window.hangulApi, saveMode)
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

  // Mount the editor view once a document is open.
  useEffect(() => {
    const opened = openedRef.current
    const host = hostRef.current
    if (phase.kind !== 'ready' || !opened || !host || viewRef.current) return
    const bus = new CommandBus(opened.session)
    const view = new EditorView(host, opened.session, bus, {
      mac: isMac,
      onRender: refresh,
      onUnhandledCommand: (id) => {
        if (id === 'file:save') return void doSave('save'), true
        if (id === 'file:save-as') return void doSave('saveAs'), true
        if (id === 'format:char-shape') return setDialog('char-shape'), true
        if (id === 'format:para-shape') return setDialog('para-shape'), true
        if (id === 'edit:find') return setDialog('find'), true
        if (id === 'edit:find-replace') return setDialog('replace'), true
        if (id === 'file:page-setup' || id === 'page:setup') return setDialog('page-setup'), true
        return false
      },
    })
    viewRef.current = view
    commentsRef.current = new Comments(opened.session)
    // A document that arrives with memos opens with them showing, as in 한글.
    if (commentsRef.current.threads().length) setCommentsOpen(true)
    const offChange = opened.session.onChange(() => {
      window.hangulApi.setDirty(opened.session.dirty)
      setSaveState((s) => (s.kind === 'saved' ? { kind: 'idle' } : s))
      refresh()
    })
    const offSettle = opened.session.onSettle(refresh)
    view.focus()
    return () => {
      offChange()
      offSettle()
      view.dispose()
      viewRef.current = null
      commentsRef.current = null
    }
  }, [phase.kind, doSave])

  useEffect(() => {
    if (viewRef.current) viewRef.current.readOnly = mode === 'viewing'
  }, [mode])

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
  const ribbonProps = { view, mac: isMac, readOnly: mode === 'viewing', onRan: refresh, onCommand: (id: string) => {
      if (id === 'insert:image') return picture.open()
      const map: Record<string, NonNullable<typeof dialog>> = { 'format:char-shape': 'char-shape', 'format:para-shape': 'para-shape', 'edit:find': 'find', 'edit:find-replace': 'replace', 'page:setup': 'page-setup', 'insert:equation': 'insert:equation', 'insert:footnote': 'insert:footnote', 'insert:bookmark': 'insert:bookmark', 'page:header-create': 'page:header-create', 'page:footer-create': 'page:footer-create' }
      setDialog(map[id] ?? null)
    } }
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
        search={{
          tools: [
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
          onChange: (m) => setMode(m === 'viewing' ? 'viewing' : 'editing'),
          strings: frameText.mode,
          unavailable: ['suggesting'],
        }}
        toolbar={frame.toolbar}
        onToolbarChange={frame.setToolbar}
        toolbarStrings={frameText.toolbar}
        banner={
          opened.trackedChanges === true ? (
            <Alert tone="warning" title={t('nextTrackedTitle')} className="hangul-tracked-banner">
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
          <HangulAiPanel
            preset={aiPreset}
            readOnly={mode === 'viewing'}
            onCollapse={() => setPanelOpen(false)}
            deps={{
              getSession: () => openedRef.current?.session ?? null,
              getView: () => viewRef.current,
              onRunDone: () => {
                const opened = openedRef.current
                if (opened) window.hangulApi.setDirty(opened.session.dirty)
                refresh()
              },
            }}
          />
        }
        panelOpen={panelOpen}
        onPanelOpenChange={setPanelOpen}
        panelWidth={frame.panelWidth}
        onPanelWidthChange={frame.setPanelWidth}
        status={
          <StatusBar
            label={frameT(lang, 'status')}
            items={[
              mode === 'viewing' ? frameText.mode.viewing : frameText.mode.editing,
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
        <div ref={hostRef} className="hangul-next-host" lang="ko" />
        {view && dialog === 'char-shape' ? <CharShapeDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && (dialog === 'find' || dialog === 'replace') ? <FindDialog view={view} replace={dialog === 'replace'} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {picture.input}
        {view && dialog && dialog.includes(':') ? <InsertPromptDialog view={view} kind={dialog as InsertKind} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
        {view && dialog === 'page-setup' ? <PageSetupDialog view={view} onClose={() => (setDialog(null), view.focus())} onApplied={refresh} /> : null}
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
