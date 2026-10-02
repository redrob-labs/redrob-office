import React, { useEffect, useRef, useState } from 'react'
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
  Changes,
  Icon,
  IconButton,
} from '@genoffice/ui'
import { GensparkMark } from '../ribbon-icons'
import type { ChangePlan } from '../../domain/workbook.types'
import { ATTACHMENT_IMAGE_EXTS, type AttachmentMeta } from '../../shared/desktop-api'
import { useI18n, type TFunc } from '../i18n/locale'
import { Markdown } from '@genoffice/ui'
import { SHEET_NAV_SCHEME } from './sheet-nav'
import filePdfIcon from '../assets/file-pdf.png'
import fileWordIcon from '../assets/file-word.png'
import fileExcelIcon from '../assets/file-excel.png'
import filePptIcon from '../assets/file-ppt.png'
import fileImageIcon from '../assets/file-image.png'
import fileVideoIcon from '../assets/file-video.png'
import fileVoiceIcon from '../assets/file-voice.png'
import fileDocumentIcon from '../assets/file-document.png'
import fileGeneralIcon from '../assets/file-general.png'

/** Clipboard bitmap MIME → attachment extension (matches the main process's
 * ATTACHMENT_IMAGE_EXTS) */
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

/** Name the scope the way the user thinks of it: by column header when the
 *  selection covers whole columns, by range only when it cannot be named. */
function scopeLabel(range: string, columns: readonly string[] | null, t: TFunc): string {
  if (columns?.length === 1) return t('aiScopeColumn', { name: columns[0] ?? '' })
  if (columns && columns.length > 1) {
    return t('aiScopeColumns', { names: columns.join(', '), count: columns.length })
  }
  return t('aiScopeRange', { range })
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
  readonly atts: readonly AttachmentMeta[]
  readonly previews: Record<string, string>
}): React.JSX.Element {
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

/** Resizable panel width: persisted, clamped to min/max, drives the .sheet-body grid column via --copilot-width */
const PANEL_WIDTH_KEY = 'sheets-ai-panel-width'
const PANEL_WIDTH_MIN = 280

function clampPanelWidth(w: number): number {
  // The viewport can be transiently tiny (a WebContentsView is 0×0 until the
  // shell lays it out), so never let the ceiling drop below the minimum
  const max = Math.max(PANEL_WIDTH_MIN, Math.min(720, Math.round(window.innerWidth * 0.6)))
  return Math.min(Math.max(w, PANEL_WIDTH_MIN), max)
}

function loadPanelWidth(): number | null {
  const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY))
  // static bounds only — clamping against the window here would bake a
  // transiently small viewport into the restored preference
  return Number.isFinite(saved) && saved > 0
    ? Math.min(Math.max(saved, PANEL_WIDTH_MIN), 720)
    : null
}

export interface AiToolChip {
  readonly summary: string
  readonly isError: boolean
  /** still executing: rendered as a spinner chip, replaced in place when the tool finishes */
  readonly running?: boolean
  /** Tool name (title tooltip) */
  readonly name?: string
  /** Tool output (truncated UI-side); when present the row expands to details */
  readonly output?: string
}

export interface AiChatMessage {
  readonly role: 'user' | 'assistant'
  readonly text: string
  readonly tools: readonly AiToolChip[]
  readonly streaming?: boolean | undefined
  readonly isError?: boolean | undefined
  /** the run failed and this user message was rolled back out of the model context */
  readonly undelivered?: boolean | undefined
  /** this user message was written to the project-store chat log (Retry re-persists when it wasn't) */
  readonly persisted?: boolean | undefined
  /** the run failed because Genspark is signed out — render an inline sign-in button */
  readonly loginRequired?: boolean | undefined
  /** Set when this message reflects an auto-applied plan; renders an inline [Undo] button. */
  readonly autoApplied?: { readonly opCount: number; readonly undoSteps: number } | undefined
  /** attachments consumed from the composer by this user message (read-only echo chips) */
  readonly attachments?: readonly AttachmentMeta[] | undefined
}

export function AiChatPanel({
  isOpen,
  hasContent,
  chat,
  historicChat = [],
  attachments,
  attachNotice,
  onPickAttachments,
  onAddAttachmentPaths,
  onAddPastedImage,
  onRemoveAttachment,
  prompt,
  preview,
  aiBusy,
  onPromptChange,
  onSend,
  onStop,
  onNewChat,
  onUndo,
  scopeRange,
  scopeColumns,
  scopeLocked,
  onScopeDismiss,
  onCitation,
  onExpand,
  onCollapse,
}: {
  readonly isOpen: boolean
  /** the workbook has cells with content — empty workbooks get "build me a sheet" copy instead */
  readonly hasContent: boolean
  readonly chat: readonly AiChatMessage[]
  readonly historicChat?: readonly AiChatMessage[]
  /// Chat attachments (chips + 📎 button + drag onto the panel), same structure
  /// as the docs/slides AI panels.
  readonly attachments: readonly AttachmentMeta[]
  readonly attachNotice: string | null
  readonly onPickAttachments: () => void
  readonly onAddAttachmentPaths: (paths: readonly string[]) => void
  /// Clipboard-pasted bitmaps (screenshots etc. without a local path): bytes +
  /// extension
  readonly onAddPastedImage: (data: ArrayBuffer, ext: string) => void
  readonly onRemoveAttachment: (path: string) => void
  readonly prompt: string
  readonly preview: ChangePlan | null
  readonly aiBusy: boolean
  readonly onPromptChange: (prompt: string) => void
  /** Send the composer text, or the given instruction when provided (used by the
   *  failed-run Retry, which also resends the message's original attachments;
   *  retryIndex is the failed bubble's chat index so the send replaces it in place) */
  readonly onSend: (
    instruction?: string,
    attachments?: readonly AttachmentMeta[],
    retryIndex?: number,
  ) => void
  readonly onStop: () => void
  readonly onNewChat: () => void
  readonly onUndo: (steps: number) => void
  /** A1 notation of the range this run is scoped to, or null when there is no
   *  scope — a resting single-cell selection carries no intent worth showing,
   *  and dismissing the chip clears it until the next selection change */
  readonly scopeRange: string | null
  /** header names when the scope covers whole columns; they label the chip in
   *  place of the range */
  readonly scopeColumns: readonly string[] | null
  /** the range belongs to a run in flight: it is what that run targets, so it
   *  is shown without the dismiss control */
  readonly scopeLocked: boolean
  readonly onScopeDismiss: () => void
  /** citation link in an answer ([B12](sheetnav://B12)) */
  readonly onCitation: (href: string) => void
  readonly onExpand: () => void
  readonly onCollapse: () => void
}): React.JSX.Element {
  const { t } = useI18n()
  const chatRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const stickToBottomRef = useRef(true)
  const [dragOver, setDragOver] = useState(false)
  const asideRef = useRef<HTMLElement | null>(null)
  const [resizing, setResizing] = useState(false)
  /** data-URL previews for image attachments, keyed by path (Genspark composer thumbnails) */
  const [attachmentPreviews, setAttachmentPreviews] = useState<Record<string, string>>({})
  /** image paths with a read already issued — one readAttachmentImage per attach, even while pending */
  const previewRequestedRef = useRef(new Set<string>())
  useEffect(() => {
    // previews cover the composer plus every image echoed on a sent/history message
    // (history chips re-read the file by its stored path; a deleted file keeps the placeholder)
    const wanted = [
      ...attachments,
      ...chat.flatMap((m) => m.attachments ?? []),
      ...historicChat.flatMap((m) => m.attachments ?? []),
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
      void window.desktopApi
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
  /** Wall-clock start of the current run (aiBusy false→true), drives the elapsed badge */
  const busyStartRef = useRef(0)
  useEffect(() => {
    if (aiBusy) busyStartRef.current = Date.now()
  }, [aiBusy])

  // preferred = the user's chosen width (the only value persisted); the CSS var
  // gets the clamped display width. Deriving the display width from the
  // preference means a transiently small window never permanently shrinks the panel.
  const preferredWidthRef = useRef<number | null>(null)

  // Restore the persisted panel width (the grid column tracks --copilot-width on .sheet-body)
  useEffect(() => {
    if (!isOpen) return
    const saved = loadPanelWidth()
    if (saved === null) return
    preferredWidthRef.current = saved
    const area = asideRef.current?.closest('.sheet-body') as HTMLElement | null
    area?.style.setProperty('--copilot-width', `${clampPanelWidth(saved)}px`)
  }, [isOpen])

  // Re-derive the display width on window resize (max is 60% of the window);
  // growing the window back restores the preferred width
  useEffect(() => {
    if (!isOpen) return
    const onResize = (): void => {
      const area = asideRef.current?.closest('.sheet-body') as HTMLElement | null
      const preferred = preferredWidthRef.current
      if (!area || preferred === null) return
      area.style.setProperty('--copilot-width', `${clampPanelWidth(preferred)}px`)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [isOpen])

  // follow the stream, but stop yanking once the user scrolls up to read
  useEffect(() => {
    if (stickToBottomRef.current) {
      chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight })
    }
  }, [chat, preview])

  const resizeCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => resizeCleanupRef.current?.(), [])

  /** Drag the right edge to resize: the panel is flush with the window's left edge, so width = clientX; the grid transition is disabled while dragging */
  const startResize = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const area = asideRef.current?.closest('.sheet-body') as HTMLElement | null
    if (!area) return
    const resizer = e.currentTarget
    setResizing(true)
    area.style.transition = 'none'
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    let width = 0
    const onMove = (ev: PointerEvent): void => {
      width = clampPanelWidth(ev.clientX)
      preferredWidthRef.current = width
      area.style.setProperty('--copilot-width', `${width}px`)
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
      area.style.transition = ''
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setResizing(false)
      if (width > 0) localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(width)))
    }
    resizeCleanupRef.current = cleanup
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
    // lostpointercapture also fires if the resizer is unmounted mid-drag (panel collapse)
    resizer.addEventListener('lostpointercapture', cleanup)
    resizer.setPointerCapture(e.pointerId)
  }

  const onChatScroll = (): void => {
    const el = chatRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  if (!isOpen) {
    return (
      <aside className="copilot collapsed">
        <button
          className="expand-copilot"
          onClick={onExpand}
          data-tip={t('aiOpenAssistant')}
          aria-label={t('aiOpenAssistant')}
        >
          <GensparkMark size={22} />
        </button>
      </aside>
    )
  }

  const canSend = prompt.trim().length > 0 && !aiBusy

  /** [B12](sheetnav://B12) links in answers jump the grid to the cited range */
  const citationNav = { scheme: SHEET_NAV_SCHEME, onNavigate: onCitation }

  const send = (): void => {
    if (!canSend) return
    stickToBottomRef.current = true
    onSend()
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.desktopApi.getPathForFile(f))
      .filter(Boolean)
    if (paths.length > 0) onAddAttachmentPaths(paths)
  }

  /** Files pasted into the input: ones with a local path go the regular
   * attachment route; pure bitmaps like screenshots are persisted by the host */
  const onPasteFiles = (files: File[]): void => {
    const paths: string[] = []
    for (const f of files) {
      const p = window.desktopApi.getPathForFile(f)
      if (p) {
        paths.push(p)
        continue
      }
      const ext = PASTE_MIME_EXT[f.type] ?? f.name.split('.').pop()?.toLowerCase() ?? 'bin'
      void f.arrayBuffer().then((buf) => onAddPastedImage(buf, ext))
    }
    if (paths.length > 0) onAddAttachmentPaths(paths)
  }

  const stepStrings = (n: number) => ({
    worked: t('aiWorkedSteps', { n }),
    working: t('aiGroupWorking'),
    running: t('aiStepRunning'),
    done: t('aiStepDone'),
    failed: t('aiStepFailed'),
  })

  return (
    <aside
      ref={asideRef}
      className={`copilot${dragOver ? ' ai-panel-dragover' : ''}${resizing ? ' ai-panel-resizing' : ''}`}
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
          (chat.length > 0 || historicChat.length > 0) && {
            label: t('aiNewChat'),
            icon: <Icon name="edit" size={16} />,
            onClick: onNewChat,
          },
          {
            label: t('aiCollapsePanel'),
            icon: <Icon name="sidebar" size={16} />,
            onClick: onCollapse,
          },
        ]}
      />

      <div className="ai-chat" ref={chatRef} onScroll={onChatScroll}>
        {/* Past conversation (read-only transcript), shown continuously with the current turn */}
        {historicChat.length > 0 && (
          <>
            {historicChat.map((entry, i) => (
              <div key={`h${i}`} className="ai-msg-historic">
                <AgentMessage
                  role={entry.role}
                  author={entry.role === 'user' ? t('aiYou') : 'Redrob AI'}
                >
                  {entry.role === 'user' && entry.attachments && entry.attachments.length > 0 && (
                    <SentAttachments atts={entry.attachments} previews={attachmentPreviews} />
                  )}
                  {entry.tools.length > 0 && (
                    <AgentSteps steps={entry.tools} strings={stepStrings(entry.tools.length)} />
                  )}
                  {entry.text && <Markdown text={entry.text} nav={citationNav} />}
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
            title={t(hasContent ? 'aiEmptyTitle' : 'aiEmptyBuildTitle')}
            description={t(hasContent ? 'aiEmptyBodyLine1' : 'aiEmptyBuildBody')}
          />
        )}
        {chat.map((entry, index) =>
          entry.role === 'user' ? (
            <AgentMessage key={index} role="user" author={t('aiYou')}>
              {entry.attachments && entry.attachments.length > 0 && (
                <SentAttachments atts={entry.attachments} previews={attachmentPreviews} />
              )}
              {entry.text}
              {entry.undelivered && (
                <AgentUndelivered
                  message={t('aiUndelivered')}
                  retryLabel={t('aiRetry')}
                  onRetry={
                    aiBusy ? undefined : () => onSend(entry.text, entry.attachments ?? [], index)
                  }
                />
              )}
            </AgentMessage>
          ) : (
            <AgentMessage
              key={index}
              role="assistant"
              author="Redrob AI"
              streaming={!!entry.streaming && !!entry.text && !entry.isError}
            >
              {entry.tools.length > 0 && (
                <AgentSteps steps={entry.tools} strings={stepStrings(entry.tools.length)} />
              )}
              {entry.isError ? (
                // fail-closed: the engine's own message, and sign-in only when auth is the cause
                <AgentFailure
                  title={t('aiFailedTitle')}
                  message={entry.text}
                  action={
                    entry.loginRequired ? (
                      <Button size="sm" onClick={() => void window.desktopApi.aiGskLogin()}>
                        {t('aiGskLoginBtn')}
                      </Button>
                    ) : undefined
                  }
                />
              ) : entry.text ? (
                <Markdown text={entry.text} nav={citationNav} />
              ) : (
                entry.streaming && (
                  <AgentWorking label={entry.tools.length > 0 ? t('aiWorking') : t('aiThinking')} />
                )
              )}
              {entry.autoApplied && (
                <div className="ai-auto-applied">
                  <span className="ai-auto-applied-text">
                    {t('aiAutoApplied', { count: entry.autoApplied.opCount })}
                  </span>
                  {/* undoSteps 0 = the batch exceeded the undo budget and
                      kept no stack entry; a forced 1-step undo would revert
                      the user's own previous action instead. */}
                  {(entry.autoApplied.undoSteps ?? 1) > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      iconLeft={<Icon name="undo" size={14} />}
                      onClick={() => onUndo(Math.max(1, entry.autoApplied?.undoSteps ?? 1))}
                      data-tip={t('aiUndoTitle')}
                    >
                      {t('aiUndo')}
                    </Button>
                  )}
                </div>
              )}
              {!entry.isError && entry.loginRequired && (
                <Button size="sm" onClick={() => void window.desktopApi.aiGskLogin()}>
                  {t('aiGskLoginBtn')}
                </Button>
              )}
            </AgentMessage>
          ),
        )}

        {preview && (
          <div className="ai-preview-card">
            {/* the plan the assistant proposes, before and after, in the kit Changes card */}
            <Changes
              title={t('aiProposedChanges')}
              items={[
                ...preview.structuralChanges.map((change) => ({
                  kind: 'changed' as const,
                  label: t('aiChangeStructure'),
                  after: change.label,
                })),
                ...preview.formatChanges.map((change) => ({
                  kind: 'changed' as const,
                  label: t('aiChangeFormat'),
                  after: change.label,
                })),
                ...preview.cellChanges.slice(0, MAX_PREVIEW_CELL_ROWS).map((change) => ({
                  kind: 'changed' as const,
                  label: change.address,
                  before: formatCell(change.before, t),
                  after: formatCell(change.after, t),
                })),
                ...preview.sheetRenames.map((rename) => ({
                  kind: 'changed' as const,
                  label: t('aiChangeSheet'),
                  before: rename.before,
                  after: rename.after,
                })),
              ]}
              {...(preview.cellChanges.length > MAX_PREVIEW_CELL_ROWS
                ? {
                    summary: t('aiMoreCells', {
                      count: preview.cellChanges.length - MAX_PREVIEW_CELL_ROWS,
                    }),
                  }
                : {})}
            />
            {preview.warnings.map((warning) => (
              <Alert key={warning} tone="warning">
                {warning}
              </Alert>
            ))}
          </div>
        )}
      </div>

      <div className="ai-composer">
        {attachNotice && (
          <Alert tone="info" className="ai-attach-notice">
            {attachNotice}
          </Alert>
        )}
        <AgentComposer
          context={
            (scopeRange !== null || attachments.length > 0) && (
              <>
                {/* Only a deliberate multi-cell selection shows here: it tells the
                    user what "this column / these rows" will resolve to, and the
                    send freezes it so mid-run clicking cannot retarget the run.
                    While that frozen scope is what shows, dropping it could not
                    change the run any more, so the × goes away with it. */}
                {scopeRange !== null && (
                  <div className="ai-scope-row">
                    <span
                      className={`ai-scope-hint${scopeLocked ? ' is-locked' : ''}`}
                      data-tip={t('aiScopeRangeTip')}
                    >
                      {scopeLabel(scopeRange, scopeColumns, t)}
                      {!scopeLocked && (
                        <button
                          type="button"
                          className="ai-scope-clear"
                          onClick={onScopeDismiss}
                          data-tip={t('aiScopeClearTitle')}
                          aria-label={t('aiScopeClearTitle')}
                        >
                          <Icon name="close" size={12} />
                        </button>
                      )}
                    </span>
                  </div>
                )}
                {attachments.length > 0 && (
                  <div className="ai-attachments" onScroll={onAttachmentsScroll}>
                    {attachments.map((attachment) =>
                      ATTACHMENT_IMAGE_EXTS.has(attachment.ext) ? (
                        <span
                          key={attachment.path}
                          className="ai-attachment-thumb"
                          data-tip={attachment.path}
                        >
                          {attachmentPreviews[attachment.path] ? (
                            <img src={attachmentPreviews[attachment.path]} alt={attachment.name} />
                          ) : (
                            <span className="ai-attachment-thumb-pending" aria-hidden>
                              <img src={fileImageIcon} alt="" />
                            </span>
                          )}
                          <button
                            type="button"
                            className="ai-attachment-thumb-remove"
                            onClick={() => onRemoveAttachment(attachment.path)}
                            data-tip={t('aiRemoveAttachment')}
                            aria-label={t('aiRemoveAttachment')}
                          >
                            <Icon name="close" size={12} />
                          </button>
                        </span>
                      ) : (
                        <span
                          key={attachment.path}
                          className="ai-attachment-card"
                          data-tip={attachment.path}
                        >
                          <span className="ai-attachment-card-icon">
                            <AttachmentCardIcon ext={attachment.ext} />
                          </span>
                          <span className="ai-attachment-card-meta">
                            <span className="ai-attachment-card-name">
                              {truncateCardName(attachment.name)}
                            </span>
                            <span className="ai-attachment-card-size">
                              {formatAttachmentSize(attachment.sizeBytes)}
                            </span>
                          </span>
                          <button
                            type="button"
                            className="ai-attachment-thumb-remove"
                            onClick={() => onRemoveAttachment(attachment.path)}
                            data-tip={t('aiRemoveAttachment')}
                            aria-label={t('aiRemoveAttachment')}
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
          value={prompt}
          busy={aiBusy}
          placeholder={t(hasContent ? 'aiComposerPlaceholder' : 'aiComposerPlaceholderBuild')}
          label={t('aiInstructionAria')}
          sendLabel={t('aiSend')}
          stopLabel={t('aiStop')}
          leading={
            <IconButton size="sm" label={t('aiAttachTitle')} onClick={onPickAttachments}>
              <Icon name="attachment" size={16} />
            </IconButton>
          }
          textareaRef={inputRef}
          onChange={onPromptChange}
          onSend={send}
          onStop={onStop}
          onPasteFiles={onPasteFiles}
        />
      </div>
    </aside>
  )
}

const MAX_PREVIEW_CELL_ROWS = 50

function formatCell(
  cell: { readonly value: unknown; readonly formula?: string | undefined },
  t: TFunc,
): string {
  if (cell.formula) return cell.formula
  if (cell.value === null) return t('aiCellEmpty')
  return String(cell.value)
}
