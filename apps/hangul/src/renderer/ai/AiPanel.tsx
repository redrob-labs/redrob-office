// Redrob for a Hangul document (spec task 3.5): the shared agent loop with the
// Hangul skill and web search, built from the Agent parts in @genoffice/ui, as
// in the other editors. Plan or Run, status, receipts and fail-closed errors
// are wired the same way as Markdown's and Docs' panels.
//
// Rollback: the loop asks for a snapshot before each tool until the run's
// first edit. A snapshot is an engine snapshot id; the one before the first
// edit becomes the run's rollback point and every other is discarded at once,
// because the engine keeps at most 100 (see HISTORY_LIMIT in hwp-editor).
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { AgentLoop, composeSkills, type AgentImage } from '@genoffice/agent-core'
import type { AiSettings } from '@genoffice/ai-provider'
import { Anchors, ROLLBACK_POINTS, collapsed, ordered, sameContainer, type EditorView, type Session } from '@genoffice/hwp-editor'
import {
  AgentComposer,
  AgentEmpty,
  AgentFailure,
  AgentMessage,
  AgentPanelHeader,
  AgentSteps,
  AgentUndelivered,
  AgentWorking,
  Alert,
  Button,
  Icon,
  IconButton,
  Markdown,
  PlanReply,
  RedrobModeSwitch,
  RedrobReceipt,
  RedrobStatus,
  parsePlan,
  planRequest,
  runPlanRequest,
  useRedrobPrefs,
  type PlanStatus,
  type RunReport,
} from '@genoffice/ui'
import { aiLangDirective, t as tGlobal, useI18n } from '../i18n/locale'
import { createHangulSkill } from './hangul-skill'
import { createSearchSkill } from './search-skill'
import { createMediaSkill } from './media-skill'
import { ATTACHMENT_IMAGE_EXTS, type AttachmentAddResult, type AttachmentMeta } from '../../shared/ipc'
import { createElectronTransport } from './transport'
import { DOC_NAV_SCHEME, navigateToNode, parseDocNavHref } from './doc-nav'
import { EditQueueCard } from './EditQueueCard'
import { EDIT_QUEUE_MAX, buildQueueInstruction, buildQueueSummary, decorate, liveItems, type EditQueueItem } from './edit-queue'

const TOOL_OUTPUT_MAX_CHARS = 2000

interface ToolActivity {
  name: string
  summary: string
  running?: boolean
  isError?: boolean
  mutated?: boolean
  output?: string
}

interface ChatEntry {
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
  isError?: boolean
  undelivered?: boolean
  tools?: ToolActivity[]
  plan?: { request: string; steps: string[]; status: PlanStatus }
  report?: RunReport
}

export interface RollbackPoint {
  label: string
  time: string
  snapshot: number
}

export interface HangulAiDeps {
  getSession(): Session | null
  getView(): EditorView | null
  /** fired when a run finishes; mutated = at least one tool changed the document */
  onRunDone(mutated: boolean): void
}

/** Selected text for the scope chip, or '' (cross-container selections have no single text). */
export function selectionText(s: Session | null): string {
  if (!s || collapsed(s.selection)) return ''
  const [a, b] = ordered(s.selection)
  return sameContainer(a, b) ? s.text.textBetween(a, b).trim() : ''
}

/** A request to run once (ribbon presets, @Redrob in a comment); a new nonce runs it again. */
export interface AiPreset {
  text: string
  nonce: number
}

export function HangulAiPanel({ deps, onCollapse, readOnly = false, preset = null }: { deps: HangulAiDeps; onCollapse: () => void; readOnly?: boolean; preset?: AiPreset | null }): ReactElement {
  const { lang, t } = useI18n()
  const redrob = useRedrobPrefs(window.hangulApi)
  const planRunRef = useRef<string | null>(null)
  const planStepsRef = useRef(0)
  const [chat, setChat] = useState<ChatEntry[]>([])
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [points, setPoints] = useState<RollbackPoint[]>([])
  const [rollbackError, setRollbackError] = useState<string | null>(null)
  const [scopePreviewOpen, setScopePreviewOpen] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const stickToBottomRef = useRef(true)
  const mountedRef = useRef(true)
  const settingsRef = useRef<AiSettings | null>(null)
  const langRef = useRef(lang)
  langRef.current = lang
  const depsRef = useRef(deps)
  depsRef.current = deps
  const runInstructionRef = useRef('')
  const runDisplayRef = useRef('')
  const runMutatedRef = useRef(false)
  const runToolsRef = useRef<ToolActivity[]>([])
  /** snapshot taken before the tool now running, not yet known to be the rollback point */
  const pendingSnapRef = useRef<number | null>(null)
  const pointsRef = useRef<RollbackPoint[]>([])
  pointsRef.current = points
  /** chat attachments: listed in the context for the whole conversation, images sent once */
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([])
  const attachmentsRef = useRef<AttachmentMeta[]>([])
  attachmentsRef.current = attachments
  const sentImagesRef = useRef(new Set<string>())
  const [attachNotice, setAttachNotice] = useState<string | null>(null)
  /** queued selection edits; each qid is an anchor that follows the document */
  const [queue, setQueue] = useState<EditQueueItem[]>([])
  const [, bumpAnchors] = useState(0)
  const anchorsRef = useRef<{ session: Session; anchors: Anchors } | null>(null)
  const anchorsFor = (s: Session): Anchors => {
    if (anchorsRef.current?.session !== s) {
      anchorsRef.current?.anchors.dispose()
      anchorsRef.current = { session: s, anchors: new Anchors(s) }
    }
    return anchorsRef.current.anchors
  }
  const decoKeysRef = useRef(new Set<string>())

  const discard = (id: number | null) => {
    const s = depsRef.current.getSession()
    if (id !== null && s) s.doc.discardSnapshot(id)
  }
  const dropPending = () => {
    discard(pendingSnapRef.current)
    pendingSnapRef.current = null
  }

  const patchLast = (patch: Partial<ChatEntry> | ((last: ChatEntry) => Partial<ChatEntry>)) => {
    setChat((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (!last || last.role !== 'assistant') return prev
      next[next.length - 1] = { ...last, ...(typeof patch === 'function' ? patch(last) : patch) }
      return next
    })
  }

  const loopRef = useRef<AgentLoop<number> | null>(null)
  if (!loopRef.current) {
    loopRef.current = new AgentLoop<number>({
      transport: createElectronTransport(() => settingsRef.current!),
      skill: composeSkills('hangul+search+media', '', [
        createHangulSkill({ getSession: () => depsRef.current.getSession(), getBus: () => depsRef.current.getView()?.bus ?? null }),
        createSearchSkill(),
        createMediaSkill({ getSession: () => depsRef.current.getSession(), api: window.hangulApi, getAttachments: () => attachmentsRef.current }),
      ]),
      captureSnapshot: () => {
        dropPending()
        const s = depsRef.current.getSession()
        // -1 = no document; never restored
        if (!s) return -1
        s.settle()
        pendingSnapRef.current = s.doc.saveSnapshot()
        return pendingSnapRef.current
      },
      systemSuffix: () => aiLangDirective(langRef.current),
      events: {
        onText: (text) => patchLast({ text }),
        onToolStart: (call) => {
          patchLast((last) => ({ tools: [...(last.tools ?? []), { name: call.name, summary: call.name.replace(/[_-]+/g, ' '), running: true }] }))
        },
        onToolExecuted: ({ call, execution, snapshotBefore }) => {
          if (execution.mutated) runMutatedRef.current = true
          if (snapshotBefore !== undefined && snapshotBefore >= 0 && snapshotBefore === pendingSnapRef.current) {
            pendingSnapRef.current = null
            const label = runDisplayRef.current.slice(0, 40)
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            const next = [...pointsRef.current, { label, time, snapshot: snapshotBefore }]
            for (const old of next.splice(0, Math.max(0, next.length - ROLLBACK_POINTS))) discard(old.snapshot)
            setPoints(next)
          } else dropPending()
          // AI edits change the document under the caret; redraw it.
          depsRef.current.getView()?.render()
          const activity: ToolActivity = { name: call.name, summary: execution.summary, isError: execution.isError, mutated: !!execution.mutated, output: execution.output?.slice(0, TOOL_OUTPUT_MAX_CHARS) }
          runToolsRef.current.push(activity)
          patchLast((last) => {
            const tools = [...(last.tools ?? [])]
            if (tools.at(-1)?.running) tools.pop()
            return { tools: [...tools, activity] }
          })
        },
        onTurnEnd: () => {
          patchLast({ streaming: false })
          setChat((prev) => [...prev, { role: 'assistant', text: '', streaming: true }])
        },
        onDone: ({ text, cancelled, turnLimit, truncated }) => {
          dropPending()
          const base = turnLimit ? [text, tGlobal('aiTurnLimit')].filter(Boolean).join('\n\n') : text || (cancelled ? tGlobal('aiStopped') : '')
          const final = truncated ? [base, tGlobal('aiTruncatedNote')].filter(Boolean).join('\n\n') : base
          const planOf = planRunRef.current
          planRunRef.current = null
          const planSteps = planStepsRef.current
          planStepsRef.current = 0
          const changes = runToolsRef.current.filter((x) => !x.isError && x.mutated).length
          const s = settingsRef.current
          const model = s ? s.providers[s.provider]?.model?.trim() : undefined
          patchLast((last) =>
            planOf && !cancelled
              ? { streaming: false, text: '', tools: undefined, plan: { request: planOf, steps: parsePlan(final), status: 'draft' } }
              : {
                  streaming: false,
                  text: final || (last.tools?.length ? last.text : tGlobal('aiNoReply')),
                  tools: last.tools?.filter((x) => !x.running),
                  report: cancelled ? undefined : { model: model || 'Redrob Auto', chosenBy: model ? 'you' : 'auto', ...(planSteps > 0 ? { planSteps } : {}), ...(changes > 0 ? { changes } : {}) },
                },
          )
          depsRef.current.onRunDone(runMutatedRef.current)
          setBusy(false)
        },
        onError: (error) => {
          dropPending()
          // Fail closed: the engine's own message, the user turn marked undelivered, no silent fallback.
          setChat((prev) => {
            const next = [...prev]
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i]!.role === 'user') {
                next[i] = { ...next[i]!, undelivered: true }
                break
              }
            }
            const last = next.at(-1)
            if (last?.role === 'assistant') next[next.length - 1] = { ...last, streaming: false, text: error, isError: true, tools: last.tools?.filter((x) => !x.running) }
            return next
          })
          depsRef.current.onRunDone(runMutatedRef.current)
          setBusy(false)
        },
      },
    })
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      loopRef.current?.cancel()
      dropPending()
      for (const p of pointsRef.current) discard(p.snapshot)
      anchorsRef.current?.anchors.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (stickToBottomRef.current) chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight })
  }, [chat, busy])

  const send = (text: string, displayText?: string, opts?: { planOf?: string; planSteps?: number }): void => {
    const instruction = text.trim()
    const loop = loopRef.current
    if (!instruction || !loop || loop.busy) return
    planRunRef.current = opts?.planOf ?? null
    planStepsRef.current = opts?.planSteps ?? 0
    stickToBottomRef.current = true
    runInstructionRef.current = instruction
    runDisplayRef.current = displayText ?? instruction
    runMutatedRef.current = false
    runToolsRef.current = []
    setRollbackError(null)
    setChat((prev) => [...prev, { role: 'user', text: displayText ?? instruction }, { role: 'assistant', text: '', streaming: true }])
    setPrompt('')
    setBusy(true)
    void (async () => {
      try {
        settingsRef.current = await window.hangulApi.getAiSettings()
        const images = await collectImages()
        if (!mountedRef.current) return
        // A Plan run, and any run in viewing mode, is read-only: no tools are offered.
        await loop.run(instruction, images.length ? images : undefined, { readOnly: !!opts?.planOf || readOnly })
      } catch (err) {
        if (!mountedRef.current) return
        patchLast({ streaming: false, text: err instanceof Error ? err.message : String(err), isError: true })
        setBusy(false)
      }
    })()
  }

  /** Image attachments go multimodal once, with the first message after they were attached. */
  const collectImages = async (): Promise<AgentImage[]> => {
    const images: AgentImage[] = []
    const failures: string[] = []
    for (const a of attachmentsRef.current) {
      if (!ATTACHMENT_IMAGE_EXTS.has(a.ext) || sentImagesRef.current.has(a.path)) continue
      sentImagesRef.current.add(a.path)
      const r = await window.hangulApi.readAttachmentImage(a.path)
      if (r.ok) images.push({ base64: r.base64, mime: r.mime })
      else failures.push(t('aiImageReadFail', { name: a.name }))
    }
    if (failures.length) setAttachNotice(failures.join('; '))
    return images
  }

  const mergeAttachments = (result: AttachmentAddResult | null): void => {
    if (!result) return
    if (result.accepted.length) {
      setAttachments((prev) => {
        const seen = new Set(prev.map((a) => a.path))
        return [...prev, ...result.accepted.filter((a) => !seen.has(a.path))]
      })
    }
    setAttachNotice(result.rejected.length ? result.rejected.join('; ') : null)
  }

  const sendPrompt = (): void => {
    const text = prompt.trim()
    if (!text) return
    if (redrob.mode === 'plan') send(planRequest(text), text, { planOf: text })
    else send(text)
  }
  const runPlan = (idx: number, request: string, steps: string[]): void => {
    setChat((prev) => prev.map((e, i) => (i === idx && e.plan ? { ...e, plan: { ...e.plan, steps, status: 'running' } } : e)))
    send(runPlanRequest(request, steps), request, { planSteps: steps.length })
  }
  const keepPlan = (idx: number): void => setChat((prev) => prev.map((e, i) => (i === idx && e.plan ? { ...e, plan: { ...e.plan, status: 'kept' } } : e)))
  const stop = (): void => loopRef.current?.cancel()

  // A preset runs once; while a run is active it lands in the composer instead.
  const presetNonceRef = useRef(0)
  useEffect(() => {
    if (!preset || preset.nonce === presetNonceRef.current) return
    presetNonceRef.current = preset.nonce
    if (loopRef.current?.busy) setPrompt(preset.text)
    else send(preset.text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset])
  const retry = (): void => send(runInstructionRef.current, runDisplayRef.current)

  const rollback = (point: RollbackPoint): void => {
    const s = depsRef.current.getSession()
    if (busy || !s) return
    try {
      s.restore(point.snapshot)
      discard(point.snapshot)
      setPoints((prev) => prev.filter((p) => p !== point))
      depsRef.current.getView()?.render()
      depsRef.current.onRunDone(true)
    } catch (e) {
      setRollbackError(e instanceof Error ? e.message : String(e))
    }
  }

  const copyMessage = (text: string, idx: number): void => {
    void navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    window.setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1200)
  }

  const docNav = {
    scheme: DOC_NAV_SCHEME,
    onNavigate: (href: string) => {
      const id = parseDocNavHref(href)
      const view = depsRef.current.getView()
      if (id !== null && view) navigateToNode(view, id)
    },
  }

  const session = deps.getSession()
  const scopeText = selectionText(session)
  const clearScope = (): void => {
    if (!session) return
    const head = session.selection.head
    session.select({ anchor: head, head })
    deps.getView()?.render()
  }

  // Highlight queued passages and keep the card fresh as anchors move.
  const liveSession = deps.getSession()
  useEffect(() => {
    if (!liveSession) return
    const anchors = anchorsFor(liveSession)
    const paint = () => {
      const view = depsRef.current.getView()
      if (!view) return
      decoKeysRef.current = decorate(liveSession, anchors, queue, (key, rects) => (rects ? view.overlay.setDecoration({ key, kind: 'ai-pending', rects }) : view.overlay.clearDecoration(key)), decoKeysRef.current)
    }
    paint()
    const offAnchors = anchors.onUpdate(() => {
      paint()
      bumpAnchors((n) => n + 1)
    })
    const offSettle = liveSession.onSettle(paint)
    return () => {
      offAnchors()
      offSettle()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSession, queue])

  const queueAdd = (): void => {
    const s = depsRef.current.getSession()
    const instruction = prompt.trim()
    if (!s || !instruction) return
    if (queue.length >= EDIT_QUEUE_MAX) return setAttachNotice(t('aiQueueFull', { max: EDIT_QUEUE_MAX }))
    const qid = anchorsFor(s).add(s.selection)
    if (!qid) return
    setQueue((q) => [...q, { qid, instruction, capturedText: selectionText(s) }])
    setPrompt('')
  }
  const queueRemove = (qid: string): void => {
    const s = depsRef.current.getSession()
    if (s) anchorsFor(s).remove(qid)
    setQueue((q) => q.filter((i) => i.qid !== qid))
  }
  const queueClear = (): void => {
    const s = depsRef.current.getSession()
    if (s) for (const i of queue) anchorsFor(s).remove(i.qid)
    setQueue([])
  }
  const queueFocus = (qid: string): void => {
    const s = depsRef.current.getSession()
    const view = depsRef.current.getView()
    const r = s ? anchorsFor(s).range(qid) : null
    if (!s || !view || !r) return
    s.select(r)
    view.render()
    view.focus()
  }
  const sendQueue = (): void => {
    const s = depsRef.current.getSession()
    if (!s || busy) return
    const entries = liveItems(anchorsFor(s), queue)
    if (!entries.length) return queueClear()
    // Consumed at send: a failed run is retried from the transcript.
    queueClear()
    send(buildQueueInstruction(entries), buildQueueSummary(t('aiQueueSubmitted', { count: entries.length }), entries))
  }

  const stepStrings = (n: number) => ({ worked: t('aiWorkedSteps', { n }), working: t('aiGroupWorking'), running: t('aiStepRunning'), done: t('aiStepDone'), failed: t('aiStepFailed') })
  const starters = [
    { label: t('aiQuickSummary'), prompt: t('aiQuickSummaryPrompt') },
    { label: t('aiQuickPolish'), prompt: t('aiQuickPolishPrompt') },
    { label: t('aiQuickTable'), prompt: t('aiQuickTablePrompt') },
  ]

  return (
    <aside className="copilot hangul-ai" style={{ width: '100%' }} aria-label={t('panelTitle')}>
      <AgentPanelHeader
        title={t('panelTitle')}
        actions={[
          chat.length > 0 && {
            label: t('aiNewChat'),
            icon: <Icon name="edit" size={16} />,
            onClick: () => {
              stop()
              loopRef.current?.reset()
              setBusy(false)
              setChat([])
              setAttachments([])
              sentImagesRef.current.clear()
            },
          },
          { label: t('aiCollapsePanel'), icon: <Icon name="sidebar" size={16} />, onClick: onCollapse },
        ]}
      />
      <div
        className="ai-chat"
        ref={chatRef}
        onScroll={() => {
          const el = chatRef.current
          if (el) stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
        }}
      >
        {chat.length === 0 && (
          <AgentEmpty
            title={t('aiEmptyTitle')}
            description={t('aiEmptyBody')}
            prompts={starters.map((s) => s.label)}
            promptsLabel={t('aiStartersLabel')}
            onPick={(label) => {
              const s = starters.find((x) => x.label === label)
              if (!s) return
              setPrompt(s.prompt)
              inputRef.current?.focus()
            }}
          />
        )}
        {chat.map((entry, i) => {
          if (entry.role === 'user') {
            return (
              <AgentMessage key={i} role="user" author={t('aiYou')}>
                {entry.text}
                {entry.undelivered && <AgentUndelivered message={t('aiUndelivered')} retryLabel={t('aiRetry')} onRetry={busy ? undefined : () => send(entry.text)} />}
              </AgentMessage>
            )
          }
          const hasTools = (entry.tools?.length ?? 0) > 0
          if (!entry.text && !entry.streaming && !hasTools && !entry.plan) return null
          const isLast = i === chat.length - 1
          const nextEntry = chat[i + 1]
          const turnEnded = nextEntry ? nextEntry.role === 'user' : !busy
          const showToolbar = !entry.streaming && turnEnded && !!entry.text && !entry.isError
          return (
            <AgentMessage
              key={i}
              role="assistant"
              author="Redrob AI"
              streaming={!!entry.streaming && !!entry.text && !entry.isError}
              footer={
                showToolbar ? (
                  <div className="ai-msg-toolbar">
                    <IconButton size="sm" label={t('aiCopyReplyTitle')} onClick={() => copyMessage(entry.text, i)}>
                      <Icon name={copiedIdx === i ? 'check' : 'copy'} size={14} />
                    </IconButton>
                    {isLast && !busy && runInstructionRef.current && (
                      <IconButton size="sm" label={t('aiRegenerateTitle')} onClick={retry}>
                        <Icon name="refresh" size={14} />
                      </IconButton>
                    )}
                  </div>
                ) : undefined
              }
            >
              {!entry.text && entry.streaming ? (
                <AgentWorking label={hasTools ? t('aiWorking') : t('aiThinking')} />
              ) : entry.isError ? (
                <AgentFailure title={t('aiFailedTitle')} message={entry.text} />
              ) : (
                entry.text && <Markdown text={entry.text} nav={docNav} />
              )}
              {hasTools && <AgentSteps steps={entry.tools!} strings={stepStrings(entry.tools!.length)} />}
              {entry.plan && <PlanReply lang={lang} request={entry.plan.request} steps={entry.plan.steps} status={entry.plan.status} onRun={(steps) => runPlan(i, entry.plan!.request, steps)} onKeep={() => keepPlan(i)} />}
              {entry.report && !entry.isError && !entry.streaming && turnEnded && <RedrobReceipt lang={lang} report={entry.report} />}
            </AgentMessage>
          )
        })}
      </div>

      {points.length > 0 && (
        <section className="ai-versions" aria-label={t('aiSnapshotsTitle')}>
          <div className="ai-versions-title">
            <Icon name="history" size={14} />
            {t('aiSnapshotsTitle')}
          </div>
          {rollbackError && <Alert tone="danger">{t('aiRollbackFailed', { error: rollbackError })}</Alert>}
          {points.map((p) => (
            <div key={p.snapshot} className="ai-version-row">
              <span className="ai-version-label" data-tip={p.label}>
                <span className="ai-version-time">{p.time}</span>
                {p.label}
              </span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => rollback(p)}>
                {t('aiRollback')}
              </Button>
            </div>
          ))}
        </section>
      )}

      <div className="ai-composer">
        {liveSession && queue.length > 0 && (
          <EditQueueCard
            items={queue}
            anchors={anchorsFor(liveSession)}
            busy={busy}
            onEditInstruction={(qid, instruction) => setQueue((q) => q.map((i) => (i.qid === qid ? { ...i, instruction } : i)))}
            onRemove={queueRemove}
            onDiscardAll={queueClear}
            onSend={sendQueue}
            onFocus={queueFocus}
          />
        )}
        <AgentComposer
          value={prompt}
          busy={busy}
          leading={
            <>
              <IconButton size="sm" label={t('aiAttachTitle')} disabled={busy} onClick={() => void window.hangulApi.pickAttachments().then(mergeAttachments)}>
                <Icon name="attachment" size={16} />
              </IconButton>
              {scopeText && (
                <IconButton size="sm" label={t('aiQueueAdd')} disabled={busy || !prompt.trim()} onClick={queueAdd}>
                  <Icon name="plus" size={16} />
                </IconButton>
              )}
            </>
          }
          context={
            (scopeText || attachments.length > 0 || attachNotice) && (
              <>
              {attachments.length > 0 && (
                <ul className="hangul-ai-attachments" aria-label={t('aiAttachmentsLabel')}>
                  {attachments.map((a) => (
                    <li key={a.path} className="hangul-ai-attachment" data-tip={a.path}>
                      <span className="hangul-ai-attachment__ext">{a.ext.toUpperCase()}</span>
                      <span className="hangul-ai-attachment__name">{a.name}</span>
                      <button type="button" className="hangul-ai-attachment__remove" aria-label={t('aiRemoveAttachment', { name: a.name })} onClick={() => setAttachments((prev) => prev.filter((x) => x.path !== a.path))}>
                        <Icon name="close" size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {attachNotice && <div className="hangul-ai-attach-notice" role="status">{attachNotice}</div>}
              {scopeText && (
              <div className="ai-scope-row">
                <span className="ai-scope-hint">
                  <button type="button" className="ai-scope-label" onClick={() => setScopePreviewOpen((v) => !v)} aria-expanded={scopePreviewOpen} data-tip={t('aiScopeSelectionTip')}>
                    {t('aiScopeSelection', { chars: [...scopeText].length })}
                  </button>
                  <button type="button" className="ai-scope-clear" onClick={clearScope} data-tip={t('aiScopeClearTitle')} aria-label={t('aiScopeClearTitle')}>
                    <Icon name="close" size={12} />
                  </button>
                </span>
                {scopePreviewOpen && <div className="ai-scope-preview">{scopeText.length > 400 ? `${scopeText.slice(0, 400)}…` : scopeText}</div>}
              </div>
              )}
              </>
            )
          }
          placeholder={t('aiComposerPlaceholder')}
          label={t('aiComposerPlaceholder')}
          sendLabel={t('aiSend')}
          stopLabel={t('aiStop')}
          textareaRef={inputRef}
          onChange={setPrompt}
          onSend={sendPrompt}
          onStop={stop}
          tools={<RedrobModeSwitch lang={lang} value={redrob.mode} onChange={redrob.setMode} />}
          status={<RedrobStatus lang={lang} memory={redrob.memory} factCheck={redrob.factCheck} challenge={redrob.challenge} />}
        />
      </div>
    </aside>
  )
}
