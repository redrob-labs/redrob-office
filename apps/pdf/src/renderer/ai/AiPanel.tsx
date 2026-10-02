import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import { AgentLoop } from '@genoffice/agent-core'
import type { AiSettings } from '@genoffice/ai-provider'
import {
  AgentComposer,
  AgentEmpty,
  AgentFailure,
  AgentMessage,
  AgentPanelHeader,
  AgentSteps,
  AgentUndelivered,
  AgentWorking,
  Icon,
  Markdown,
  RedrobMark,
} from '@genoffice/ui'
import { aiLangDirective, t as tGlobal, useI18n } from '../i18n/locale'
import { createPdfSkill } from './pdf-skill'
import { createElectronTransport } from './transport'
import { PDF_NAV_SCHEME, parsePdfNavHref } from './pdf-nav'
import type { PdfAiDeps } from './tools'

// Word-parity count (same as docs/markdown): Asian chars one by one + non-Asian words
const ASIAN_RE =
  /[ᄀ-ᇿ⺀-⿟、-〿぀-ヿ㄀-ㄯ㄰-㆏㇀-ㇿ㐀-䶿一-鿿가-힯豈-﫿！-｠￠-￦]|[\uD840-\uD87F][\uDC00-\uDFFF]/g
const NON_ASIAN_WORD_RE = /[A-Za-z0-9À-ɏ]+(?:['-][A-Za-z0-9À-ɏ]+)*/g

function countWords(text: string): number {
  return (text.match(ASIAN_RE) ?? []).length + (text.match(NON_ASIAN_WORD_RE) ?? []).length
}

const PANEL_WIDTH_KEY = 'pdf-ai-panel-width'
const PANEL_WIDTH_DEFAULT = 360
const PANEL_WIDTH_MIN = 280

function clampPanelWidth(w: number): number {
  // The viewport can be transiently tiny (a WebContentsView is 0×0 until the
  // shell lays it out), so never let the ceiling drop below the minimum
  const max = Math.max(PANEL_WIDTH_MIN, Math.min(720, Math.round(window.innerWidth * 0.6)))
  return Math.min(Math.max(w, PANEL_WIDTH_MIN), max)
}

function loadPanelWidth(): number {
  const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY))
  // static bounds only — clamping against the window here would bake a
  // transiently small viewport into the restored preference
  return Number.isFinite(saved) && saved > 0
    ? Math.min(Math.max(saved, PANEL_WIDTH_MIN), 720)
    : PANEL_WIDTH_DEFAULT
}

interface ToolActivity {
  name: string
  summary: string
  isError?: boolean
  output?: string
}

interface ChatEntry {
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
  isError?: boolean
  /** the run failed and this user message was rolled back out of the model context */
  undelivered?: boolean
  tools?: ToolActivity[]
}

type Phase = 'thinking' | 'replying' | 'working'

export function AiPanel({
  api,
  filePath,
  onCollapse,
  preset,
  onRunDone,
  onClearSelection,
}: {
  api: PdfAiDeps
  /** Absolute path of the open PDF (chat history is keyed to it) */
  filePath?: string
  onCollapse: () => void
  /** Ribbon AI buttons push a one-shot prompt; a new nonce triggers an auto-run */
  preset?: { text: string; nonce: number } | null
  /** Fired when a run that mutated the document finishes (drives the untitled-blank auto-save) */
  onRunDone?: () => void
  /** The × on the scope chip: drop the cached selection so runs target the whole document */
  onClearSelection?: () => void
}): ReactElement {
  const { lang, t } = useI18n()
  const [chat, setChat] = useState<ChatEntry[]>([])
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<Phase>('thinking')
  /** the scope chip's expandable preview of the selected text */
  const [scopePreviewOpen, setScopePreviewOpen] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)

  // ── Chat-history persistence (r142): same shared store Docs/Sheets use ──
  const chatIdsRef = useRef<{ projectId: string; chatId: string } | null>(null)
  /** current turn's streamed text; completed turns collect into runTextsRef */
  const segTextRef = useRef('')
  /** whole-run accumulation: one stored assistant message per run (consecutive
      assistant rows would break restore() on strict-alternation providers) */
  const runTextsRef = useRef<string[]>([])
  const runToolsRef = useRef<ToolActivity[]>([])
  const chatStore = () =>
    (
      window as Window & {
        projectApi?: {
          resolveChat(args: {
            filePath: string | null
            tempChatId?: string
          }): Promise<{ projectId: string; chatId: string }>
          appendChat(args: {
            projectId: string
            chatId: string
            role: 'user' | 'assistant'
            text: string
            tools?: Array<{ name: string; summary: string; isError?: boolean; output?: string }>
          }): Promise<void>
          loadChat(args: { projectId: string; chatId: string; limit?: number }): Promise<
            Array<{
              role: 'user' | 'assistant'
              text: string
              tools?: Array<{ name: string; summary: string; isError?: boolean; output?: string }>
            }>
          >
          rebindChat(args: {
            projectId: string
            tempChatId: string
            newFilePath: string
          }): Promise<{ projectId: string; chatId: string } | null>
        }
      }
    ).projectApi
  const persistMessage = (
    role: 'user' | 'assistant',
    text: string,
    tools?: ToolActivity[],
  ): void => {
    const ids = chatIdsRef.current
    const store = chatStore()
    if (!ids || !store || (!text && !tools?.length)) return
    void store
      .appendChat({
        projectId: ids.projectId,
        chatId: ids.chatId,
        role,
        text,
        ...(tools && tools.length > 0
          ? {
              tools: tools.map((tool) => ({
                name: tool.name,
                summary: tool.summary,
                isError: tool.isError,
                output: tool.output,
              })),
            }
          : {}),
      })
      .catch(() => {
        /* silent */
      })
  }
  /** persist the whole run as ONE assistant message (docs parity: restore()
      feeds these back verbatim, and providers require user/assistant
      alternation; cancelled runs persist nothing — the unanswered user
      message is filtered out by restore()) */
  const persistRun = (): void => {
    const texts = [...runTextsRef.current, segTextRef.current].filter(Boolean)
    const tools = runToolsRef.current
    segTextRef.current = ''
    runTextsRef.current = []
    runToolsRef.current = []
    if (texts.length > 0 || tools.length > 0) {
      persistMessage('assistant', texts.join('\n\n'), tools)
    }
  }
  useEffect(() => {
    const store = chatStore()
    if (!store) return
    const tempChatId = `unsaved-${Date.now()}`
    void store
      .resolveChat({ filePath: filePath || null, tempChatId })
      .then((ids) => {
        chatIdsRef.current = ids
        return store.loadChat({ projectId: ids.projectId, chatId: ids.chatId, limit: 200 })
      })
      .then((msgs) => {
        if (msgs.length === 0) return
        setChat((prev) => [
          ...msgs.map((m) => ({
            role: m.role,
            text: m.text,
            tools: m.tools?.map((tool) => ({
              name: tool.name,
              summary: tool.summary,
              isError: tool.isError,
              output: tool.output,
            })),
          })),
          ...prev,
        ])
        // follow-ups after reopening continue the previous conversation
        loopRef.current?.restore(msgs.map((m) => ({ role: m.role, text: m.text })))
      })
      .catch(() => {
        /* history load failures are silent */
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only, like Docs
  }, [])
  /** blank/generated PDFs get a path on first save: bind the unsaved-* history to it */
  useEffect(() => {
    const ids = chatIdsRef.current
    const store = chatStore()
    if (!store || !ids || !filePath || !ids.chatId.startsWith('unsaved-')) return
    void store
      .rebindChat({ projectId: ids.projectId, tempChatId: ids.chatId, newFilePath: filePath })
      .then((rebound) => {
        if (rebound?.chatId) chatIdsRef.current = rebound
      })
      .catch(() => {
        /* silent */
      })
  }, [filePath])
  // preferred = the user's chosen width (the only value persisted); panelWidth =
  // what fits the current window. Deriving the display width from the preference
  // means a transiently small window never permanently shrinks the panel.
  const preferredWidthRef = useRef(loadPanelWidth())
  const [panelWidth, setPanelWidth] = useState(() => clampPanelWidth(preferredWidthRef.current))
  const [resizing, setResizing] = useState(false)
  const asideRef = useRef<HTMLElement>(null)

  // The .ai-dock wrapper owns the animated width (docs-style 180ms slide);
  // it tracks the resizable panel width through this variable
  useEffect(() => {
    const dock = asideRef.current?.closest('.ai-dock') as HTMLElement | null
    dock?.style.setProperty('--ai-panel-width', `${panelWidth}px`)
  }, [panelWidth])
  const settingsRef = useRef<AiSettings | null>(null)

  /** gsk login state for the cloud-tools gate (refreshed on mount and window focus) */
  const gskLoggedInRef = useRef(false)
  useEffect(() => {
    let alive = true
    const refresh = () => {
      void window.pdfApi
        ?.gskStatus()
        .then((s) => {
          if (alive) gskLoggedInRef.current = !!s?.loggedIn
        })
        .catch(() => {})
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => {
      alive = false
      window.removeEventListener('focus', refresh)
    }
  }, [])
  const langRef = useRef(lang)
  langRef.current = lang
  const apiRef = useRef(api)
  apiRef.current = api
  const onRunDoneRef = useRef(onRunDone)
  onRunDoneRef.current = onRunDone
  /** Any tool in the current run reported mutated: true */
  const runMutatedRef = useRef(false)

  const patchLast = (patch: Partial<ChatEntry> | ((last: ChatEntry) => Partial<ChatEntry>)) => {
    setChat((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (!last || last.role !== 'assistant') return prev
      next[next.length - 1] = { ...last, ...(typeof patch === 'function' ? patch(last) : patch) }
      return next
    })
  }

  // The loop is built once; every mutable value goes through a ref getter
  const loopRef = useRef<AgentLoop | null>(null)
  if (!loopRef.current) {
    const deps: PdfAiDeps = {
      doc: () => apiRef.current.doc(),
      fileName: () => apiRef.current.fileName(),
      pageCount: () => apiRef.current.pageCount(),
      currentPage: () => apiRef.current.currentPage(),
      readOnly: () => apiRef.current.readOnly(),
      ocrText: (idx) => apiRef.current.ocrText(idx),
      selection: () => apiRef.current.selection(),
      pendingSummary: () => apiRef.current.pendingSummary(),
      outline: () => apiRef.current.outline(),
      searchIndex: () => apiRef.current.searchIndex(),
      isDeleted: (i) => apiRef.current.isDeleted(i),
      gotoPage: (p) => apiRef.current.gotoPage(p),
      addMarkup: (type, idx, rects, color) => apiRef.current.addMarkup(type, idx, rects, color),
      annotationSummary: () => apiRef.current.annotationSummary(),
      createDocument: (request) => apiRef.current.createDocument(request),
      annotationsOn: (idx) => apiRef.current.annotationsOn(idx),
      addNote: (idx, at, contents) => apiRef.current.addNote(idx, at, contents),
      findNoteRoot: (idx, key) => apiRef.current.findNoteRoot(idx, key),
      replyToThread: (idx, root, contents) => apiRef.current.replyToThread(idx, root, contents),
      editText: (input) => apiRef.current.editText(input),
      insertText: (input) => apiRef.current.insertText(input),
      editFonts: () => apiRef.current.editFonts(),
      formEdits: () => apiRef.current.formEdits(),
      applyFormEdit: (v) => apiRef.current.applyFormEdit(v),
      rotatePage: (idx, dir) => apiRef.current.rotatePage(idx, dir),
      deletePage: (idx) => apiRef.current.deletePage(idx),
      pageGeom: (idx) => apiRef.current.pageGeom(idx),
      listImages: () => apiRef.current.listImages(),
      isImageClaimed: (ref) => apiRef.current.isImageClaimed(ref),
      insertImage: (idx, png, rect, layer) => apiRef.current.insertImage(idx, png, rect, layer),
      transformImage: (ref, rect, layer, quarterTurns) =>
        apiRef.current.transformImage(ref, rect, layer, quarterTurns),
      replaceImage: (ref, png) => apiRef.current.replaceImage(ref, png),
      deleteImage: (ref) => apiRef.current.deleteImage(ref),
      searchImages: (query, max) => apiRef.current.searchImages(query, max),
      generateImage: (op) => apiRef.current.generateImage(op),
      gskTools: () => gskLoggedInRef.current && settingsRef.current?.gskToolsEnabled !== false,
      fetchImage: (url) => apiRef.current.fetchImage(url),
    }
    loopRef.current = new AgentLoop({
      transport: createElectronTransport(() => settingsRef.current!),
      skill: createPdfSkill(deps),
      systemSuffix: () => aiLangDirective(langRef.current),
      events: {
        onText: (text) => {
          setPhase('replying')
          segTextRef.current = text
          patchLast({ text })
        },
        onToolExecuted: ({ call, execution }) => {
          setPhase('working')
          if (execution.mutated) runMutatedRef.current = true
          runToolsRef.current.push({
            name: call.name,
            summary: execution.summary,
            isError: execution.isError,
            output: execution.output?.slice(0, 2000),
          })
          patchLast((last) => ({
            tools: [
              ...(last.tools ?? []),
              {
                name: call.name,
                summary: execution.summary,
                isError: execution.isError,
                output: execution.output?.slice(0, 2000),
              },
            ],
          }))
        },
        onTurnEnd: () => {
          setPhase('thinking')
          runTextsRef.current.push(segTextRef.current)
          segTextRef.current = ''
          patchLast({ streaming: false })
          setChat((prev) => [...prev, { role: 'assistant', text: '', streaming: true }])
        },
        onDone: ({ text, cancelled, turnLimit, truncated }) => {
          const base = turnLimit
            ? [text, tGlobal('aiTurnLimit')].filter(Boolean).join('\n\n')
            : text || (cancelled ? tGlobal('aiStopped') : '')
          // finish_reason=length with no prose (a reasoning model that spent the whole
          // output budget thinking) must say so instead of showing the bare "(no reply)",
          // which reads like the assistant ignored the user — same handling as docs
          const final = truncated
            ? [base, tGlobal('aiTruncatedNote')].filter(Boolean).join('\n\n')
            : base
          if (cancelled) {
            segTextRef.current = ''
            runTextsRef.current = []
            runToolsRef.current = []
          } else {
            segTextRef.current = final || segTextRef.current
            persistRun()
          }
          patchLast((last) => ({
            streaming: false,
            text: final || (last.tools?.length ? last.text : tGlobal('aiNoReply')),
          }))
          setBusy(false)
          if (runMutatedRef.current) {
            runMutatedRef.current = false
            onRunDoneRef.current?.()
          }
        },
        onError: (error) => {
          setChat((prev) => {
            const next = [...prev]
            // the loop rolled this run's user message out of the model context — surface that
            for (let i = next.length - 1; i >= 0; i--) {
              const entry = next[i]!
              if (entry.role === 'user') {
                next[i] = { ...entry, undelivered: true }
                break
              }
            }
            const last = next.at(-1)
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, streaming: false, text: error, isError: true }
            }
            return next
          })
          setBusy(false)
        },
      },
    })
  }

  useEffect(() => {
    if (stickToBottomRef.current) {
      chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight })
    }
  }, [chat, busy])

  const onChatScroll = (): void => {
    const el = chatRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  const send = (text: string): void => {
    const instruction = text.trim()
    const loop = loopRef.current
    if (!instruction || !loop || loop.busy) return
    stickToBottomRef.current = true
    persistMessage('user', instruction)
    segTextRef.current = ''
    runTextsRef.current = []
    runToolsRef.current = []
    setChat((prev) => [
      ...prev,
      { role: 'user', text: instruction },
      { role: 'assistant', text: '', streaming: true },
    ])
    setPrompt('')
    setBusy(true)
    setPhase('thinking')
    runMutatedRef.current = false
    void (async () => {
      try {
        settingsRef.current = await window.pdfApi.getAiSettings()
        await loop.run(instruction)
      } catch (err) {
        patchLast({
          streaming: false,
          text: err instanceof Error ? err.message : String(err),
          isError: true,
        })
        setBusy(false)
      }
    })()
  }

  const stop = (): void => loopRef.current?.cancel()

  // One-click AI actions from the ribbon / Ask popover; while a run is active the
  // preset lands in the composer instead of being dropped silently (markdown parity)
  useEffect(() => {
    if (!preset) return
    if (loopRef.current?.busy) setPrompt(preset.text)
    else send(preset.text)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per nonce
  }, [preset?.nonce])

  // Re-derive the display width on window resize (max is 60% of the window);
  // growing the window back restores the preferred width
  useEffect(() => {
    const onResize = (): void => setPanelWidth(clampPanelWidth(preferredWidthRef.current))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const resizeCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => resizeCleanupRef.current?.(), [])

  /** Drag the right edge to resize: the panel is flush with the window's left edge, so width = clientX */
  const startResize = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const resizer = e.currentTarget
    setResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: PointerEvent): void => {
      const w = clampPanelWidth(ev.clientX)
      preferredWidthRef.current = w
      setPanelWidth(w)
    }
    let done = false
    const cleanup = (): void => {
      if (done) return
      done = true
      resizeCleanupRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointercancel', cleanup)
      resizer.removeEventListener('lostpointercapture', cleanup)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setResizing(false)
      localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(preferredWidthRef.current)))
    }
    resizeCleanupRef.current = cleanup
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
    // lostpointercapture also fires if the resizer is unmounted mid-drag (panel collapse)
    resizer.addEventListener('lostpointercapture', cleanup)
    resizer.setPointerCapture(e.pointerId)
  }

  const typingLabel =
    phase === 'replying' ? t('aiReplying') : phase === 'working' ? t('aiWorking') : t('aiThinking')

  // scope chip data, read per render (App re-renders on every selection change)
  const scopeSel = api.selection()
  const hasScopeSelection = !!scopeSel && scopeSel.text.trim().length > 0

  // the selection can vanish without the × (click-away, another file): close the preview too
  useEffect(() => {
    if (!hasScopeSelection) setScopePreviewOpen(false)
  }, [hasScopeSelection])

  /** [p.N](pdfnav://page/N) links in replies scroll the reading view to that page */
  const pdfNav = {
    scheme: PDF_NAV_SCHEME,
    onNavigate: (href: string) => {
      const page = parsePdfNavHref(href)
      if (page !== null) apiRef.current.gotoPage(page)
    },
  }

  const stepStrings = {
    worked: '',
    working: t('aiGroupWorking'),
    running: t('aiStepRunning'),
    done: t('aiStepDone'),
    failed: t('aiStepFailed'),
  }

  const quickPrompts = [
    {
      label: t('aiQuickSummary'),
      prompt: t(hasScopeSelection ? 'aiQuickSummarySelPrompt' : 'aiQuickSummaryPrompt'),
    },
    {
      label: t('aiQuickKeyPoints'),
      prompt: t(hasScopeSelection ? 'aiQuickKeyPointsSelPrompt' : 'aiQuickKeyPointsPrompt'),
    },
  ]

  return (
    <aside
      ref={asideRef}
      className={`copilot${resizing ? ' ai-panel-resizing' : ''}`}
      style={{ width: '100%' }}
    >
      <div
        className="ai-panel-resizer"
        onPointerDown={startResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="Redrob AI"
      />
      <AgentPanelHeader
        title="Redrob AI"
        actions={[
          chat.length > 0 && {
            label: t('aiNewChat'),
            icon: <Icon name="edit" size={16} />,
            onClick: () => {
              stop()
              loopRef.current?.reset()
              setBusy(false)
              setChat([])
            },
          },
          {
            label: t('aiCollapsePanel'),
            icon: <Icon name="sidebar" size={16} />,
            onClick: onCollapse,
          },
        ]}
      />

      <div className="ai-chat" ref={chatRef} onScroll={onChatScroll}>
        {chat.length === 0 && (
          <AgentEmpty
            title={t('aiEmptyTitle')}
            description={t('aiEmptyBody')}
            prompts={quickPrompts.map((q) => q.label)}
            promptsLabel={t('aiStartersLabel')}
            onPick={(label) => {
              const q = quickPrompts.find((p) => p.label === label)
              if (q) send(q.prompt)
            }}
          />
        )}
        {chat.map((entry, i) => {
          if (entry.role === 'user') {
            return (
              <AgentMessage key={i} role="user" author={t('aiYou')}>
                {entry.text}
                {entry.undelivered && (
                  <AgentUndelivered
                    message={t('aiUndelivered')}
                    retryLabel={t('aiRetry')}
                    onRetry={busy ? undefined : () => send(entry.text)}
                  />
                )}
              </AgentMessage>
            )
          }
          const hasTools = (entry.tools?.length ?? 0) > 0
          if (!entry.text && !hasTools) return null
          return (
            <AgentMessage
              key={i}
              role="assistant"
              author="Redrob AI"
              streaming={!!entry.streaming && !entry.isError && !!entry.text}
            >
              {hasTools && (
                <AgentSteps
                  steps={entry.tools!}
                  strings={{
                    ...stepStrings,
                    worked: t('aiWorkedSteps', { n: entry.tools!.length }),
                  }}
                />
              )}
              {entry.isError ? (
                // fail-closed: the engine's own message, never a silent retry elsewhere
                <AgentFailure title={t('aiFailedTitle')} message={entry.text} />
              ) : (
                entry.text && <Markdown text={entry.text} nav={pdfNav} />
              )}
            </AgentMessage>
          )
        })}
        {/* In-progress state: one row at the end of the stream, kept until done */}
        {busy && <AgentWorking label={typingLabel} />}
      </div>

      <div className="ai-composer">
        <AgentComposer
          value={prompt}
          busy={busy}
          context={
            hasScopeSelection && (
              <div className="ai-scope-row">
                <span className="ai-scope-hint">
                  <button
                    type="button"
                    className="ai-scope-label"
                    onClick={() => setScopePreviewOpen((v) => !v)}
                    aria-expanded={scopePreviewOpen}
                    data-tip={t('aiScopeSelectionTip')}
                  >
                    {t('aiScopeSelection', {
                      page:
                        scopeSel!.lastPage > scopeSel!.page
                          ? `${scopeSel!.page}-${scopeSel!.lastPage}`
                          : scopeSel!.page,
                      words: countWords(scopeSel!.text),
                    })}
                  </button>
                  <button
                    type="button"
                    className="ai-scope-clear"
                    onClick={() => {
                      setScopePreviewOpen(false)
                      onClearSelection?.()
                    }}
                    data-tip={t('aiScopeClearTitle')}
                    aria-label={t('aiScopeClearTitle')}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </span>
                {scopePreviewOpen && (
                  <div className="ai-scope-preview">
                    {scopeSel!.text.length > 400
                      ? `${scopeSel!.text.slice(0, 400)}…`
                      : scopeSel!.text}
                  </div>
                )}
              </div>
            )
          }
          placeholder={t('aiComposerPlaceholder')}
          label={t('aiComposerPlaceholder')}
          sendLabel={t('aiSend')}
          stopLabel={t('aiStop')}
          onChange={setPrompt}
          onSend={() => send(prompt)}
          onStop={stop}
        />
      </div>
    </aside>
  )
}

/** The AI-panel brand mark. Delegates to the one canonical Redrob mark in
 * @genoffice/ui (official gradient artwork); the export name is kept to avoid
 * churn across call sites. */
export function GensparkMark({ size = 18 }: { size?: number }): React.JSX.Element {
  return <RedrobMark size={size} />
}
