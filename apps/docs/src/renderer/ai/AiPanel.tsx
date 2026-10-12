import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { Block } from '@genoffice/docx-engine'
import { AgentLoop, composeSkills, type AgentImage } from '@genoffice/agent-core'
import type { AiSettings, AttachmentAddResult, AttachmentMeta } from '../../shared/ipc'
import { ATTACHMENT_IMAGE_EXTS } from '../../shared/ipc'
import type { PmNode } from '../editor/convert'
import { countWords, findNumId, type NumIds } from './protocol'
import { DOC_NAV_SCHEME, navigateToBlock, parseDocNavHref } from './doc-nav'
import { markDocSeen, type AiCommentsAccess, type AiHeaderFooterAccess } from './tools'
import { createDocsSkill } from './docs-skill'
import { EditQueueCard } from './EditQueueCard'
import {
  buildQueueInstruction,
  buildQueueSummary,
  liveItems,
  resolveQueue,
  type DocsEditQueueItem,
} from './edit-queue'
import { applyRevisionsBy } from '../editor/revisions'
import { DOCS_CONTINUE_INSTRUCTION } from './continuation'
import { createFilesSkill } from './files-skill'
import { createElectronTransport, insightsSink } from './transport'
import { useI18n, t as tModule, aiLangDirective, type StringKey } from '../i18n/locale'
import {
  AgentComposer,
  AgentEmpty,
  AgentFailure,
  AgentMessage,
  AgentPanelHeader,
  AgentSteps,
  AgentWorking,
  Alert,
  Button,
  Icon,
  IconButton,
  Markdown,
  RedrobMark,
  PlanReply,
  RedrobModeSwitch,
  RedrobReceipt,
  RedrobStatus,
  parsePlan,
  planRequest,
  runPlanRequest,
  useRedrobPrefs,
  type AgentStepsStrings,
  type PlanStatus,
  type RunReport,
} from '@genoffice/ui'
import filePdfIcon from '../assets/file-pdf.png'
import fileWordIcon from '../assets/file-word.png'
import fileExcelIcon from '../assets/file-excel.png'
import filePptIcon from '../assets/file-ppt.png'
import fileImageIcon from '../assets/file-image.png'
import fileVideoIcon from '../assets/file-video.png'
import fileVoiceIcon from '../assets/file-voice.png'
import fileDocumentIcon from '../assets/file-document.png'
import fileGeneralIcon from '../assets/file-general.png'

interface ToolActivity {
  name: string
  summary: string
  /** still executing: rendered as a spinner chip, replaced in place when the tool finishes */
  running?: boolean
  isError?: boolean
  /** Tool output (truncated on the UI side); when set, the row can be expanded for details */
  output?: string
}

/** Max characters of tool output in the UI expansion panel */
const TOOL_OUTPUT_MAX_CHARS = 2000

/** Cap on tool args/output persisted in the transcript (the store layer has another 16k truncation fallback) */
const PERSIST_TOOL_FIELD_MAX = 16_000

/** Tool args → JSON string (truncated; returns undefined on serialization failure, doesn't block persistence) */
function safeJsonInput(input: unknown): string | undefined {
  try {
    const s = JSON.stringify(input)
    return s && s !== '{}' ? s.slice(0, PERSIST_TOOL_FIELD_MAX) : undefined
  } catch {
    return undefined
  }
}

interface ChatEntry {
  role: 'user' | 'assistant'
  text: string
  error?: string
  streaming?: boolean
  turnLimit?: boolean
  /** the run failed because Genspark is signed out — render an inline sign-in button */
  loginRequired?: boolean
  /** tool executions performed during this assistant turn */
  tools?: ToolActivity[]
  /** document state before this turn's first edit — rendered as an inline roll-back action */
  snapshot?: PmNode
  /** attachments consumed from the composer by this user message (read-only echo chips) */
  attachments?: AttachmentMeta[]
  /** Plan mode: the plan this read-only run wrote, shown as a document outside the bubble */
  plan?: { request: string; steps: string[]; status: PlanStatus }
  /** what the run reported, shown as one receipt under the answer */
  report?: RunReport
}

/** clickable starter prompts for the empty state (fill the input, do not send) —
 * blank documents get generation starters, documents with content get edit starters */
const DRAFT_STARTER_PROMPTS: StringKey[] = [
  'aiStarterWeeklyReport',
  'aiStarterLaunchPost',
  'aiStarterEventOutline',
]
const EDIT_STARTER_PROMPTS: StringKey[] = [
  'aiStarterSummarize',
  'aiStarterPolishAll',
  'aiStarterContinue',
  'aiStarterFillTemplate',
]

/** resizable panel width: persisted, clamped so neither pane collapses */
const PANEL_WIDTH_KEY = 'docs-ai-panel-width'
const PANEL_WIDTH_DEFAULT = 360
const PANEL_WIDTH_MIN = 280

function maxPanelWidth(): number {
  // The viewport can be transiently tiny (a WebContentsView is 0×0 until the
  // shell lays it out), so never let the ceiling drop below the minimum
  return Math.max(PANEL_WIDTH_MIN, Math.min(720, Math.round(window.innerWidth * 0.6)))
}

function clampPanelWidth(w: number): number {
  return Math.min(Math.max(w, PANEL_WIDTH_MIN), maxPanelWidth())
}

function loadPanelWidth(): number {
  const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY))
  // static bounds only — clamping against the window here would bake a
  // transiently small viewport into the restored preference
  return Number.isFinite(saved) && saved > 0
    ? Math.min(Math.max(saved, PANEL_WIDTH_MIN), 720)
    : PANEL_WIDTH_DEFAULT
}

/** persisted UI preference: highlight AI edits in yellow and ask for confirmation */
const TRACK_CHANGES_KEY = 'ai-docs-track-changes'

/** Clipboard bitmap MIME → attachment extension (corresponds to ATTACHMENT_IMAGE_EXTS) */
const PASTE_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

/** File-type icons for attachment cards (Genspark attachment icon set); exts the
 *  attachment allowlist doesn't accept yet are mapped ahead so they light up when added */
const ATTACHMENT_CARD_ICON_GROUPS: [icon: string, exts: string[]][] = [
  [fileWordIcon, ['doc', 'docx']],
  [fileExcelIcon, ['xls', 'xlsx', 'xlsm', 'csv', 'tsv']],
  [filePptIcon, ['ppt', 'pptx']],
  [filePdfIcon, ['pdf']],
  [fileImageIcon, ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'heic']],
  [fileVideoIcon, ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v']],
  [fileVoiceIcon, ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus']],
  [
    fileDocumentIcon,
    [
      'txt',
      'md',
      'markdown',
      'rtf',
      'log',
      'json',
      'yaml',
      'yml',
      'xml',
      'html',
      'htm',
      'js',
      'ts',
      'tsx',
      'jsx',
      'py',
      'java',
      'c',
      'h',
      'cpp',
      'go',
      'rs',
      'rb',
      'sh',
      'sql',
      'css',
    ],
  ],
]

const ATTACHMENT_CARD_ICONS: Record<string, string> = Object.fromEntries(
  ATTACHMENT_CARD_ICON_GROUPS.flatMap(([icon, exts]) => exts.map((ext) => [ext, icon])),
)

function AttachmentCardIcon({ ext }: { ext: string }) {
  return <img src={ATTACHMENT_CARD_ICONS[ext] ?? fileGeneralIcon} alt="" aria-hidden />
}

/** Card name slot width: 190 card - 2 border - 8/14 padding - 40 icon - 10 gap */
const CARD_NAME_MAX_WIDTH = 116
let cardNameCtx: CanvasRenderingContext2D | null = null

/** Ellipsize like the design: cut at the limit, strip trailing -_./spaces so
 *  punctuation never sits against the …; CSS text-overflow stays as fallback */
function truncateCardName(name: string): string {
  cardNameCtx ??= document.createElement('canvas').getContext('2d')
  if (!cardNameCtx) return name
  // must match the stack the card name actually renders with (body font in styles.css)
  cardNameCtx.font =
    "500 13px 'Segoe UI', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif"
  if (cardNameCtx.measureText(name).width <= CARD_NAME_MAX_WIDTH) return name
  let lo = 1
  let hi = name.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (cardNameCtx.measureText(`${name.slice(0, mid)}…`).width <= CARD_NAME_MAX_WIDTH) lo = mid
    else hi = mid - 1
  }
  return `${name.slice(0, lo).replace(/[-_.\s]+$/, '')}…`
}

function formatAttachmentSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(2)} KB`
}

/** Read-only echo of the attachments a user message consumed from the composer
 *  (image previews when the file is still readable; otherwise the placeholder icon) */
function SentAttachments({
  atts,
  previews,
}: {
  atts: AttachmentMeta[]
  previews: Record<string, string>
}) {
  return (
    <div className="ai-msg-attachments">
      {atts.map((a) =>
        ATTACHMENT_IMAGE_EXTS.has(a.ext) ? (
          <span key={a.path} className="ai-attachment-thumb" title={a.name}>
            {previews[a.path] ? (
              <img src={previews[a.path]} alt={a.name} />
            ) : (
              <span className="ai-attachment-thumb-pending" aria-hidden>
                <img src={fileImageIcon} alt="" />
              </span>
            )}
          </span>
        ) : (
          <span key={a.path} className="ai-attachment-card" title={a.name}>
            <span className="ai-attachment-card-icon">
              <AttachmentCardIcon ext={a.ext} />
            </span>
            <span className="ai-attachment-card-meta">
              <span className="ai-attachment-card-name">{truncateCardName(a.name)}</span>
              <span className="ai-attachment-card-size">{formatAttachmentSize(a.sizeBytes)}</span>
            </span>
          </span>
        ),
      )}
    </div>
  )
}

/** author name on AI-generated tracked revisions (accept/reject via Review) */
export const AI_REVISION_AUTHOR = 'AI Assistant'

interface AiPanelProps {
  editor: Editor
  blocks: Block[]
  settings: AiSettings
  /** the document has no text yet — the empty-state copy offers drafting instead of editing */
  docEmpty?: boolean
  /** fallback numbering ids for documents created from the blank template */
  numIdFallback?: NumIds | null
  /** preset instruction pushed from the ribbon or start screen; autoRun sends it immediately */
  preset?: { text: string; nonce: number; autoRun?: boolean } | null
  /** false shows only the collapsed rail; the component stays mounted so panel state survives */
  open?: boolean
  /** expand from the collapsed rail */
  onExpand?: () => void
  /** collapse the panel to the sidebar rail */
  onCollapse?: () => void
  /** Absolute path of the currently open file (used for chat-history persistence) */
  filePath?: string | null
  /** queued selection-scoped edits (owned by App, which also owns the anchors) */
  editQueue?: DocsEditQueueItem[]
  onQueueEditInstruction?: (qid: string, instruction: string) => void
  onQueueRemove?: (qid: string) => void
  onQueueClear?: () => void
  /** scroll to and select the anchored passage */
  onQueueFocus?: (qid: string) => void
  /** submission consumed these items: drop them and their anchors */
  onQueueConsume?: (qids: string[]) => void
  /** comments store for the AI comment tools (read/reply/resolve) */
  commentsAccess?: AiCommentsAccess
  /** header/footer state for the set_header_footer tool and per-turn context */
  hfAccess?: AiHeaderFooterAccess
  /**
   * Hosted by the shared EditorFrame: the frame owns the panel's width, its
   * resize handle and hiding it, so the panel draws neither a resizer nor the
   * collapsed rail.
   */
  hosted?: boolean
}

export function AiPanel({
  editor,
  blocks,
  settings,
  docEmpty,
  numIdFallback,
  preset,
  open = true,
  onExpand,
  onCollapse,
  filePath,
  editQueue = [],
  onQueueEditInstruction,
  onQueueRemove,
  onQueueClear,
  onQueueFocus,
  onQueueConsume,
  commentsAccess,
  hfAccess,
  hosted = false,
}: AiPanelProps) {
  const { t, lang } = useI18n()
  // Panel chrome follows the UI language; message text follows its own content (dir=auto below)
  const isRtl = lang === 'ar' || lang === 'he'
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  /** Wall-clock start of the current run, drives the elapsed badge */
  const runStartedAtRef = useRef(0)
  const [chat, setChat] = useState<ChatEntry[]>([])
  /** Past conversation restored from JSONL (read-only transcript, not fed to the model) */
  const [historicChat, setHistoricChat] = useState<ChatEntry[]>([])
  const [trackChanges, setTrackChanges] = useState(
    () => localStorage.getItem(TRACK_CHANGES_KEY) === '1',
  )
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([])
  const [attachNotice, setAttachNotice] = useState<string | null>(null)
  /** data-URL previews for image attachments, keyed by path (Genspark composer thumbnails) */
  const [attachmentPreviews, setAttachmentPreviews] = useState<Record<string, string>>({})
  /** image paths with a read already issued — one readAttachmentImage per attach, even while pending */
  const previewRequestedRef = useRef(new Set<string>())
  /** Attachments consumed by earlier sends this session: sending clears the composer, but the
      files skill must keep reading them mid-run and in follow-up turns. Deduped by path
      against the live composer list. */
  const sentAttachmentsRef = useRef<AttachmentMeta[]>([])
  useEffect(() => {
    // previews cover the composer plus every image echoed on a sent/history message
    // (history chips re-read the file by its stored path; a deleted file keeps the placeholder)
    const wanted = [
      ...attachments,
      ...chat.flatMap((e) => e.attachments ?? []),
      ...historicChat.flatMap((e) => e.attachments ?? []),
    ]
    const alive = new Set(wanted.map((a) => a.path))
    // drop previews (and request markers) of removed attachments, so memory is reclaimed and a re-attach re-reads
    setAttachmentPreviews((prev) => {
      const stale = Object.keys(prev).filter((p) => !alive.has(p))
      if (stale.length === 0) return prev
      const next = { ...prev }
      for (const p of stale) delete next[p]
      return next
    })
    for (const p of previewRequestedRef.current) {
      if (!alive.has(p)) previewRequestedRef.current.delete(p)
    }
    for (const a of wanted) {
      if (!ATTACHMENT_IMAGE_EXTS.has(a.ext) || previewRequestedRef.current.has(a.path)) continue
      previewRequestedRef.current.add(a.path)
      void window.desktop
        .readAttachmentImage(a.path)
        .then((r) => {
          if (!previewRequestedRef.current.has(a.path)) return // removed while the read was in flight
          if (r.ok && r.base64 && r.mime) {
            setAttachmentPreviews((prev) => ({
              ...prev,
              [a.path]: `data:${r.mime};base64,${r.base64}`,
            }))
          }
        })
        .catch(() => {
          // A rejected read (bridge error, teardown race) must not leave the
          // path marked requested forever — that would permanently skip the
          // thumbnail with no retry. Clear it so the next effect run retries.
          previewRequestedRef.current.delete(a.path)
        })
    }
  }, [attachments, chat, historicChat])
  /** paints the strip's scrollbar thumb while the user scrolls it (cleared 800ms after the last event) */
  const attachScrollFadeRef = useRef(0)
  const onAttachmentsScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    const el = e.currentTarget
    el.classList.add('is-scrolling')
    window.clearTimeout(attachScrollFadeRef.current)
    attachScrollFadeRef.current = window.setTimeout(() => el.classList.remove('is-scrolling'), 800)
  }
  const [dragOver, setDragOver] = useState(false)
  // preferred = the user's chosen width (the only value persisted); panelWidth =
  // what fits the current window. Deriving the display width from the preference
  // means a transiently small window never permanently shrinks the panel.
  const preferredWidthRef = useRef(loadPanelWidth())
  const [panelWidth, setPanelWidth] = useState(() => clampPanelWidth(preferredWidthRef.current))
  const [resizing, setResizing] = useState(false)
  const asideRef = useRef<HTMLElement>(null)

  // The .ai-dock wrapper owns the animated width (Excel-parity 180ms slide);
  // it tracks the resizable panel width through this variable
  // `open` dep: the aside ref only exists while expanded
  useEffect(() => {
    const dock = asideRef.current?.closest('.ai-dock') as HTMLElement | null
    dock?.style.setProperty('--ai-panel-width', `${panelWidth}px`)
  }, [panelWidth, open])

  // Re-derive the display width on window resize (max is 60% of the window);
  // growing the window back restores the preferred width
  useEffect(() => {
    const onResize = () => setPanelWidth(clampPanelWidth(preferredWidthRef.current))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // bumped on selection/doc changes so the scope hint & quick actions stay fresh
  const [, setScopeTick] = useState(0)
  /** the scope chip's expandable preview of the selected text */
  const [scopePreviewOpen, setScopePreviewOpen] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  /** false once the user scrolls up to read; re-arms near the bottom */
  const stickToBottomRef = useRef(true)
  /** projectId/chatId of the current chat */
  const chatRefIds = useRef<{ projectId: string; chatId: string } | null>(null)

  // latest props for the loop's closures (the loop instance outlives renders)
  const editorRef = useRef(editor)
  editorRef.current = editor
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  // Plan or Run for the next message (default from Settings), and the status line's prefs
  // (outside the suite, and in tests, there is no preload: the defaults stand)
  const { mode, setMode, ...prefs } = useRedrobPrefs(
    typeof window === 'undefined' ? undefined : window.desktop,
  )
  /** the request a running read-only Plan run is planning (null for a normal run) */
  const planRunRef = useRef<string | null>(null)
  /** steps of the approved plan the running run follows */
  const planStepsRef = useRef(0)
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks
  const numIdFallbackRef = useRef(numIdFallback)
  numIdFallbackRef.current = numIdFallback
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments
  /** attachments consumed by the most recent send — retry resends the same set */
  const lastAttachmentsRef = useRef<AttachmentMeta[]>([])
  /** composer attachments plus everything already sent this session (deduped by path) */
  const availableAttachments = (): AttachmentMeta[] => {
    const seen = new Set<string>()
    return [...sentAttachmentsRef.current, ...attachmentsRef.current].filter((a) =>
      seen.has(a.path) ? false : (seen.add(a.path), true),
    )
  }
  const trackChangesRef = useRef(trackChanges)
  trackChangesRef.current = trackChanges
  const commentsAccessRef = useRef(commentsAccess)
  commentsAccessRef.current = commentsAccess
  const hfAccessRef = useRef(hfAccess)
  hfAccessRef.current = hfAccess

  /** drop every aiChanged flag; silent = skip undo history (auto-accept path) */
  const clearAiHighlights = (silent = false) => {
    const view = editorRef.current.view
    let tr = view.state.tr
    let touched = false
    view.state.doc.forEach((node, offset) => {
      if (node.attrs.aiChanged) {
        tr = tr.setNodeMarkup(offset, undefined, { ...node.attrs, aiChanged: false })
        touched = true
      }
    })
    if (silent) tr = tr.setMeta('addToHistory', false)
    if (touched) {
      view.dispatch(tr)
      // AI-pipeline housekeeping, not a user edit: keep the freshness baseline current
      markDocSeen(editorRef.current)
    }
  }
  /** instruction of the in-flight run */
  const instructionRef = useRef('')
  /** document state before the run's first edit — attached to the turn's final
      segment at run end (mid-turn segments never show the action toolbar) */
  const runSnapshotRef = useRef<PmNode | null>(null)
  /** last sent instruction, for one-click retry */
  const lastInstructionRef = useRef('')
  /** Tool activity of the whole run (with args/output, accumulated across turns) — for full
      transcript persistence, and so persisting needn't do side effects inside a setState updater */
  const runToolsRef = useRef<
    Array<{
      name: string
      summary: string
      isError?: boolean
      mutated?: boolean
      input?: string
      output?: string
    }>
  >([])

  // ── Chat-history persistence ────────────────────────────────────────────
  useEffect(() => {
    const api = (window as Window & { projectApi?: typeof window.projectApi }).projectApi
    if (!api) return
    const tempChatId = `unsaved-${Date.now()}`
    void api
      .resolveChat({ filePath: filePath ?? null, tempChatId })
      .then((ids) => {
        chatRefIds.current = ids
        return api.loadChat({ projectId: ids.projectId, chatId: ids.chatId, limit: 200 })
      })
      .then((msgs) => {
        if (msgs.length === 0) return
        setHistoricChat(
          msgs.map((m) => ({
            role: m.role,
            text: m.text,
            tools: m.tools?.map((t) => ({
              name: t.name,
              summary: t.summary,
              isError: t.isError,
              output: t.output ? t.output.slice(0, TOOL_OUTPUT_MAX_CHARS) : undefined,
            })),
            // stored metadata only: no thumbnail read for history, the chips render name/size
            attachments: m.attachments
              ?.filter((a) => a.path)
              .map((a) => ({
                name: a.name,
                path: a.path ?? '',
                ext: a.ext ?? '',
                sizeBytes: a.sizeBytes ?? 0,
              })),
          })),
        )
        // restore model context: follow-ups after reopening a file continue the previous conversation (only when the loop is idle with no history)
        loopRef.current?.restore(msgs.map((m) => ({ role: m.role, text: m.text })))
      })
      .catch(() => {
        /* history load failures are silent */
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** After an unsaved document's first save yields a real path, bind the unsaved-* history to that file (recoverable by path on reopen) */
  useEffect(() => {
    const ids = chatRefIds.current
    const api = (window as Window & { projectApi?: typeof window.projectApi }).projectApi
    if (!api || !ids || !filePath || !ids.chatId.startsWith('unsaved-')) return
    void api
      .rebindChat({ projectId: ids.projectId, tempChatId: ids.chatId, newFilePath: filePath })
      .then((r) => {
        if (r?.chatId) chatRefIds.current = r
      })
      .catch(() => {
        /* silent */
      })
  }, [filePath])

  const persistMessage = (
    role: 'user' | 'assistant',
    text: string,
    tools?: Array<{
      name: string
      summary: string
      isError?: boolean
      input?: string
      output?: string
    }>,
    attachments?: AttachmentMeta[],
  ) => {
    const ids = chatRefIds.current
    const api = (window as Window & { projectApi?: typeof window.projectApi }).projectApi
    if (!ids || !api) return
    void api
      .appendChat({
        projectId: ids.projectId,
        chatId: ids.chatId,
        role,
        text,
        ...(tools && tools.length > 0 ? { tools } : {}),
        ...(attachments && attachments.length > 0
          ? {
              attachments: attachments.map((a) => ({
                name: a.name,
                path: a.path,
                ext: a.ext,
                sizeBytes: a.sizeBytes,
              })),
            }
          : {}),
      })
      .catch(() => {
        /* silent */
      })
  }

  const patchLastAssistant = (
    patch: Partial<ChatEntry> | ((last: ChatEntry) => Partial<ChatEntry>),
  ) => {
    setChat((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (!last || last.role !== 'assistant') return prev
      next[next.length - 1] = { ...last, ...(typeof patch === 'function' ? patch(last) : patch) }
      return next
    })
  }

  const loopRef = useRef<AgentLoop<PmNode> | null>(null)
  if (!loopRef.current) {
    const numIds = (): NumIds => ({
      bullet: findNumId(blocksRef.current, 'bullet') ?? numIdFallbackRef.current?.bullet ?? null,
      ordered: findNumId(blocksRef.current, 'ordered') ?? numIdFallbackRef.current?.ordered ?? null,
    })
    loopRef.current = new AgentLoop<PmNode>({
      transport: createElectronTransport(() => settingsRef.current),
      insights: insightsSink,
      systemSuffix: aiLangDirective,
      skill: composeSkills('docs+files', '', [
        createDocsSkill(
          () => editorRef.current,
          numIds,
          () => (trackChangesRef.current ? { author: AI_REVISION_AUTHOR } : undefined),
          () => commentsAccessRef.current,
          () => hfAccessRef.current,
        ),
        createFilesSkill(availableAttachments),
      ]),
      captureSnapshot: () => editorRef.current.getJSON() as PmNode,
      events: {
        onText: (text) => patchLastAssistant({ text }),
        onToolStart: (call) => {
          // Live "running" chip: replaced in place by onToolExecuted
          patchLastAssistant((last) => ({
            tools: [
              ...(last.tools ?? []),
              { name: call.name, summary: call.name.replace(/[_-]+/g, ' '), running: true },
            ],
          }))
        },
        onToolExecuted: ({ call, execution, snapshotBefore }) => {
          // The run's first pre-edit state wins so one roll-back undoes the whole run
          if (snapshotBefore && !runSnapshotRef.current) runSnapshotRef.current = snapshotBefore
          if (execution.mutated) {
            // tracking off: accept immediately (same tick, so the yellow never paints);
            // tracking on: revisions stay pending, handled in the Review tab
            if (!trackChangesRef.current) clearAiHighlights(true)
          }
          runToolsRef.current.push({
            name: call.name,
            summary: execution.summary,
            isError: execution.isError,
            mutated: !!execution.mutated,
            input: safeJsonInput(call.input),
            output: execution.output
              ? execution.output.slice(0, PERSIST_TOOL_FIELD_MAX)
              : undefined,
          })
          patchLastAssistant((last) => {
            // Swap out the running placeholder pushed by onToolStart (parse-fail calls have none)
            const tools = [...(last.tools ?? [])]
            if (tools.at(-1)?.running) tools.pop()
            return {
              tools: [
                ...tools,
                {
                  name: call.name,
                  summary: execution.summary,
                  isError: execution.isError,
                  output: execution.output
                    ? execution.output.slice(0, TOOL_OUTPUT_MAX_CHARS)
                    : undefined,
                },
              ],
            }
          })
        },
        onTurnEnd: () => {
          patchLastAssistant({ streaming: false })
          setChat((prev) => [...prev, { role: 'assistant', text: '', streaming: true }])
        },
        onDone: ({ text, cancelled, turnLimit, truncated }) => {
          // module-level t: the loop instance is created only once; the component's t goes stale with the first-render closure
          const baseText = turnLimit
            ? [text, tModule('aiTurnLimit')].filter(Boolean).join('\n\n')
            : text || (cancelled ? tModule('aiStopped') : '')
          const finalText = truncated
            ? [baseText, tModule('aiTruncatedNote')].filter(Boolean).join('\n\n')
            : baseText
          const planOf = planRunRef.current
          planRunRef.current = null
          const planSteps = planStepsRef.current
          planStepsRef.current = 0
          const changes = runToolsRef.current.filter((tl) => !tl.isError && tl.mutated).length
          const s = settingsRef.current
          const model = s.providers[s.provider]?.model?.trim()
          patchLastAssistant((last) =>
            planOf && !cancelled
              ? {
                  // the read-only run wrote a plan: it renders as a document, nothing changed
                  streaming: false,
                  text: '',
                  tools: undefined,
                  plan: { request: planOf, steps: parsePlan(finalText), status: 'draft' },
                }
              : {
                  streaming: false,
                  turnLimit,
                  text: finalText || (last.tools?.length ? last.text : tModule('aiNoReply')),
                  // A stop mid-tool can leave a running placeholder behind — drop it
                  tools: last.tools?.filter((tl) => !tl.running),
                  snapshot: runSnapshotRef.current ?? undefined,
                  // only what the run itself reports; nothing is invented to fill a row
                  report: cancelled
                    ? undefined
                    : {
                        model: model || 'Redrob Auto',
                        chosenBy: model ? 'you' : 'auto',
                        ...(planSteps > 0 ? { planSteps } : {}),
                        ...(changes > 0 ? { changes } : {}),
                      },
                },
          )
          setBusy(false)
          // App listens: a run that generated content into a never-saved document
          // triggers a silent first save with a content-derived file name
          window.dispatchEvent(new Event('ai-docs-run-done'))
          // persist outside the updater (a double-invoked updater would write history twice); tools stores the whole run's full activity.
          // Edits-only runs (tools ran, no text) persist too, or the whole turn vanishes from the restored transcript
          if (!cancelled && (finalText || runToolsRef.current.length > 0)) {
            persistMessage('assistant', finalText, runToolsRef.current)
          }
        },
        onError: (error, code) => {
          setChat((prev) => {
            const next = [...prev]
            const last = next.at(-1)
            if (last?.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                streaming: false,
                error,
                tools: last.tools?.filter((tl) => !tl.running),
                snapshot: runSnapshotRef.current ?? undefined,
              }
            }
            return next
          })
          // Only an authentication failure gets the inline sign-in button. It used
          // to be decided by aiGskStatus(), which knows only the OAuth session --
          // so an API-key workspace is permanently "signed out" there and EVERY
          // failure (timeout, credits, tool loop) grew a button that fixed
          // nothing and hid the real cause. errorCode comes from the status the
          // console actually returned; the message text is localized and is not
          // a contract.
          if (code === 'auth') {
            setChat((prev) => {
              const next = [...prev]
              const last = next.at(-1)
              if (last?.role === 'assistant' && last.error) {
                next[next.length - 1] = { ...last, loginRequired: true }
              }
              return next
            })
          }
          setBusy(false)
        },
      },
    })
  }

  useEffect(() => {
    if (!preset) return
    if (preset.autoRun) runWith(preset.text)
    else {
      setInput(preset.text)
      inputRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.nonce])

  // keep the scope hint & quick actions in sync with the editor selection
  useEffect(() => {
    const bump = () => {
      if (editor.state.selection.empty) setScopePreviewOpen(false)
      setScopeTick((t) => t + 1)
    }
    editor.on('selectionUpdate', bump)
    editor.on('update', bump)
    return () => {
      editor.off('selectionUpdate', bump)
      editor.off('update', bump)
    }
  }, [editor])

  // scope chip data, recomputed per render (the scope tick above keeps it fresh)
  const liveSelection = editor.state.selection
  const selectionText = liveSelection.empty
    ? ''
    : editor.state.doc.textBetween(liveSelection.from, liveSelection.to, '\n', ' ').trim()
  const hasScopeSelection = selectionText.length > 0

  /** the × on the scope chip: collapse the selection so the run targets the whole document */
  const clearScopeSelection = () => {
    editor.commands.setTextSelection(editor.state.selection.to)
  }

  /** [label](docnav://block/N) links in replies select and scroll to that block */
  const docNav = {
    scheme: DOC_NAV_SCHEME,
    onNavigate: (href: string) => {
      const index = parseDocNavHref(href)
      if (index !== null) navigateToBlock(editorRef.current, index)
    },
  }

  // follow the stream, but stop yanking once the user scrolls up to read;
  // `open` dep: re-expanding lands on messages streamed while collapsed
  useEffect(() => {
    if (stickToBottomRef.current) {
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
    }
  }, [chat, open])

  const onLogScroll = () => {
    const el = logRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  const run = () => {
    const text = input.trim()
    if (!text) return
    if (mode === 'plan') runWith(planRequest(text), text, undefined, { planOf: text })
    else runWith(text)
  }

  /** the person approved a plan (possibly edited): run it as a normal run */
  const runPlan = (entryIdx: number, request: string, steps: string[]) => {
    setChat((prev) =>
      prev.map((e, i) =>
        i === entryIdx && e.plan ? { ...e, plan: { ...e.plan, steps, status: 'running' } } : e,
      ),
    )
    runWith(runPlanRequest(request, steps), request, undefined, { planSteps: steps.length })
  }
  const keepPlan = (entryIdx: number) =>
    setChat((prev) =>
      prev.map((e, i) =>
        i === entryIdx && e.plan ? { ...e, plan: { ...e.plan, status: 'kept' } } : e,
      ),
    )

  /** Image attachments are read as base64 and go multimodal with this user message (≤5MB per image, max 20) */
  const MAX_IMAGES_PER_MESSAGE = 20
  const collectImageAttachments = async (atts: AttachmentMeta[]): Promise<AgentImage[]> => {
    const imageAtts = atts.filter((a) => ATTACHMENT_IMAGE_EXTS.has(a.ext))
    const images: AgentImage[] = []
    const failures: string[] = []
    for (const att of imageAtts.slice(0, MAX_IMAGES_PER_MESSAGE)) {
      const result = await window.desktop.readAttachmentImage(att.path)
      if (result.ok && result.base64 && result.mime) {
        images.push({ base64: result.base64, mime: result.mime })
      } else {
        failures.push(result.error ?? t('aiImageReadFail', { name: att.name }))
      }
    }
    if (imageAtts.length > MAX_IMAGES_PER_MESSAGE) {
      failures.push(t('aiTooManyImages', { max: MAX_IMAGES_PER_MESSAGE }))
    }
    if (failures.length > 0) {
      setAttachNotice(failures.join(';'))
      window.setTimeout(() => setAttachNotice(null), 5000)
    }
    return images
  }

  const runWith = (
    instruction: string,
    displayInstruction = instruction,
    attachmentsOverride?: AttachmentMeta[],
    runOptions?: { planOf?: string; planSteps?: number },
  ) => {
    const loop = loopRef.current
    if (!instruction || !loop || loop.busy) return
    setInput('')
    // The message consumes the composer attachments: they ride along (echoed on the
    // bubble, images multimodal, files via the files skill) and the composer clears.
    const sentAtts = attachmentsOverride ?? attachmentsRef.current
    if (!attachmentsOverride && sentAtts.length > 0) {
      const seen = new Set(sentAttachmentsRef.current.map((a) => a.path))
      sentAttachmentsRef.current = [
        ...sentAttachmentsRef.current,
        ...sentAtts.filter((a) => !seen.has(a.path)),
      ]
      setAttachments([])
    }
    lastAttachmentsRef.current = sentAtts
    instructionRef.current = instruction
    lastInstructionRef.current = instruction
    planRunRef.current = runOptions?.planOf ?? null
    planStepsRef.current = runOptions?.planSteps ?? 0
    runToolsRef.current = []
    runSnapshotRef.current = null
    stickToBottomRef.current = true
    setChat((prev) => [
      ...prev,
      {
        role: 'user',
        text: displayInstruction,
        ...(sentAtts.length > 0 ? { attachments: sentAtts } : {}),
      },
      { role: 'assistant', text: '', streaming: true },
    ])
    runStartedAtRef.current = Date.now()
    setBusy(true)
    persistMessage('user', instruction, undefined, sentAtts)
    // a rejected image read must not strand the run (busy would stay true forever): degrade to a no-image send
    void collectImageAttachments(sentAtts)
      .catch((): AgentImage[] => {
        setAttachNotice(t('aiImagesSendFailed'))
        window.setTimeout(() => setAttachNotice(null), 5000)
        return []
      })
      // a Plan run is read-only: the model is offered no tools, so the file cannot change
      .then((images) => loop.run(instruction, images, { readOnly: !!runOptions?.planOf }))
  }

  const cancel = () => loopRef.current?.cancel()

  /** submit every still-anchored queued edit as one batch run */
  const sendQueue = () => {
    const loop = loopRef.current
    if (!loop || loop.busy || editQueue.length === 0) return
    const entries = liveItems(resolveQueue(editorRef.current, editQueue))
    if (entries.length === 0) {
      onQueueClear?.()
      return
    }
    const instruction = buildQueueInstruction(entries)
    const display = buildQueueSummary(t('aiQueueSubmitted', { count: entries.length }), entries)
    // consumed at send: the run rewrites the anchored passages, which would
    // orphan the anchors anyway; a failed run is retried via the retry action
    onQueueConsume?.(editQueue.map((item) => item.qid))
    runWith(instruction, display)
  }

  const retry = () =>
    runWith(lastInstructionRef.current, lastInstructionRef.current, lastAttachmentsRef.current)

  const continueRun = () => runWith(DOCS_CONTINUE_INSTRUCTION, t('aiContinue'))

  const newChat = () => {
    loopRef.current?.reset()
    setBusy(false)
    setChat([])
    sentAttachmentsRef.current = []
    inputRef.current?.focus()
  }

  const copyMessage = (text: string, idx: number) => {
    void navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    window.setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1200)
  }

  const mergeAttachments = (result: AttachmentAddResult | null) => {
    if (!result) return
    if (result.accepted.length > 0) {
      setAttachments((prev) => {
        const seen = new Set(prev.map((a) => a.path))
        return [...prev, ...result.accepted.filter((a) => !seen.has(a.path))]
      })
    }
    if (result.rejected.length > 0) {
      setAttachNotice(result.rejected.join(';'))
      window.setTimeout(() => setAttachNotice(null), 5000)
    }
  }

  const pickAttachments = async () => mergeAttachments(await window.desktop.pickAttachments())

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.desktop.getPathForFile(f))
      .filter(Boolean)
    if (paths.length > 0) mergeAttachments(await window.desktop.addAttachmentPaths(paths))
  }

  /** Files pasted into the input: ones with a local path go through regular attachments; pure bitmaps like screenshots hit a temp file first */
  const onPasteFiles = async (files: File[]) => {
    const paths: string[] = []
    for (const f of files) {
      const p = window.desktop.getPathForFile(f)
      if (p) {
        paths.push(p)
        continue
      }
      const ext = PASTE_MIME_EXT[f.type] ?? f.name.split('.').pop()?.toLowerCase() ?? 'bin'
      mergeAttachments(await window.desktop.addPastedImage(await f.arrayBuffer(), ext))
    }
    if (paths.length > 0) mergeAttachments(await window.desktop.addAttachmentPaths(paths))
  }

  const removeAttachment = (path: string) =>
    setAttachments((prev) => prev.filter((a) => a.path !== path))

  const acceptChanges = () => {
    applyRevisionsBy(editorRef.current, AI_REVISION_AUTHOR, 'accept')
    clearAiHighlights()
  }

  const toggleTrackChanges = () => {
    const next = !trackChanges
    setTrackChanges(next)
    localStorage.setItem(TRACK_CHANGES_KEY, next ? '1' : '0')
    // switching off keeps nothing pending: accept whatever is still highlighted
    if (!next) acceptChanges()
  }

  const rollback = (entryIdx: number, snapshot: PmNode) => {
    editor.commands.setContent(snapshot as never)
    // The document rewound to before this turn, so this and every later
    // rollback point now describe discarded futures
    setChat((prev) =>
      prev.map((e, i) => (i >= entryIdx && e.snapshot ? { ...e, snapshot: undefined } : e)),
    )
  }

  const resizeCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => resizeCleanupRef.current?.(), [])

  /** drag the panel's right edge to resize; panel is flush with the window's left edge */
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const resizer = e.currentTarget
    setResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: PointerEvent) => {
      const w = clampPanelWidth(ev.clientX)
      preferredWidthRef.current = w
      setPanelWidth(w)
    }
    let done = false
    const cleanup = () => {
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

  // collapsed: rail only — after all hooks, so the instance and its state survive
  if (!open && !hosted) {
    return (
      <button
        className="ai-rail"
        data-tip={t('appExpandAiPanel')}
        aria-label={t('appExpandAiPanel')}
        onClick={onExpand}
      >
        <RedrobMark size={22} />
      </button>
    )
  }

  const stepStrings = (tools: ReadonlyArray<ToolActivity>): AgentStepsStrings => ({
    worked: t('aiWorkedSteps', { n: tools.length }),
    working: t('aiGroupWorking'),
    running: t('aiStepRunning'),
    done: t('aiStepDone'),
    failed: t('aiStepFailed'),
  })

  return (
    <aside
      ref={asideRef}
      style={{ width: '100%' }}
      dir={isRtl ? 'rtl' : undefined}
      className={`ai-panel${dragOver ? ' ai-panel-dragover' : ''}${resizing ? ' ai-panel-resizing' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false)
      }}
      onDrop={onDrop}
    >
      {!hosted && (
        <div
          className="ai-panel-resizer"
          onPointerDown={startResize}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('aiPanelTitle')}
        />
      )}
      <AgentPanelHeader
        title={t('aiPanelTitle')}
        actions={[
          chat.length > 0 && {
            label: t('aiNewChatTitle'),
            icon: <Icon name="edit" size={16} />,
            onClick: newChat,
          },
          !!onCollapse && {
            label: t('aiCollapseTitle'),
            icon: <Icon name="sidebar" size={16} />,
            onClick: onCollapse,
          },
        ]}
      />

      <div ref={logRef} className="ai-chat" onScroll={onLogScroll}>
        {/* past conversation (read-only transcript, not fed to the model), shown continuously with the current turn */}
        {historicChat.length > 0 && (
          <>
            {historicChat.map((entry, i) => (
              <div key={`h${i}`} className="ai-msg-historic">
                <AgentMessage
                  role={entry.role}
                  author={entry.role === 'user' ? t('aiYou') : t('aiPanelTitle')}
                >
                  {entry.role === 'user' && entry.attachments && entry.attachments.length > 0 && (
                    <SentAttachments atts={entry.attachments} previews={attachmentPreviews} />
                  )}
                  {entry.tools && entry.tools.length > 0 && (
                    <AgentSteps steps={entry.tools} strings={stepStrings(entry.tools)} />
                  )}
                  {entry.text && (
                    <div dir="auto">
                      <Markdown text={entry.text} nav={docNav} />
                    </div>
                  )}
                </AgentMessage>
              </div>
            ))}
            <div className="ai-history-sep" role="separator">
              {t('aiHistorySep')}
            </div>
          </>
        )}
        {chat.length === 0 && historicChat.length === 0 && (
          <AgentEmpty
            title={t(docEmpty ? 'aiEmptyDraftTitle' : 'aiEmptyTitle')}
            description={`${t(docEmpty ? 'aiEmptyDraftBody1' : 'aiEmptyBody1')} ${t(
              docEmpty ? 'aiEmptyDraftBody2' : 'aiEmptyBody2',
            )}`}
            prompts={(docEmpty ? DRAFT_STARTER_PROMPTS : EDIT_STARTER_PROMPTS).map((p) => t(p))}
            promptsLabel={t('aiStartersLabel')}
            // starters fill the field rather than sending: they usually want a qualifier
            onPick={(text) => {
              setInput(text)
              inputRef.current?.focus()
            }}
          />
        )}
        {chat.map((entry, i) => {
          if (
            entry.role === 'assistant' &&
            !entry.text &&
            !entry.streaming &&
            !entry.error &&
            !entry.tools?.length &&
            !entry.plan
          ) {
            return null
          }
          const isLast = i === chat.length - 1
          // Action row appears once per completed reply: on the turn's final segment only
          // (mid-turn segments have a following assistant entry; the live turn ends when !busy)
          const nextEntry = chat[i + 1]
          const turnEnded = nextEntry ? nextEntry.role === 'user' : !busy
          const showToolbar =
            entry.role === 'assistant' &&
            !entry.streaming &&
            turnEnded &&
            // edits-only turns have no text but still carry the rollback point
            !!(entry.text || entry.error || entry.snapshot)
          const toolbar = showToolbar ? (
            <div className="ai-msg-toolbar">
              {entry.text && (
                <IconButton
                  size="sm"
                  label={t('aiCopyReplyTitle')}
                  onClick={() => copyMessage(entry.text, i)}
                >
                  <Icon name={copiedIdx === i ? 'check' : 'copy'} size={14} />
                </IconButton>
              )}
              {isLast && !busy && lastInstructionRef.current && (
                <IconButton size="sm" label={t('aiRegenerateTitle')} onClick={retry}>
                  <Icon name="refresh" size={14} />
                </IconButton>
              )}
              {entry.snapshot && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ai-rollback-btn"
                  disabled={busy}
                  iconLeft={<Icon name="restore" size={14} />}
                  onClick={() => rollback(i, entry.snapshot!)}
                >
                  {t('aiRollback')}
                </Button>
              )}
            </div>
          ) : undefined
          return (
            <AgentMessage
              key={i}
              role={entry.role}
              author={entry.role === 'user' ? t('aiYou') : t('aiPanelTitle')}
              streaming={entry.role === 'assistant' && !!entry.streaming && !!entry.text}
              footer={toolbar}
            >
              {entry.role === 'user' && entry.attachments && entry.attachments.length > 0 && (
                <SentAttachments atts={entry.attachments} previews={attachmentPreviews} />
              )}
              {entry.role === 'assistant' && !entry.text && entry.streaming ? (
                <AgentWorking label={entry.tools?.length ? t('aiWorking') : t('aiThinking')} />
              ) : entry.role === 'assistant' ? (
                entry.text && (
                  <div dir="auto">
                    <Markdown text={entry.text} nav={docNav} />
                  </div>
                )
              ) : (
                <span dir="auto">{entry.text}</span>
              )}
              {entry.tools && entry.tools.length > 0 && (
                <AgentSteps steps={entry.tools} strings={stepStrings(entry.tools)} />
              )}
              {entry.plan && (
                <PlanReply
                  lang={lang}
                  request={entry.plan.request}
                  steps={entry.plan.steps}
                  status={entry.plan.status}
                  onRun={(steps) => runPlan(i, entry.plan!.request, steps)}
                  onKeep={() => keepPlan(i)}
                />
              )}
              {entry.report && !entry.error && !entry.streaming && turnEnded && (
                <RedrobReceipt lang={lang} report={entry.report} />
              )}
              {entry.error && (
                // fail-closed: the engine's own message, and sign-in only when auth is the cause
                <AgentFailure
                  title={t('aiFailedTitle')}
                  message={entry.error}
                  action={
                    entry.loginRequired ? (
                      <Button size="sm" onClick={() => void window.desktop.aiGskLogin()}>
                        {t('aiGskLoginBtn')}
                      </Button>
                    ) : undefined
                  }
                />
              )}
              {entry.turnLimit && isLast && !busy && (
                <Button size="sm" variant="secondary" onClick={continueRun}>
                  {t('aiContinue')}
                </Button>
              )}
            </AgentMessage>
          )
        })}
      </div>

      <div className="ai-composer">
        {attachNotice && (
          <Alert tone="info" className="ai-attach-notice">
            {attachNotice}
          </Alert>
        )}
        <EditQueueCard
          items={editQueue}
          editor={editor}
          busy={busy}
          onEditInstruction={(qid, text) => onQueueEditInstruction?.(qid, text)}
          onRemove={(qid) => onQueueRemove?.(qid)}
          onDiscardAll={() => onQueueClear?.()}
          onSend={sendQueue}
          onFocus={(qid) => onQueueFocus?.(qid)}
        />
        <AgentComposer
          context={
            (hasScopeSelection || attachments.length > 0) && (
              <>
                {hasScopeSelection && (
                  <div className="ai-scope-row">
                    <span className="ai-scope-hint">
                      <button
                        type="button"
                        className="ai-scope-label"
                        onClick={() => setScopePreviewOpen((v) => !v)}
                        aria-expanded={scopePreviewOpen}
                        data-tip={t('aiScopeSelectionTip')}
                      >
                        {t('aiScopeSelection', { words: countWords(selectionText) })}
                      </button>
                      <button
                        type="button"
                        className="ai-scope-clear"
                        onClick={clearScopeSelection}
                        data-tip={t('aiScopeClearTitle')}
                        aria-label={t('aiScopeClearTitle')}
                      >
                        <Icon name="close" size={12} />
                      </button>
                    </span>
                    {scopePreviewOpen && (
                      <div className="ai-scope-preview">
                        {selectionText.length > 400
                          ? `${selectionText.slice(0, 400)}…`
                          : selectionText}
                      </div>
                    )}
                  </div>
                )}
                {attachments.length > 0 && (
                  <div className="ai-attachments" onScroll={onAttachmentsScroll}>
                    {attachments.map((a) =>
                      ATTACHMENT_IMAGE_EXTS.has(a.ext) ? (
                        <span key={a.path} className="ai-attachment-thumb" data-tip={a.path}>
                          {attachmentPreviews[a.path] ? (
                            <img src={attachmentPreviews[a.path]} alt={a.name} />
                          ) : (
                            <span className="ai-attachment-thumb-pending" aria-hidden>
                              <img src={fileImageIcon} alt="" />
                            </span>
                          )}
                          <button
                            type="button"
                            className="ai-attachment-thumb-remove"
                            onClick={() => removeAttachment(a.path)}
                            data-tip={t('aiRemoveAttachmentTitle')}
                            aria-label={t('aiRemoveAttachmentTitle')}
                          >
                            <Icon name="close" size={12} />
                          </button>
                        </span>
                      ) : (
                        <span key={a.path} className="ai-attachment-card" data-tip={a.path}>
                          <span className="ai-attachment-card-icon">
                            <AttachmentCardIcon ext={a.ext} />
                          </span>
                          <span className="ai-attachment-card-meta">
                            <span className="ai-attachment-card-name">
                              {truncateCardName(a.name)}
                            </span>
                            <span className="ai-attachment-card-size">
                              {formatAttachmentSize(a.sizeBytes)}
                            </span>
                          </span>
                          <button
                            type="button"
                            className="ai-attachment-thumb-remove"
                            onClick={() => removeAttachment(a.path)}
                            data-tip={t('aiRemoveAttachmentTitle')}
                            aria-label={t('aiRemoveAttachmentTitle')}
                          >
                            <Icon name="close" size={12} />
                          </button>
                        </span>
                      ),
                    )}
                  </div>
                )}
              </>
            )
          }
          value={input}
          busy={busy}
          placeholder={t('aiInputPlaceholder')}
          label={t('aiInputPlaceholder')}
          sendLabel={t('aiSend')}
          stopLabel={t('aiStop')}
          textareaRef={inputRef}
          onChange={setInput}
          onSend={run}
          onStop={cancel}
          onPasteFiles={(files) => void onPasteFiles(files)}
          tools={<RedrobModeSwitch lang={lang} value={mode} onChange={setMode} />}
          status={
            <RedrobStatus
              lang={lang}
              memory={prefs.memory}
              factCheck={prefs.factCheck}
              challenge={prefs.challenge}
            />
          }
          leading={
            <>
              <IconButton size="sm" label={t('aiAttachTitle')} onClick={pickAttachments}>
                <Icon name="attachment" size={16} />
              </IconButton>
              <button
                type="button"
                className={`ai-track-btn${trackChanges ? ' on' : ''}`}
                aria-pressed={trackChanges}
                onClick={toggleTrackChanges}
                data-tip={trackChanges ? t('aiTrackOnTitle') : t('aiTrackOffTitle')}
              >
                <span className="ai-track-dot" aria-hidden />
                {t('aiTrackChanges')}
              </button>
            </>
          }
        />
      </div>
    </aside>
  )
}
