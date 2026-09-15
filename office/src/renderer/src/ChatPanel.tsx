import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "@redrob/ui";
import type {
  ArtifactKind,
  ArtifactView,
  ChannelEventView,
  ChatAttachment,
  ChatMessage,
  ChatSessionSummaryView,
  ChatStreamEvent,
  DocDiffView,
  FloorChannel,
  FloorSnapshotView,
  PageFetchResult,
  TeamMemberView,
  WebSearchHit,
  TaskApprovalRequestView,
} from "../../shared/office-api";
import { extractArtifactsFromAssistantText } from "./chat-artifacts";
import {
  deriveChatTitleFromUser,
  heuristicChatTitle,
  sanitizeGeneratedTitle,
} from "./chat-title";
import { PanelResizeHandle, usePanelWidths } from "./panel-widths";
import { resolveWebSearchQuery, shouldAutoWebSearch } from "./chat-web-search";
import { foldSourceRuns, type SourceGroup } from "./chat-sources";
import {
  answersPendingAsk,
  apologisedForDesktop,
  asksForClarification,
  claimedDesktopWork,
  isCapabilityApology,
  mergePendingAsk,
  promisedDesktopWork,
  shouldAutoComputerUse,
  type PendingDesktopAsk,
} from "./chat-computer-use";
import { extractHttpsUrls } from "./chat-urls";
import { nowIso, nowMs } from "./clock";
import { parseDirective, type ParsedDirective } from "./floor-directive";
import { BrandLogo } from "./BrandLogo";
import { MemberAvatar } from "./MemberAvatar";
import { ChatSessionsPanel, type ChatRow } from "./ChatSessionsPanel";
import { chatNavBridge } from "./chat-nav-bridge";
import { announceOutOfCredit } from "./credit-bridge";
import { ChannelEventBlock } from "./ChannelEventBlocks";
import { AddTeammateDialog } from "./TeammateCard";
import { ChatPaneBar, ChatSidePanel, type ChatPaneFile } from "./ChatSidePanel";
import { toggleChatPane, type ChatPane, type ChatPaneTab } from "./chat-pane";
import { useTheme } from "./theme";
import {
  CheckIcon,
  ChevronDownIcon,
  GlobeIcon,
  HashIcon,
  LinkIcon,
  MicIcon,
  PaperclipIcon,
  PencilIcon,
  RefreshIcon,
  StarIcon,
  XIcon,
} from "./icons";
import { MarkdownBody } from "./MarkdownBody";
import { LoadingBlock, Spinner } from "./Spinner";
import { VoiceStatus, WhisperInstallDialog } from "./VoiceCapture";
import { asrErrorMessage, useVoiceDictation } from "./use-voice-dictation";
import {
  Composer,
  ComposerAction,
  type ComposerHandle,
  type MentionItem,
} from "./Composer";
import { onChatDraft, takePendingChatDraft } from "./chat-draft";
import {
  setWebSearchEnabled,
  syncWebSearch,
  useWebSearchEnabled,
} from "./web-search-setting";
import {
  attachmentsContext,
  attachmentsFromFiles,
  MAX_ATTACHMENTS,
  mergeAttachments,
} from "./attach-files";
import { AttachmentChips } from "./AttachmentChips";
import { DocumentWorkspace } from "./document-workspace";
import { isSubmitHotkey } from "./submit-hotkey";
import { runtimeAlertLabel } from "./schema-label";
import { AsrSetupCard } from "./AsrSetupCard";
import {
  GENERAL_CHANNEL_ID,
  channelIdOfSession,
  dmChannelIdOf,
  dmMemberOfSession,
  dmSessionId,
  roomSessionId,
  sessionBelongsToChannel,
} from "../../shared/chat-session-id";

const ASSISTANT_MEMBER_ID = "assistant";

/**
 * The transcript a room reads back.
 *
 * A room's chat is stored under the room's own address. Chats from before
 * rooms were chats have generated ids and all belong to #general, so the
 * newest of those is what #general opens rather than a blank page beside its
 * own history.
 */
function sessionIdOfChannelIn(
  sessions: readonly ChatSessionSummaryView[],
  channelId: string,
): string {
  const own = roomSessionId(channelId);
  if (sessions.some((session) => session.id === own)) return own;
  const legacy = sessions
    .filter((session) => channelIdOfSession(session.id) === channelId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return legacy?.id ?? own;
}

const HISTORY_COLLAPSED_KEY = "redrob.chat.historyCollapsed.v1";

function readHistoryCollapsed(): boolean {
  try {
    return localStorage.getItem(HISTORY_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Reply latency for the UI: one decimal, trailing `.0` dropped. */
function formatLatencySeconds(ms: number): string {
  const seconds = Math.round(Math.max(0, ms) / 100) / 10;
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1);
}


/** Quiet laptop mics often sit at ~0.001–0.01 peak — boost before Whisper/VAD. */
/** Whisper expects 16 kHz; Chromium often captures at 44.1/48 kHz. */
function hasCloudKey(
  providers: Record<string, { apiKey?: string } | undefined>,
): boolean {
  return Boolean(providers["openai"]?.apiKey?.trim());
}

type ChatArtifactRef = {
  id: string;
  title: string;
  kind: ArtifactKind;
};

/** One tool step in the live run strip / the folded run summary. */
type UiStep = {
  id: string;
  name: string;
  /** Present-tense while running, past-tense once done. */
  present: string;
  past: string;
  status: "start" | "done";
  ok?: boolean;
  /** A sub-line under the tool above it (a flow's own progress). */
  nested?: boolean;
};

type UiMessage =
  | {
      id: string;
      kind: "chat";
      role: "user" | "assistant";
      content: string;
      /** Tool steps this turn ran, folded under "Worked" once it settles. */
      steps?: UiStep[];
      /**
       * The id of this line's event in the channel's shared log, kept on user
       * bubbles so a regenerate can prune the log back to exactly this line.
       * Without it the superseded replies return on the next poll after a
       * refresh and re-corrupt the saved chat.
       */
      channelEventId?: string;
      /**
       * The teammate who said it, when somebody other than the default
       * assistant did. A group chat where every answer is signed "Redrob" hides
       * the one thing a group chat is for.
       */
      authorId?: string;
      /** ISO-8601 client clock when the bubble was created. */
      at?: string;
      /** End-to-end reply latency for assistant bubbles. */
      timingMs?: number;
      thinking?: boolean;
      /** Provider chain-of-thought when exposed. */
      reasoning?: string;
      attachments?: Array<{ name: string; truncated?: boolean }>;
      links?: Array<{ url: string; title: string }>;
      /** Documents promoted to the right-hand artifact pane. */
      artifacts?: ChatArtifactRef[];
      /** Screenshots and recordings the task produced while it worked. */
      media?: Array<{ path: string; kind: "image" | "video"; tool: string }>;
      /**
       * Answers offered as one click, when the turn ended in a question. A run
       * that stops on "which of these people did you mean" should not make
       * somebody retype a name it already read off the screen.
       */
      options?: string[];
    }
  | {
      id: string;
      kind: "sources";
      query: string;
      results: WebSearchHit[];
      blocked?: boolean;
    }
  | {
      id: string;
      kind: "pages";
      pages: Array<{ url: string; title: string; blocked?: boolean }>;
    }
  | {
      id: string;
      kind: "channel-event";
      event: ChannelEventView;
    };

type ChatBubble = Extract<UiMessage, { kind: "chat" }>;

/** One row in the live/settled step list: an icon and the sentence. */
function StepRow({ step }: { step: UiStep }): JSX.Element {
  const text = step.status === "start" ? step.present : step.past;
  return (
    <li
      className={`flex items-start gap-2 ${
        step.nested ? "pl-6 text-gray-500 dark:text-gray-400" : "text-gray-700 dark:text-gray-200"
      }`}
    >
      <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center">
        {step.nested ? (
          <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
        ) : step.status === "start" ? (
          <Spinner className="h-3.5 w-3.5" />
        ) : step.ok === false ? (
          <XIcon className="h-3.5 w-3.5 text-destructive-ink" />
        ) : (
          <CheckIcon className="h-3.5 w-3.5 text-success-ink" />
        )}
      </span>
      <span className="min-w-0 leading-snug">{text}</span>
    </li>
  );
}

/** The live run strip: every step this turn has taken so far. */
function StepList({ steps }: { steps: UiStep[] }): JSX.Element | null {
  if (steps.length === 0) return null;
  return (
    <ul className="mb-1 space-y-1 text-[0.8125rem]">
      {steps.map((step) => (
        <StepRow key={step.id} step={step} />
      ))}
    </ul>
  );
}

/**
 * A settled turn's steps, folded to one "Worked" line that opens on click —
 * OpenWork's move so a long run does not bury the answer under its own log.
 */
function WorkedFold({
  steps,
  t,
}: {
  steps: UiStep[];
  t: (key: string, vars?: Record<string, string | number>) => string;
}): JSX.Element | null {
  const real = steps.filter((step) => !step.nested);
  if (real.length === 0) return null;
  return (
    <details className="chat-reasoning mb-1">
      <summary className="chat-reasoning-summary">
        {t("chat.workedSteps", { count: real.length })}
      </summary>
      <ul className="mt-1 space-y-1 text-[0.8125rem]">
        {steps.map((step) => (
          <StepRow key={step.id} step={{ ...step, status: "done" }} />
        ))}
      </ul>
    </details>
  );
}

function persistableMessages(items: UiMessage[]): UiMessage[] {
  return items
    .filter((item) => item.kind !== "channel-event")
    .map((item) => {
      // Screenshots are for the model, not the transcript.
      if (item.kind === "chat" && item.media) {
        const { media: _media, ...rest } = item;
        return rest;
      }
      return item;
    });
}

function deriveChatTitle(items: UiMessage[]): string {
  const first = items.find((m) => m.kind === "chat" && m.role === "user");
  if (!first || first.kind !== "chat") return "";
  return deriveChatTitleFromUser(first.content);
}

function parseStoredMessages(raw: unknown[]): UiMessage[] {
  const out: UiMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    if (
      m.kind === "chat" &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string"
    ) {
      const msg: Extract<UiMessage, { kind: "chat" }> = {
        id: typeof m.id === "string" ? m.id : `chat-${out.length + 1}`,
        kind: "chat",
        role: m.role,
        content: m.content,
      };
      if (typeof m.channelEventId === "string")
        msg.channelEventId = m.channelEventId;
      if (typeof m.authorId === "string") msg.authorId = m.authorId;
      if (typeof m.at === "string") msg.at = m.at;
      if (typeof m.timingMs === "number") msg.timingMs = m.timingMs;
      if (typeof m.thinking === "boolean") msg.thinking = m.thinking;
      if (typeof m.reasoning === "string") msg.reasoning = m.reasoning;
      if (Array.isArray(m.attachments)) {
        msg.attachments = m.attachments.filter(
          (a): a is { name: string; truncated?: boolean } =>
            Boolean(a) &&
            typeof a === "object" &&
            typeof (a as { name?: unknown }).name === "string",
        );
      }
      if (Array.isArray(m.links)) {
        msg.links = m.links.filter(
          (l): l is { url: string; title: string } =>
            Boolean(l) &&
            typeof l === "object" &&
            typeof (l as { url?: unknown }).url === "string" &&
            typeof (l as { title?: unknown }).title === "string",
        );
      }
      if (Array.isArray(m.artifacts)) {
        msg.artifacts = m.artifacts.filter(
          (a): a is ChatArtifactRef =>
            Boolean(a) &&
            typeof a === "object" &&
            typeof (a as { id?: unknown }).id === "string" &&
            typeof (a as { title?: unknown }).title === "string" &&
            typeof (a as { kind?: unknown }).kind === "string",
        );
      }
      out.push(msg);
      continue;
    }
    if (
      m.kind === "sources" &&
      typeof m.query === "string" &&
      Array.isArray(m.results)
    ) {
      out.push({
        id: typeof m.id === "string" ? m.id : `s-${out.length + 1}`,
        kind: "sources",
        query: m.query,
        results: m.results as WebSearchHit[],
        ...(m.blocked ? { blocked: true as const } : {}),
      });
      continue;
    }
    if (m.kind === "pages" && Array.isArray(m.pages)) {
      out.push({
        id: typeof m.id === "string" ? m.id : `p-${out.length + 1}`,
        kind: "pages",
        pages: m.pages as Array<{
          url: string;
          title: string;
          blocked?: boolean;
        }>,
      });
    }
  }
  return out;
}

function maxMsgOrdinal(items: UiMessage[]): number {
  let max = 0;
  for (const m of items) {
    const match = /-(\d+)$/.exec(m.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max;
}

function clientTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Screenshots a tool produced this turn, shown inline in the assistant bubble.
 *
 * The renderer cannot read arbitrary files, so each path is loaded through
 * `readLocalMedia` (which allowlists the capture folder) into a data URL. This
 * is what puts the browser's set-of-marks screenshot into the conversation, so
 * a person sees what the agent saw without switching windows.
 */
/**
 * A screenshot at full size, over the transcript.
 *
 * The inline thumbnail is capped at 16rem tall, which is enough to see that
 * the agent took a picture and not enough to read anything in it. Clicking one
 * used to hand a data URL to a new tab; this keeps it in the app, where Escape
 * and a click outside both close it.
 */
function MediaViewer({
  src,
  alt,
  closeLabel,
  onClose,
}: {
  src: string;
  alt: string;
  closeLabel: string;
  onClose: () => void;
}): JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute right-4 top-4 rounded bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
        onClick={onClose}
      >
        {closeLabel}
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-full max-w-full object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

function ToolMediaImages({
  media,
}: {
  media: ReadonlyArray<{ path: string; kind: "image" | "video"; tool: string }>;
}): JSX.Element | null {
  const { t } = useI18n();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(
    null,
  );
  const items = useMemo(
    () => media.filter((item) => item.kind === "image" || item.kind === "video"),
    [media],
  );
  useEffect(() => {
    let live = true;
    void (async () => {
      const next: Record<string, string> = {};
      for (const item of items) {
        try {
          const loaded = await window.office.readLocalMedia(item.path);
          if (loaded?.dataUrl) next[item.path] = loaded.dataUrl;
        } catch {
          /* skip media that cannot be read */
        }
      }
      if (live) setUrls(next);
    })();
    return () => {
      live = false;
    };
  }, [items]);
  const shown = items.filter((item) => urls[item.path]);
  if (shown.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {shown.map((item, index) => {
        const alt = t("chat.screenshotOf", { tool: item.tool });
        return item.kind === "video" ? (
          <video
            key={`${item.path}-${index}`}
            src={urls[item.path]}
            controls
            className="max-h-64 w-auto max-w-full rounded border border-gray-200 dark:border-gray-700"
          />
        ) : (
          <button
            key={`${item.path}-${index}`}
            type="button"
            title={t("chat.screenshotExpand")}
            aria-label={t("chat.screenshotExpand")}
            className="block overflow-hidden rounded border border-gray-200 transition-colors hover:border-gray-400 dark:border-gray-700 dark:hover:border-gray-500"
            onClick={() => setZoomed({ src: urls[item.path]!, alt })}
          >
            <img
              src={urls[item.path]}
              alt={alt}
              className="max-h-64 w-auto max-w-full object-contain"
            />
          </button>
        );
      })}
      {zoomed ? (
        <MediaViewer
          src={zoomed.src}
          alt={zoomed.alt}
          closeLabel={t("chat.screenshotClose")}
          onClose={() => setZoomed(null)}
        />
      ) : null}
    </div>
  );
}

function formatBubbleTime(
  iso: string | undefined,
  locale: string,
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const tag = locale === "ko" ? "ko-KR" : "en-US";
  try {
    return new Intl.DateTimeFormat(tag, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/** How close two messages from one author have to be to read as one turn. */
const GROUP_WINDOW_MS = 5 * 60_000;

/**
 * Whether this message continues the one above it, the way Slack drops the
 * avatar and name off a second line from the same person.
 */
function groupedWithPrevious(
  list: readonly UiMessage[],
  message: UiMessage,
): boolean {
  const index = list.indexOf(message);
  const previous = index > 0 ? list[index - 1] : undefined;
  if (!previous || previous.kind !== "chat" || message.kind !== "chat") {
    return false;
  }
  if (previous.role !== message.role) return false;
  if ((previous.authorId ?? "") !== (message.authorId ?? "")) return false;
  const before = previous.at ? Date.parse(previous.at) : NaN;
  const after = message.at ? Date.parse(message.at) : NaN;
  if (Number.isNaN(before) || Number.isNaN(after)) return true;
  return after - before < GROUP_WINDOW_MS;
}

/**
 * One line of a channel transcript, laid out the way Slack lays one out: an
 * avatar gutter, the author over the text, and the row's own controls appearing
 * on hover. Bubbles put every reply in its own island; a transcript is a column.
 */
function SlackRow({
  name,
  subtitle,
  stamp,
  at,
  avatar,
  actions,
  grouped,
  children,
}: {
  name: string;
  subtitle?: string;
  stamp: string | null;
  at?: string | undefined;
  avatar: ReactNode;
  actions: ReactNode;
  grouped: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      className={`group relative flex w-full gap-3 px-4 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800/60 ${
        grouped ? "py-0.5" : "pb-1 pt-3"
      }`}
    >
      <div className="w-8 shrink-0">
        {grouped ? (
          <time
            dateTime={at}
            className="mt-1 hidden text-[0.625rem] tabular-nums text-gray-600 group-hover:block dark:text-gray-400"
          >
            {stamp?.slice(-5)}
          </time>
        ) : (
          avatar
        )}
      </div>
      <div className="min-w-0 flex-1">
        {grouped ? null : (
          <div className="mb-0.5 flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-bold text-gray-900 dark:text-gray-100">
              {name}
            </span>
            {subtitle ? (
              <span className="min-w-0 truncate text-[0.6875rem] text-gray-600 dark:text-gray-400">
                {subtitle}
              </span>
            ) : null}
            {stamp ? (
              <time
                dateTime={at}
                className="shrink-0 text-[0.6875rem] tabular-nums text-gray-600 dark:text-gray-400"
              >
                {stamp}
              </time>
            ) : null}
          </div>
        )}
        {children}
      </div>
      {actions ? (
        <div className="absolute -top-3 right-2 hidden items-center gap-1 rounded border border-gray-300 bg-white p-0.5 shadow-sm group-hover:flex focus-within:flex dark:border-gray-700 dark:bg-gray-900">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

function mergeContextBlocks(
  ...blocks: Array<string | undefined>
): string | undefined {
  const joined = blocks
    .map((b) => b?.trim())
    .filter((b): b is string => Boolean(b))
    .join("\n\n");
  return joined || undefined;
}

/**
 * The four openers on an empty chat, each with the room it opens.
 *
 * Starting work is starting a room for it, the way Slack does: the card makes
 * `#rejection-email` with Redrob in it rather than a private word with Redrob.
 */
const SUGGESTIONS = [
  { text: "chat.suggestion1", room: "chat.suggestionRoom1" },
  { text: "chat.suggestion2", room: "chat.suggestionRoom2" },
  { text: "chat.suggestion3", room: "chat.suggestionRoom3" },
  { text: "chat.suggestion4", room: "chat.suggestionRoom4" },
] as const;

export function ChatPanel({
  variant = "embedded",
  hideSidebar = false,
  onOpenSettings,
}: {
  variant?: "page" | "embedded";
  hideSidebar?: boolean;
  /** Prefer opening Settings → Models (cloud keys / routing). */
  onOpenSettings?: (section?: "models") => void;
}): JSX.Element {
  const { t, locale } = useI18n();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  // The words live in the editor; the panel only tracks whether there are any,
  // so the send button and the voice affordances know what to show.
  const [draftEmpty, setDraftEmpty] = useState(true);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<
    "idle" | "fetching" | "searching" | "answering"
  >("idle");
  const [streaming, setStreaming] = useState("");
  const streamingRef = useRef("");
  const [streamingReasoning, setStreamingReasoning] = useState("");
  const streamingReasoningRef = useRef("");
  /** Pending frame that paints whatever the stream refs hold. */
  const paintRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [challengePending, setChallengePending] = useState(false);
  const [lastSearchQuery, setLastSearchQuery] = useState<string | null>(null);
  const [backend, setBackend] = useState<string | null>(null);
  const [cpuSlow, setCpuSlow] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  // Persisted rather than component state, because the office floor honours the
  // same switch and had no way to read it while it lived here.
  const webSearch = useWebSearchEnabled();
  const [computerUse, setComputerUse] = useState(true);
  /** Overrides the "this CPU is too slow to transcribe" guard. */
  const [voiceForce, setVoiceForce] = useState(false);
  /** The teammate this turn was addressed to, so the live bubble wears a face. */
  const [replyingMemberId, setReplyingMemberId] = useState<string | null>(null);
  const taskRunIdRef = useRef<string | null>(null);
  /** A desktop run is in flight, whether or not the toggle asked for one. */
  const [desktopRunning, setDesktopRunning] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  /**
   * Whether this chat was just asked for, which is when the openers are shown.
   *
   * A blank page is only a prompt for one on the way in: the first launch, or
   * the chat the button just made. An old room that happens to be quiet is a
   * room you already know what you wanted from.
   */
  const [freshChat, setFreshChat] = useState(false);
  const [sessionList, setSessionList] = useState<ChatSessionSummaryView[]>([]);
  const [historyCollapsed, setHistoryCollapsed] =
    useState(readHistoryCollapsed);
  const historyPanels = usePanelWidths("chat-history", {
    pane: { default: 268, min: 208, max: 400 },
  });
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [activeArtifact, setActiveArtifact] = useState<ArtifactView | null>(
    null,
  );
  /** Files announced by tools during the current turn, attached to its reply. */
  const turnArtifactsRef = useRef<ChatArtifactRef[]>([]);
  const turnArtifactJobsRef = useRef<Array<Promise<void>>>([]);
  const [artifactLoading, setArtifactLoading] = useState(false);
  const artifactPanels = usePanelWidths("chat-artifact", {
    pane: { default: 420, min: 300, max: 720, edge: "start" },
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [needsSessionReset, setNeedsSessionReset] = useState(false);
  const sessionIdRef = useRef(roomSessionId(GENERAL_CHANNEL_ID));
  const [activeSessionId, setActiveSessionId] = useState(
    () => sessionIdRef.current,
  );
  const sessionListRef = useRef<ChatSessionSummaryView[]>([]);
  const titleJobRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  /** A desktop run that stopped to ask something; the next turn answers it. */
  const pendingDesktopAskRef = useRef<PendingDesktopAsk | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const composerRef = useRef<ComposerHandle | null>(null);
  /** The step waiting on an answer, asked here rather than in the Office. */
  const [approval, setApproval] = useState<TaskApprovalRequestView | null>(
    null,
  );
  /** What this run has shown so far, so it appears as it happens. */
  const msgIdRef = useRef(0);
  const wipeEpochRef = useRef(0);
  const [teamMembers, setTeamMembers] = useState<TeamMemberView[]>([]);
  const [addingTeammate, setAddingTeammate] = useState(false);
  // The built-in assistant is Redrob everywhere it is named or worn.
  const adoptMembers = useCallback(
    (rows: TeamMemberView[]): void =>
      setTeamMembers(
        rows.map((row) =>
          row.builtin ? { ...row, name: t("chat.model") } : row,
        ),
      ),
    [t],
  );
  const [streamingTools, setStreamingTools] = useState("");
  const streamingToolsRef = useRef("");
  /** Live tool steps, rendered as OpenWork-style sentences with icons. */
  const [streamingSteps, setStreamingSteps] = useState<UiStep[]>([]);
  const streamingStepsRef = useRef<UiStep[]>([]);
  const setSteps = (next: UiStep[]): void => {
    streamingStepsRef.current = next;
    setStreamingSteps(next);
  };
  const seenEventIdsRef = useRef(new Set<string>());
  /**
   * The next read of the channel log is a baseline rather than new lines. Set
   * whenever a different transcript is put on screen, because that transcript
   * already holds everything said before it was opened.
   */
  const seedEventsRef = useRef(true);
  const channelIdRef = useRef(GENERAL_CHANNEL_ID);
  const [channelId, setChannelId] = useState(GENERAL_CHANNEL_ID);
  const [channels, setChannels] = useState<FloorChannel[]>([]);
  const channelsRef = useRef<FloorChannel[]>([]);
  channelsRef.current = channels;
  /** What the right-hand pane is showing, or nothing when it is closed. */
  const [pane, setPane] = useState<ChatPane | null>(null);
  /**
   * The transcript that came off disk, which must not be written straight back.
   * Saving it would move the chat to the top of the sidebar for having been
   * read. Held by identity rather than as a flag so the first real edit after
   * opening a conversation still saves, including in an empty new chat.
   */
  const skipSaveForRef = useRef<UiMessage[] | null>(null);
  /**
   * Set when a whole transcript is swapped in rather than added to. Opening a
   * chat should land at the newest line, not animate the reader down through
   * every message in it.
   */
  const jumpToBottomRef = useRef(true);

  function nextMsgId(prefix: string): string {
    msgIdRef.current += 1;
    return `${prefix}-${msgIdRef.current}`;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [sessions, snapshot] = await Promise.all([
          window.office.listChatSessions(),
          window.office.floorSnapshot(),
        ]);
        if (cancelled) return;
        // Channel delete clears the Floor log, but chat_sessions is a second
        // store. Orphans from a deleted room used to reopen on hard refresh
        // and look like they belonged to whichever chat was left.
        const knownRooms = new Set(
          snapshot.channels
            .filter((room) => !room.isDM)
            .map((room) => room.id),
        );
        knownRooms.add(GENERAL_CHANNEL_ID);
        const living: ChatSessionSummaryView[] = [];
        for (const session of sessions) {
          const room = channelIdOfSession(session.id);
          if (room.startsWith("dm-") || knownRooms.has(room)) {
            living.push(session);
            continue;
          }
          await window.office.deleteChatSession(session.id).catch(() => undefined);
        }
        if (cancelled) return;
        setSessionList(living);
        const latest = living[0];
        if (!latest) {
          // Nothing has ever been said here: this is somebody's first look at
          // the product, and the openers are what it opens with.
          setFreshChat(true);
          setHistoryReady(true);
          return;
        }
        const full = await window.office.getChatSession(latest.id);
        if (cancelled || !full) {
          setHistoryReady(true);
          return;
        }
        const restored = parseStoredMessages(full.messages);
        sessionIdRef.current = full.id;
        setActiveSessionId(full.id);
        msgIdRef.current = maxMsgOrdinal(restored);
        skipSaveForRef.current = restored;
        channelIdRef.current = channelIdOfSession(full.id);
        setChannelId(channelIdRef.current);
        setMessages(restored);
        setNeedsSessionReset(true);
        stickToBottomRef.current = true;
        jumpToBottomRef.current = true;
      } catch {
        // Ignore restore failures — start with an empty chat.
      } finally {
        if (!cancelled) setHistoryReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    sessionListRef.current = sessionList;
  }, [sessionList]);

  /**
   * Closing the side pane hands the keyboard back to the conversation.
   *
   * Whatever was focused in the pane goes away with it, and the browser drops
   * focus on <body>, where keystrokes land nowhere: looking at a teammate and
   * coming back left the composer looking frozen until it was clicked.
   */
  const paneWasOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = paneWasOpenRef.current;
    paneWasOpenRef.current = pane !== null;
    if (wasOpen && pane === null) composerRef.current?.focus();
  }, [pane]);

  /**
   * A request written elsewhere in the app (Workflows offering to run a flow
   * here, Research starters) arrives as a draft rather than a sent message:
   * the person reads it, edits it, and presses send.
   */
  useEffect(() => {
    const apply = (text: string): void => {
      composerRef.current?.setText(text);
      composerRef.current?.focus();
    };
    const pending = takePendingChatDraft();
    if (pending) apply(pending);
    return onChatDraft((text) => {
      takePendingChatDraft();
      apply(text);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const members = await window.office.listTeamMembers();
        if (!cancelled) adoptMembers(members);
      } catch {
        if (!cancelled) setTeamMembers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Who is in this room, which the pane reads and the composer needs to know
  // before `@` can offer anybody.
  useEffect(() => {
    let cancelled = false;
    const apply = (snapshot: FloorSnapshotView): void => {
      if (cancelled) return;
      setChannels(snapshot.channels);
    };
    void window.office
      .floorSnapshot()
      .then(apply)
      .catch(() => undefined);
    const off = window.office.onFloorUpdate(apply);
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  const ingestChannelEvents = useCallback(async () => {
    try {
      const rows = await window.office.channelEvents(channelIdRef.current, 0);
      // Every chat in a room shares that room's event log, so a conversation
      // that was just opened or started takes what is already there as its
      // starting point. Without this, a new chat in #general filled itself
      // with the transcript of the chat before it.
      if (seedEventsRef.current) {
        seedEventsRef.current = false;
        for (const row of rows) seenEventIdsRef.current.add(row.id);
        return;
      }
      const fresh = rows.filter((row) => !seenEventIdsRef.current.has(row.id));
      if (fresh.length === 0) return;
      for (const row of fresh) seenEventIdsRef.current.add(row.id);
      // Progress ("이장훈 찾아보는 중") stays off the transcript. The answer
      // is what the reader came for; the machinery underneath is noise.
      setMessages((prev) => {
        let next = prev;
        for (const event of fresh) {
          if (event.type === "progress") {
            continue;
          }
          if (
            event.type === "delegate" ||
            event.type === "approval" ||
            event.type === "artifact" ||
            event.type === "system"
          ) {
            next = [
              ...next,
              {
                id: event.id,
                kind: "channel-event" as const,
                event,
              },
            ];
            continue;
          }
          if (
            event.type === "message" &&
            event.payload["role"] === "assistant"
          ) {
            const text = String(event.payload["text"] ?? "").trim();
            if (!text) continue;
            const already = next.some(
              (item) =>
                item.kind === "chat" &&
                item.role === "assistant" &&
                item.content.trim() === text,
            );
            if (already) continue;
            next = [
              ...next,
              {
                id: nextMsgId("a"),
                kind: "chat" as const,
                role: "assistant" as const,
                content: text,
                authorId: event.authorId,
                at: nowIso(),
              },
            ];
          }
        }
        return next;
      });
    } catch {
      /* ignore poll failures */
    }
  }, []);

  useEffect(() => {
    void ingestChannelEvents();
    const timer = window.setInterval(() => {
      void ingestChannelEvents();
    }, 1_200);
    const off = window.office.onFloorUpdate(() => {
      void ingestChannelEvents();
    });
    return () => {
      window.clearInterval(timer);
      off();
    };
  }, [ingestChannelEvents]);

  useEffect(() => {
    return window.office.onLocalDataWiped(() => {
      wipeEpochRef.current += 1;
      void window.office
        .abortTask(taskRunIdRef.current ?? undefined)
        .catch(() => undefined);
      taskRunIdRef.current = null;
      void window.office.closeWebSearch().catch(() => undefined);
      voice.abandon();
      sessionIdRef.current = roomSessionId(GENERAL_CHANNEL_ID);
      setActiveSessionId(sessionIdRef.current);
      setSessionList([]);
      msgIdRef.current = 0;
      setNeedsSessionReset(true);
      setMessages([]);
      setStreaming("");
      streamingRef.current = "";
      setStreamingReasoning("");
      streamingReasoningRef.current = "";
      streamingToolsRef.current = "";
      setStreamingTools("");
      setSteps([]);
      seenEventIdsRef.current = new Set();
      seedEventsRef.current = true;
      channelIdRef.current = GENERAL_CHANNEL_ID;
      setChannelId(GENERAL_CHANNEL_ID);
      setPane(null);
      jumpToBottomRef.current = true;
      void window.office
        .listTeamMembers()
        .then(adoptMembers)
        .catch(() => setTeamMembers([]));
      setError(null);
      setSearchNotice(null);
      setChallengePending(false);
      setLastSearchQuery(null);
      composerRef.current?.clear();
      setAttachments([]);
      setEditingUserId(null);
      setEditDraft("");
      setPhase("idle");
      closeArtifactPane();
      inFlightRef.current = false;
      titleJobRef.current = null;
      // A wipe puts the product back to its first day, openers and all.
      setFreshChat(true);
      setHistoryReady(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- wipe hard-reset once
  }, []);

  useEffect(() => {
    if (!historyReady || busy) return;
    if (messages.length === 0) return;
    if (skipSaveForRef.current === messages) return;
    const epoch = wipeEpochRef.current;
    const timer = window.setTimeout(() => {
      if (epoch !== wipeEpochRef.current) return;
      void window.office
        .saveChatSession({
          id: sessionIdRef.current,
          title: deriveChatTitle(messages) || t("chat.untitled"),
          messages: persistableMessages(messages),
        })
        .then((saved) => {
          if (epoch !== wipeEpochRef.current) return;
          setSessionList((prev) => {
            const next = prev.filter((s) => s.id !== saved.id);
            return [saved, ...next].sort((a, b) => {
              if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
              return b.updatedAt.localeCompare(a.updatedAt);
            });
          });
        })
        .catch(() => undefined);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [messages, historyReady, busy, t]);

  const openArtifactPane = useCallback(async (id: string): Promise<void> => {
    setActiveArtifactId(id);
    setPane({ kind: "artifact", artifactId: id });
    setArtifactLoading(true);
    try {
      const full = await window.office.getArtifact(id);
      setActiveArtifact(full);
    } catch {
      setActiveArtifact(null);
    } finally {
      setArtifactLoading(false);
    }
  }, []);

  function closeArtifactPane(): void {
    setActiveArtifactId(null);
    setActiveArtifact(null);
    setPane((prev) => (prev?.kind === "artifact" ? null : prev));
  }

  async function materializeArtifacts(text: string): Promise<{
    displayText: string;
    artifacts: ChatArtifactRef[];
  }> {
    const extracted = extractArtifactsFromAssistantText(text);
    if (extracted.artifacts.length === 0) {
      return { displayText: extracted.displayText, artifacts: [] };
    }
    const refs: ChatArtifactRef[] = [];
    for (const item of extracted.artifacts) {
      try {
        const saved = await window.office.createArtifact({
          title: item.title,
          body: item.body,
          kind: item.kind,
          format: item.format,
        });
        refs.push({ id: saved.id, title: saved.title, kind: saved.kind });
      } catch {
        /* ignore individual failures */
      }
    }
    return { displayText: extracted.displayText, artifacts: refs };
  }

  async function refreshSessionList(): Promise<void> {
    try {
      setSessionList(await window.office.listChatSessions());
    } catch {
      /* ignore */
    }
  }

  async function persistCurrentSession(items: UiMessage[]): Promise<void> {
    if (items.length === 0) return;
    // Same transcript as the one we just loaded: do not rewrite disk / bump
    // updatedAt, or switching rooms walks the previous chat to the top.
    if (skipSaveForRef.current === items) return;
    try {
      const saved = await window.office.saveChatSession({
        id: sessionIdRef.current,
        title: deriveChatTitle(items) || t("chat.untitled"),
        messages: persistableMessages(items),
      });
      setSessionList((prev) => {
        const next = prev.filter((s) => s.id !== saved.id);
        return [saved, ...next].sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return b.updatedAt.localeCompare(a.updatedAt);
        });
      });
    } catch {
      /* ignore */
    }
  }

  /** Everything that has to be true after a different conversation is loaded. */
  function adoptTranscript(sessionId: string, restored: UiMessage[]): void {
    sessionIdRef.current = sessionId;
    setActiveSessionId(sessionId);
    msgIdRef.current = maxMsgOrdinal(restored);
    skipSaveForRef.current = restored;
    channelIdRef.current = channelIdOfSession(sessionId);
    setChannelId(channelIdRef.current);
    seenEventIdsRef.current = new Set();
    seedEventsRef.current = true;
    setMessages(restored);
    setStreaming("");
    streamingRef.current = "";
    setStreamingReasoning("");
    streamingReasoningRef.current = "";
    streamingToolsRef.current = "";
    setStreamingTools("");
    setSteps([]);
    setReplyingMemberId(null);
    setNeedsSessionReset(true);
    setError(null);
    setSearchNotice(null);
    setPhase("idle");
    setEditingUserId(null);
    setEditDraft("");
    closeArtifactPane();
    setPane(null);
    stickToBottomRef.current = true;
    jumpToBottomRef.current = true;
  }

  /**
   * The one-to-one chat with a teammate, opened from the DM list.
   *
   * The room is created the first time it is opened, which is also when it gets
   * a history: a teammate nobody has spoken to yet has nothing to show.
   */
  async function openDm(memberId: string): Promise<void> {
    if (busy) return;
    const sessionId = dmSessionId(memberId);
    setFreshChat(false);
    try {
      await persistCurrentSession(messages);
      const opened = await window.office.ensureDmChannel(memberId);
      if (!opened.ok) {
        setError(opened.reason);
        return;
      }
      if (sessionId !== sessionIdRef.current) {
        const full = await window.office.getChatSession(sessionId);
        adoptTranscript(
          sessionId,
          full ? parseStoredMessages(full.messages) : [],
        );
      }
      setPane({ kind: "member", memberId });
      void ingestChannelEvents();
      composerRef.current?.focus();
    } catch {
      setError(t("chat.historyLoadFailed"));
    }
  }

  /** Walking into a room, which is walking into the conversation held there. */
  function openChannel(targetId: string): void {
    if (busy) return;
    setPane(null);
    if (channelIdRef.current === targetId) {
      composerRef.current?.focus();
      return;
    }
    const sessionId = sessionIdOfChannelIn(sessionListRef.current, targetId);
    setFreshChat(false);
    void (async () => {
      await persistCurrentSession(messages);
      try {
        const full = await window.office.getChatSession(sessionId);
        adoptTranscript(
          sessionId,
          full ? parseStoredMessages(full.messages) : [],
        );
        void ingestChannelEvents();
        composerRef.current?.focus();
      } catch {
        setError(t("chat.historyLoadFailed"));
      }
    })();
  }

  /**
   * Closing a room closes the chat: they are the same thing.
   *
   * #general cannot be closed, and neither can a chat with a person - they
   * leave when the person does.
   */
  async function removeChannel(targetId: string): Promise<void> {
    if (targetId === GENERAL_CHANNEL_ID) return;
    if (!window.confirm(t("chat.deleteConfirm"))) return;
    try {
      const removed = await window.office.floorDeleteChannel(targetId);
      if (!removed.ok) {
        setError(removed.reason);
        return;
      }
      for (const session of sessionListRef.current) {
        if (!sessionBelongsToChannel(session.id, targetId)) continue;
        await window.office.deleteChatSession(session.id).catch(() => undefined);
      }
      setChannels((prev) => prev.filter((row) => row.id !== targetId));
      await refreshSessionList();
      if (channelIdRef.current === targetId) openChannel(GENERAL_CHANNEL_ID);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function togglePinSession(id: string, pinned: boolean): Promise<void> {
    try {
      await window.office.setChatSessionPinned(id, pinned);
      await refreshSessionList();
    } catch {
      /* ignore */
    }
  }

  /** Renaming the chat is renaming the room: there is only the one name. */
  async function renameChannel(targetId: string, name: string): Promise<void> {
    try {
      const result = await window.office.floorUpdateChannel(targetId, { name });
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      setChannels((prev) =>
        prev.map((row) => (row.id === targetId ? result.channel : row)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function toggleHistoryCollapsed(): void {
    setHistoryCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(HISTORY_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  useEffect(() => {
    void window.office
      .getExecutionPlan()
      .then((plan) => {
        setBackend(plan.backend);
        setCpuSlow(plan.backend === "cpu");
      })
      .catch(() => undefined);
    void window.office
      .getSetupSnapshot()
      .then((snapshot) => {
        const route = snapshot.state.inferenceRoute;
        const keyed = hasCloudKey(snapshot.state.llmProviders ?? {});
        setCloudReady(keyed && route === "openai");
        syncWebSearch(snapshot.state.webSearchEnabled !== false);
      })
      .catch(() => undefined);
  }, []);

  /**
   * Draw the stream on frames, not on tokens.
   *
   * A provider sends a delta per token, and every one of them used to be a state
   * update that re-parsed the whole answer so far as markdown. The words then
   * arrived slower than the model produced them, and the longer the reply the
   * worse it got. The text itself lives in the refs, which stay exact for the
   * commit; only the painting is coalesced.
   */
  function paintStream(): void {
    if (paintRef.current !== null) return;
    paintRef.current = requestAnimationFrame(() => {
      paintRef.current = null;
      setStreaming(streamingRef.current);
      setStreamingReasoning(streamingReasoningRef.current);
    });
  }

  useEffect(() => {
    const off = window.office.onChatStream((event: ChatStreamEvent) => {
      if (event.sessionId !== sessionIdRef.current) return;
      // The reply and the stream travel separately, so the tail of an answer can
      // land after the turn is already on screen. Taken then, it reopens the live
      // bubble and the last words appear a second time under the finished one.
      if (!inFlightRef.current) return;
      if (event.kind === "chunk") {
        setPhase("answering");
        streamingRef.current = (streamingRef.current + event.text).replace(
          /^\s*\[sentAt=[^\]]+\]\s*/i,
          "",
        );
        paintStream();
      } else if (event.kind === "reasoning") {
        setPhase("answering");
        streamingReasoningRef.current += event.text;
        paintStream();
      } else if (event.kind === "reset") {
        streamingRef.current = "";
        setStreaming("");
      } else if (event.kind === "step") {
        // A generic tool step (browser.open, doc.create, fs.write…) — show it
        // live as a sentence with an icon so the run is not a silent pause.
        setPhase("answering");
        const present = event.present ?? event.label;
        const past = event.past ?? event.label;
        const name = event.name ?? event.label;
        if (event.nested) {
          // A flow's own progress line: only ever "start", shown as a sub-line.
          if (event.status === "start") {
            setSteps([
              ...streamingStepsRef.current,
              {
                id: nextMsgId("st"),
                name,
                present,
                past,
                status: "done",
                nested: true,
              },
            ]);
          }
        } else if (event.status === "start") {
          setSteps([
            ...streamingStepsRef.current,
            { id: nextMsgId("st"), name, present, past, status: "start" },
          ]);
        } else {
          // Settle the newest running step with this tool name.
          const current = streamingStepsRef.current;
          let done = false;
          const next = current
            .slice()
            .reverse()
            .map((step) => {
              if (
                !done &&
                !step.nested &&
                step.name === name &&
                step.status === "start"
              ) {
                done = true;
                return {
                  ...step,
                  status: "done" as const,
                  ...(typeof event.ok === "boolean" ? { ok: event.ok } : {}),
                };
              }
              return step;
            })
            .reverse();
          setSteps(next);
        }
      } else if (event.kind === "tool") {
        if (event.status === "start") {
          setPhase("searching");
          setLastSearchQuery(event.query);
          const line = event.query
            ? `web_search: ${event.query}`
            : "web_search";
          streamingToolsRef.current = streamingToolsRef.current
            ? `${streamingToolsRef.current}\n${line}`
            : line;
          setStreamingTools(streamingToolsRef.current);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: nextMsgId("s"),
              kind: "sources",
              query: event.query,
              results: event.results,
              ...(event.blocked ? { blocked: true as const } : {}),
            },
          ]);
          if (event.blocked) {
            setChallengePending(true);
            setSearchNotice(t("chat.searchChallenge"));
          }
          setPhase("answering");
        }
      } else if (event.kind === "error") {
        setError(event.message);
      }
    });
    return () => {
      off();
      if (paintRef.current !== null) {
        cancelAnimationFrame(paintRef.current);
        paintRef.current = null;
      }
    };
  }, [t]);

  function scrollTranscriptToBottom(behavior: ScrollBehavior = "auto"): void {
    const parent = scrollParentRef.current;
    if (parent) {
      parent.scrollTo({
        top: Math.max(0, parent.scrollHeight - parent.clientHeight),
        behavior,
      });
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior });
  }

  useLayoutEffect(() => {
    if (!stickToBottomRef.current) return;
    jumpToBottomRef.current = false;
    // Follow live tokens with an instant snap. Smooth scroll fights rapid
    // height changes and leaves the viewport short of the real bottom.
    scrollTranscriptToBottom("auto");
  }, [messages, streaming, phase]);

  useEffect(() => {
    const parent = scrollParentRef.current;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const content = parent.firstElementChild;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      if (!stickToBottomRef.current) return;
      scrollTranscriptToBottom("auto");
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const offApproval = window.office.onTaskApprovalRequest((request) => {
      // Title autotitle fires after the chat turn clears inFlight. Without this
      // guard its tool approvals (second Mousepad card) land on an idle transcript
      // and look like the agent is still Thinking.
      if (!inFlightRef.current) return;
      setApproval(request);
    });
    // A document that exists only as a sentence in the transcript is one the
    // person has to go and find. Show it beside the conversation instead.
    const offArtifact = window.office.onTaskArtifact((item) => {
      const job = window.office
        .getArtifact(item.artifactId)
        .then((artifact) => {
          if (!artifact) return;
          const ref: ChatArtifactRef = {
            id: artifact.id,
            title: artifact.title,
            kind: artifact.kind,
          };
          if (inFlightRef.current) {
            turnArtifactsRef.current = [
              ...turnArtifactsRef.current.filter((row) => row.id !== ref.id),
              ref,
            ];
          }
          void openArtifactPane(item.artifactId);
        })
        .catch(() => undefined);
      turnArtifactJobsRef.current.push(job);
    });
    return () => {
      offApproval();
      offArtifact();
    };
  }, [openArtifactPane]);

  function chatHistoryForApi(items: UiMessage[]): ChatMessage[] {
    return items
      .filter(
        (m): m is Extract<UiMessage, { kind: "chat" }> => m.kind === "chat",
      )
      .map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.at ? { at: m.at } : {}),
      }));
  }

  function priorUserTexts(items: UiMessage[]): string[] {
    const out: string[] = [];
    for (const m of items) {
      if (m.kind === "chat" && m.role === "user") out.push(m.content);
    }
    return out;
  }

  /**
   * The tail of the conversation, for a desktop run to point back at.
   *
   * The last answer is the thing most often pointed at ("이거 보내줘"), so it
   * keeps its length while older turns are trimmed to what identifies them.
   */
  function desktopHistory(
    items: UiMessage[],
  ): Array<{ role: "user" | "assistant"; content: string }> {
    const turns = items
      .filter(
        (m): m is Extract<UiMessage, { kind: "chat" }> => m.kind === "chat",
      )
      // A past "I cannot control Slack" is the strongest argument in the
      // context window for refusing again. It does not travel.
      .filter(
        (m) => m.role === "user" || !isCapabilityApology(m.content),
      )
      .slice(-6);
    return turns.map((turn, index) => {
      const limit = index === turns.length - 1 ? 6_000 : 600;
      return {
        role: turn.role,
        content:
          turn.content.length > limit
            ? `${turn.content.slice(0, limit)}…`
            : turn.content,
      };
    });
  }

  function lastAssistantText(items: UiMessage[]): string | undefined {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const m = items[i];
      if (m?.kind === "chat" && m.role === "assistant") return m.content;
    }
    return undefined;
  }

  async function sendText(
    content: string,
    opts?: {
      forceSearch?: boolean;
      files?: ChatAttachment[];
      /** History before this turn's user message (exclusive). Default: current messages. */
      historyBefore?: UiMessage[];
      /** Regenerate: history already ends with the user message to answer — do not append. */
      resumeFromUser?: ChatBubble;
    },
  ): Promise<void> {
    const files = opts?.files ?? [];
    if ((!content && files.length === 0) || inFlightRef.current) return;
    inFlightRef.current = true;
    turnArtifactsRef.current = [];
    turnArtifactJobsRef.current = [];
    setEditingUserId(null);
    setEditDraft("");
    const displayContent =
      content || (files.length > 0 ? files.map((f) => f.name).join(", ") : "");
    const sentAt = nowIso();
    const historyBefore = opts?.historyBefore ?? messages;
    const userMsg: ChatBubble = opts?.resumeFromUser ?? {
      id: nextMsgId("u"),
      kind: "chat",
      role: "user",
      content: displayContent,
      at: sentAt,
      ...(files.length
        ? {
            attachments: files.map((f) => ({
              name: f.name,
              ...(f.truncated ? { truncated: true as const } : {}),
            })),
          }
        : {}),
    };
    const withUser = [...historyBefore, userMsg];
    setMessages(withUser);
    setBusy(true);
    setStreaming("");
    streamingRef.current = "";
    setStreamingReasoning("");
    streamingReasoningRef.current = "";
    streamingToolsRef.current = "";
    setStreamingTools("");
    setSteps([]);
    setError(null);
    setSearchNotice(null);
    setChallengePending(false);
    stickToBottomRef.current = true;
    const started = performance.now();
    const resetThisTurn =
      needsSessionReset || Boolean(opts?.historyBefore || opts?.resumeFromUser);
    if (resetThisTurn) setNeedsSessionReset(false);

    let contextBlock: string | undefined =
      attachmentsContext(files) || undefined;
    const pictures = files
      .filter((file) => file.image)
      .map((file) => file.image!);
    const priorUsers = priorUserTexts(historyBefore);
    const urls = extractHttpsUrls(content);
    // Cloud path: model decides via tool calling. Local: keep heuristic pre-search.
    const useToolCalling = cloudReady && webSearch && !computerUse;
    const shouldPreSearch =
      !computerUse &&
      !useToolCalling &&
      shouldAutoWebSearch({
        latest: content,
        priorUserTexts: priorUsers,
        webSearchEnabled: webSearch,
        force: opts?.forceSearch === true,
        ...(lastAssistantText(historyBefore)
          ? { lastAssistantText: lastAssistantText(historyBefore)! }
          : {}),
      });

    const userCountBeforeReply = withUser.filter(
      (m) => m.kind === "chat" && m.role === "user",
    ).length;
    try {
      // "석승현 부대표님" answers "who do you want to send it to?" and nothing
      // about those four syllables says desktop. The standing question does.
      // Inside the try: anything above it that throws leaves the composer
      // locked, because only the finally releases it.
      const pendingAsk = pendingDesktopAskRef.current;
      const answersAsk = answersPendingAsk({
        latest: content || displayContent,
        pending: pendingAsk,
      });
      pendingDesktopAskRef.current = null;

      const finishWithComputerUse = async (): Promise<void> => {
        setPhase("answering");
        setDesktopRunning(true);
        const instruction =
          answersAsk && pendingAsk
            ? mergePendingAsk(pendingAsk, content || displayContent)
            : content;
        const history = desktopHistory(historyBefore);
        const taskResult = await window.office.runTask({
          text: instruction,
          ...(sessionIdRef.current ? { chatId: sessionIdRef.current } : {}),
          ...(history.length > 0 ? { history } : {}),
        });
        setApproval(null);
        taskRunIdRef.current = null;
        setPhase("idle");
        if (taskResult.desktopJustEnabled) {
          setSearchNotice(t("chat.desktopControlEnabled"));
        }
        const blockedText =
          taskResult.desktopBlocked === "stopped"
            ? t("chat.desktopStopped")
            : taskResult.desktopBlocked === "unsupported"
              ? t("chat.desktopUnsupported")
              : "";
        const finalText = (
          blockedText ||
          taskResult.text ||
          streamingRef.current
        ).trim();
        streamingRef.current = "";
        setStreaming("");
        setStreamingReasoning("");
        streamingReasoningRef.current = "";
        // Stopping to ask leaves the errand open. Without this the answer
        // arrives as a fresh question and gets answered instead of used.
        pendingDesktopAskRef.current = asksForClarification(
          finalText,
          taskResult.options,
        )
          ? { instruction, question: finalText }
          : null;
        setMessages((prev) => [
          ...prev,
          {
            id: nextMsgId("a"),
            kind: "chat",
            role: "assistant",
            content:
              finalText ||
              (taskResult.awaitingApproval
                ? t("chat.taskAwaitingApproval")
                : t("chat.taskAborted")),
            at: nowIso(),
            timingMs: taskResult.timingMs,
            ...(taskResult.options?.length
              ? { options: taskResult.options }
              : {}),
            // Show what the desktop run saw (screenshots/recordings) inline,
            // the same way the browser tools surface their captures.
            ...(taskResult.media?.length
              ? { media: taskResult.media }
              : {}),
          },
        ]);
        if (userCountBeforeReply === 1) {
          void maybeAutotitleSession(userMsg.content, finalText || "");
        }
      };

      if (computerUse || answersAsk) {
        await finishWithComputerUse();
        return;
      }

      const prepared = opts?.resumeFromUser
        ? {
            ok: true as const,
            channelId: channelIdRef.current,
            to: ASSISTANT_MEMBER_ID,
            viaChat: true,
            // Resume reuses the existing user event, so no new id to capture.
            userEventId: undefined as string | undefined,
          }
        : await window.office.prepareChannelSend({
            text: content || displayContent,
            channelId: channelIdRef.current,
          });
      if (!prepared.ok) {
        setError(prepared.reason);
        setPhase("idle");
        return;
      }
      // Remember which log event this user line became, so regenerating its
      // answer later can prune the superseded replies out of the shared log.
      if (prepared.userEventId) {
        const eventId = prepared.userEventId;
        userMsg.channelEventId = eventId;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === userMsg.id && m.kind === "chat"
              ? { ...m, channelEventId: eventId }
              : m,
          ),
        );
      }

      if (!prepared.viaChat) {
        setPhase("answering");
        setReplyingMemberId(prepared.to);
        const attached = attachmentsContext(files) || undefined;
        const sayResult = await window.office.floorSay(
          content || displayContent,
          prepared.channelId,
          prepared.to,
          attached,
        );
        if (!sayResult.ok) {
          setError(sayResult.reason);
          setPhase("idle");
          return;
        }
        const deadline = nowMs() + 120_000;
        while (nowMs() < deadline && inFlightRef.current) {
          await ingestChannelEvents();
          const snap = await window.office.floorSnapshot();
          const working = snap.seats.some(
            (seat) => seat.state === "working" || seat.typing,
          );
          const queueBusy = snap.queue.inFlight > 0 || snap.queue.pending > 0;
          if (!working && !queueBusy && nowMs() > started + 1_500) break;
          // Tight enough that progress lines read as movement, not as a stall.
          await new Promise((resolve) => window.setTimeout(resolve, 300));
        }
        await ingestChannelEvents();
        setReplyingMemberId(null);
        setPhase("idle");
        if (userCountBeforeReply === 1) {
          void maybeAutotitleSession(userMsg.content, "");
        }
        return;
      }

      // Chat drives the shared tool registry itself, including configured MCP
      // messaging integrations. Only genuine desktop work routes to computer use.
      if (
        shouldAutoComputerUse({
          latest: content || displayContent,
          priorUserTexts: priorUsers,
        })
      ) {
        await finishWithComputerUse();
        return;
      }

      if (urls.length > 0) {
        setPhase("fetching");
        const pages: PageFetchResult[] = [];
        for (const url of urls) {
          try {
            const page = await window.office.fetchPage({
              url,
              keepOpen: false,
            });
            pages.push(page);
            if (page.blocked) {
              setSearchNotice(t("chat.fetchLinkBlocked"));
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setSearchNotice(t("chat.fetchLinkFailed", { url, message }));
          }
        }
        if (pages.length > 0) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextMsgId("p"),
              kind: "pages",
              pages: pages.map((p) => ({
                url: p.url,
                title: p.title || p.url,
                ...(p.blocked ? { blocked: true as const } : {}),
              })),
            },
          ]);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === userMsg.id && m.kind === "chat"
                ? {
                    ...m,
                    links: pages.map((p) => ({
                      url: p.url,
                      title: p.title || p.url,
                    })),
                  }
                : m,
            ),
          );
          contextBlock = mergeContextBlocks(
            contextBlock,
            ...pages.map((p) => p.contextBlock),
          );
        }
      }

      if (shouldPreSearch || opts?.forceSearch) {
        setPhase("searching");
        const query = resolveWebSearchQuery(content, priorUsers);
        setLastSearchQuery(query);
        try {
          const search = await window.office.webSearch({
            query,
            limit: 6,
            keepOpen: false,
            showBrowser: Boolean(opts?.forceSearch),
          });
          setMessages((prev) => [
            ...prev,
            {
              id: nextMsgId("s"),
              kind: "sources",
              query: search.query,
              results: search.results,
              ...(search.blocked ? { blocked: true as const } : {}),
            },
          ]);
          contextBlock = mergeContextBlocks(contextBlock, search.contextBlock);
          if (search.blocked) {
            setChallengePending(true);
            setSearchNotice(t("chat.searchChallenge"));
          } else if (search.timedOut) {
            setSearchNotice(t("chat.searchTimeout"));
          } else if (search.results.length === 0) {
            setSearchNotice(t("chat.searchEmpty"));
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (/SEARCH_TIMEOUT|timeout/i.test(message)) {
            setSearchNotice(t("chat.searchTimeout"));
          } else {
            setSearchNotice(t("chat.searchFailed", { message }));
          }
        }
      }

      setPhase("answering");
      const history = chatHistoryForApi(withUser);
      const result = await window.office.runChat({
        messages: [
          {
            role: "system",
            content: t("chat.systemPrompt"),
          },
          ...history,
        ],
        ...(contextBlock ? { contextBlock } : {}),
        ...(pictures.length > 0 ? { images: pictures } : {}),
        ...(useToolCalling && !contextBlock?.includes("UNTRUSTED_WEB_RESULTS")
          ? { enableWebSearch: true }
          : {}),
        // Korean spends roughly twice the tokens English does on the same words,
        // so a summary with a few bullets ran past 1024 and the answer stopped
        // mid-sentence. The ceiling is only a ceiling: a reply that ends earlier
        // costs nothing more for being allowed to run longer.
        maxTokens: 4096,
        sessionId: sessionIdRef.current,
        ...(resetThisTurn ? { resetSession: true } : {}),
        locale: locale === "en" ? "en" : "ko",
        clientNowIso: nowIso(),
        timeZone: clientTimeZone(),
      });

      /**
       * The console refused this turn for want of credit. The answer already says
       * so in the thread; this is what opens the sheet that can do something
       * about it.
       */
      if (result.outOfCredit) announceOutOfCredit();

      // Tool stream may already have added sources; also merge any returned records.
      if (result.webSearches?.length) {
        setMessages((prev) => {
          const existing = new Set(
            prev
              .filter((m) => m.kind === "sources")
              .map(
                (m) => `${m.query}::${m.results.map((r) => r.url).join(",")}`,
              ),
          );
          const extras = result
            .webSearches!.filter((s) => {
              const key = `${s.query}::${s.results.map((r) => r.url).join(",")}`;
              return !existing.has(key);
            })
            .map((s) => ({
              id: nextMsgId("s"),
              kind: "sources" as const,
              query: s.query,
              results: s.results,
              ...(s.blocked ? { blocked: true as const } : {}),
            }));
          return extras.length ? [...prev, ...extras] : prev;
        });
      }

      // The assistant may have changed settings via a tool (e.g. "turn off web
      // search"). The composer toggles are a client store synced only at load,
      // so pull the new values through or they keep showing the old state.
      if (result.settingsChanged) {
        void window.office
          .getSetupSnapshot()
          .then((snapshot) => {
            syncWebSearch(snapshot.state.webSearchEnabled !== false);
          })
          .catch(() => undefined);
      }

      setPhase("idle");
      const rawText = (result.text || streamingRef.current).trim();

      // The unified engine handles files/web/docs/memory/settings inline and is
      // told never to fake an action (TOOL_HONESTY_SYSTEM). These three checks
      // remain the safety net for native apps the inline tools
      // cannot reach: if the model apologises for, claims, or promises such work
      // instead of doing it, send the turn through the computer-use path.
      if (apologisedForDesktop({ ask: content || displayContent, reply: rawText })) {
        await finishWithComputerUse();
        return;
      }
      if (claimedDesktopWork({ ask: content || displayContent, reply: rawText })) {
        await finishWithComputerUse();
        return;
      }
      // And the third way of not doing it: promising to. There is no later —
      // the turn ends on that sentence with nothing running behind it.
      if (promisedDesktopWork({ ask: content || displayContent, reply: rawText })) {
        await finishWithComputerUse();
        return;
      }

      // Tool step labels ("Open an app") ride streamingTools for the live
      // bubble only. Persisting them as message.reasoning shows the settled
      // reply under chat.reasoningLabel ("Thinking") forever — the agent looks
      // stuck after main already returned.
      const finalReasoning = (
        result.reasoning || streamingReasoningRef.current
      ).trim();
      // The run's steps, folded under "Worked" on the settled bubble.
      const finalSteps = streamingStepsRef.current.slice();
      streamingRef.current = "";
      setStreaming("");
      streamingReasoningRef.current = "";
      setStreamingReasoning("");
      streamingToolsRef.current = "";
      setStreamingTools("");
      setSteps([]);
      if (rawText) {
        await Promise.allSettled(turnArtifactJobsRef.current);
        const { displayText, artifacts: textArtifacts } =
          await materializeArtifacts(rawText);
        const artifacts = [
          ...new Map(
            [...turnArtifactsRef.current, ...textArtifacts].map((artifact) => [
              artifact.id,
              artifact,
            ]),
          ).values(),
        ];
        turnArtifactsRef.current = [];
        turnArtifactJobsRef.current = [];
        const finalText = displayText.trim() || rawText;
        if (artifacts[0]) {
          void openArtifactPane(artifacts[0].id);
        }
        void window.office.appendChannelAssistant({
          channelId: channelIdRef.current,
          authorId: ASSISTANT_MEMBER_ID,
          text: finalText,
        });
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (
            last?.kind === "chat" &&
            last.role === "assistant" &&
            last.content.trim() === finalText
          ) {
            return prev.map((m, i) =>
              i === prev.length - 1 && m.kind === "chat"
                ? {
                    ...m,
                    timingMs: result.timingMs,
                    ...(typeof result.thinking === "boolean"
                      ? { thinking: result.thinking }
                      : {}),
                    ...(finalReasoning ? { reasoning: finalReasoning } : {}),
                    ...(finalSteps.length ? { steps: finalSteps } : {}),
                    ...(artifacts.length ? { artifacts } : {}),
                    ...(result.media?.length
                      ? {
                          media: result.media.map((item) => ({
                            ...item,
                            tool: "browser",
                          })),
                        }
                      : {}),
                  }
                : m,
            );
          }
          return [
            ...prev,
            {
              id: nextMsgId("a"),
              kind: "chat",
              role: "assistant",
              content: finalText,
              at: nowIso(),
              timingMs: result.timingMs,
              ...(typeof result.thinking === "boolean"
                ? { thinking: result.thinking }
                : {}),
              ...(finalReasoning ? { reasoning: finalReasoning } : {}),
              ...(finalSteps.length ? { steps: finalSteps } : {}),
              ...(artifacts.length ? { artifacts } : {}),
              ...(result.media?.length
                ? {
                    media: result.media.map((item) => ({
                      ...item,
                      tool: "browser",
                    })),
                  }
                : {}),
            },
          ];
        });
        if (userCountBeforeReply === 1) {
          void maybeAutotitleSession(userMsg.content, finalText);
        }
      }
      if (result.backend) {
        setBackend(result.backend);
        setCpuSlow(result.backend === "cpu");
      }
    } catch (err) {
      const partial = streamingRef.current.trim();
      const partialReasoning = streamingReasoningRef.current.trim();
      streamingRef.current = "";
      setStreaming("");
      streamingReasoningRef.current = "";
      setStreamingReasoning("");
      setPhase("idle");
      if (partial) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (
            last?.kind === "chat" &&
            last.role === "assistant" &&
            last.content.trim() === partial
          ) {
            return prev;
          }
          return [
            ...prev,
            {
              id: nextMsgId("a"),
              kind: "chat",
              role: "assistant",
              content: partial,
              at: nowIso(),
              ...(partialReasoning ? { reasoning: partialReasoning } : {}),
            },
          ];
        });
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlightRef.current = false;
      setDesktopRunning(false);
      // Whatever arrived while the answer was being filed belongs to a turn that
      // is over. Left in place it renders as a second, still-live reply.
      streamingRef.current = "";
      setStreaming("");
      streamingReasoningRef.current = "";
      setStreamingReasoning("");
      streamingToolsRef.current = "";
      setStreamingTools("");
      setSteps([]);
      setReplyingMemberId(null);
      setBusy(false);
      setPhase("idle");
      if (stickToBottomRef.current) jumpToBottomRef.current = true;
      composerRef.current?.focus();
    }
  }

  /**
   * Directives are human input to the Floor, not a prompt. They are answered
   * here and never reach the model.
   */
  async function runDirective(directive: ParsedDirective): Promise<void> {
    const at = nowIso();
    const echo: ChatBubble = {
      id: nextMsgId("u"),
      kind: "chat",
      role: "user",
      content: `${directive.kind} ${directive.body}`,
      at,
    };
    let reply: string;
    try {
      const result = await window.office.floorDirective(directive);
      reply = !result.ok
        ? t("floor.refused", { reason: result.reason })
        : directive.kind === "ABORT"
          ? t("floor.directiveAbort")
          : directive.kind === "PIN"
            ? t("floor.directivePin")
            : t("floor.directiveSteer", { minutes: result.etaMinutes });
    } catch (err) {
      reply = t("floor.refused", {
        reason: err instanceof Error ? err.message : String(err),
      });
    }
    setMessages((prev) => [
      ...prev,
      echo,
      {
        id: nextMsgId("a"),
        kind: "chat",
        role: "assistant",
        content: reply,
        at: nowIso(),
      },
    ]);
  }

  async function send(markdown: string): Promise<void> {
    const content = markdown.trim();
    const files = attachments;
    if (!content && files.length === 0) return;
    const directive = parseDirective(content);
    if (directive) {
      composerRef.current?.clear();
      await runDirective(directive);
      return;
    }
    composerRef.current?.clear();
    setAttachments([]);
    await sendText(content, { files });
  }

  async function attachFiles(): Promise<void> {
    if (busy) return;
    try {
      const picked = await window.office.pickChatAttachments();
      if (picked.length === 0) return;
      setAttachments((prev) => mergeAttachments(prev, picked));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /** Dropped on the composer or pasted into it, which have no path to pick. */
  async function attachDropped(dropped: File[]): Promise<void> {
    if (busy || dropped.length === 0) return;
    setAttaching(true);
    try {
      const outcome = await attachmentsFromFiles(dropped, attachments);
      if (outcome.files.length > 0) {
        setAttachments((prev) => mergeAttachments(prev, outcome.files));
      }
      const full = outcome.rejected.find((item) => item.reason === "full");
      const unreadable = outcome.rejected.find(
        (item) => item.reason === "unreadable",
      );
      if (unreadable) {
        setError(t("composer.unreadableFile", { name: unreadable.name }));
      } else if (full) {
        setError(t("composer.tooManyFiles", { count: MAX_ATTACHMENTS }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAttaching(false);
    }
  }

  async function retrySearch(): Promise<void> {
    if (!lastSearchQuery || inFlightRef.current) return;
    setChallengePending(false);
    setSearchNotice(null);
    await sendText(lastSearchQuery, { forceSearch: true });
  }

  /**
   * A name no room is using yet: `chat`, then `chat-2`, `chat-3`.
   *
   * Rooms are named after what they are for, and this one is not for anything
   * yet, so it gets a plain one that can be renamed the moment it is.
   */
  function freeChannelName(): string {
    const base = t("chat.newChannelBase");
    const taken = new Set(channelsRef.current.map((room) => room.name));
    if (!taken.has(base)) return base;
    for (let n = 2; n < 500; n += 1) {
      const candidate = `${base}-${n}`;
      if (!taken.has(candidate)) return candidate;
    }
    return `${base}-${crypto.randomUUID().slice(0, 8)}`;
  }

  /**
   * A new chat is a new room.
   *
   * A room holds one conversation, so there is no second chat to start inside
   * the one you are in: the button makes somewhere else to talk, with Redrob
   * already in it and anybody else invitable.
   */
  function startNewChat(): void {
    if (busy) return;
    void (async () => {
      const created = await window.office
        .floorCreateChannel({
          name: freeChannelName(),
          purpose: "",
          memberIds: [ASSISTANT_MEMBER_ID],
          defaultMemberId: ASSISTANT_MEMBER_ID,
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err));
          return null;
        });
      if (!created) return;
      if (!created.ok) {
        setError(created.reason);
        return;
      }
      await persistCurrentSession(messages);
      voice.abandon();
      // The floor snapshot poll may have already inserted this channel, so add
      // by id only when it is not present — two rows with the same id both light
      // up as selected once it becomes the active channel.
      setChannels((prev) =>
        prev.some((row) => row.id === created.channel.id)
          ? prev
          : [...prev, created.channel],
      );
      adoptTranscript(roomSessionId(created.channel.id), []);
      setFreshChat(true);
      setChallengePending(false);
      setLastSearchQuery(null);
      composerRef.current?.clear();
      setAttachments([]);
      inFlightRef.current = false;
      titleJobRef.current = null;
      void window.office.closeWebSearch().catch(() => undefined);
      await refreshSessionList();
      composerRef.current?.focus();
    })();
  }

  async function copyMessage(id: string, content: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* ignore */
    }
  }

  async function maybeAutotitleSession(
    userText: string,
    assistantText: string,
  ): Promise<void> {
    const sessionId = sessionIdRef.current;
    const locked = sessionListRef.current.find(
      (s) => s.id === sessionId,
    )?.titleLocked;
    if (locked) return;
    if (titleJobRef.current === sessionId) return;
    titleJobRef.current = sessionId;

    const fallback =
      heuristicChatTitle(userText, assistantText) ||
      deriveChatTitleFromUser(userText);
    let title = fallback;

    try {
      const result = await window.office.runChat({
        messages: [
          {
            role: "system",
            content:
              "You name chat threads. Reply with ONLY a short title (max 8 words). " +
              "Same language as the user. No quotes, no punctuation wrapper, no explanation.",
          },
          {
            role: "user",
            content: `User:\n${userText.slice(0, 400)}\n\nAssistant:\n${assistantText.slice(0, 500)}`,
          },
        ],
        maxTokens: 32,
        sessionId: `${sessionId}:title`,
        resetSession: true,
        locale: locale === "en" ? "en" : "ko",
        clientNowIso: nowIso(),
        timeZone: clientTimeZone(),
      });
      const generated = sanitizeGeneratedTitle(result.text || "");
      if (generated) title = generated;
    } catch {
      /* keep heuristic */
    }

    if (!title || sessionIdRef.current !== sessionId) {
      if (titleJobRef.current === sessionId) titleJobRef.current = null;
      return;
    }
    try {
      // Soft title: unlike a user rename this does not lock, so a generated name
      // never freezes the thread's title as though the person had chosen it.
      await window.office.autotitleChatSession(sessionId, title);
      await refreshSessionList();
    } catch {
      /* ignore */
    } finally {
      if (titleJobRef.current === sessionId) titleJobRef.current = null;
    }
  }

  function beginEditUserMessage(message: ChatBubble): void {
    if (busy || message.role !== "user") return;
    setEditingUserId(message.id);
    setEditDraft(message.content);
  }

  function cancelEditUserMessage(): void {
    setEditingUserId(null);
    setEditDraft("");
  }

  async function submitEditUserMessage(messageId: string): Promise<void> {
    const next = editDraft.trim();
    if (!next || busy || inFlightRef.current) return;
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    const target = messages[idx];
    if (!target || target.kind !== "chat" || target.role !== "user") return;
    closeArtifactPane();
    setNeedsSessionReset(true);
    await sendText(next, { historyBefore: messages.slice(0, idx) });
  }

  async function regenerateFromUser(userId: string): Promise<void> {
    if (busy || inFlightRef.current) return;
    const userIdx = messages.findIndex((m) => m.id === userId);
    if (userIdx < 0) return;
    const userMsg = messages[userIdx];
    if (!userMsg || userMsg.kind !== "chat" || userMsg.role !== "user") return;
    closeArtifactPane();
    setNeedsSessionReset(true);
    // The shared channel log is the room's other source of truth. Drop the
    // superseded reply (and anything said after it) so the ~1.2s poll cannot
    // resurrect the old answers onto this chat after a refresh.
    if (userMsg.channelEventId) {
      try {
        await window.office.truncateChannelEventsAfter({
          channelId: channelIdRef.current,
          eventId: userMsg.channelEventId,
        });
      } catch {
        /* a failed prune only means the poll may re-add stale lines */
      }
    }
    await sendText(userMsg.content, {
      historyBefore: messages.slice(0, userIdx),
      resumeFromUser: userMsg,
    });
  }

  const voice = useVoiceDictation({
    busy,
    force: voiceForce,
    locale,
    t,
    onError: setError,
    // Speaking is a way of sending, not of typing: the words go out rather
    // than landing in the box for a second confirmation.
    onTranscript: async (text) => {
      composerRef.current?.clear();
      await sendText(text);
    },
    onArm: () => composerRef.current?.clear(),
  });

  const page = variant === "page";
  const { resolvedTheme } = useTheme();
  const empty =
    historyReady && messages.length === 0 && !streaming && phase === "idle";
  const activeSession = sessionList.find((s) => s.id === activeSessionId);
  const activeDmMemberIdEarly = dmMemberOfSession(activeSessionId);
  /**
   * On the opening screen the reader is not in a room yet.
   *
   * #general is where a first message would land, but nobody chose it, so
   * nothing in the sidebar is lit up as though they had walked into it.
   */
  const unplaced =
    freshChat &&
    empty &&
    !activeDmMemberIdEarly &&
    channelId === GENERAL_CHANNEL_ID;
  /**
   * Rooms keep their top bar and tabs, including an empty #general. The
   * unplaced flag only clears the sidebar selection on first open.
   */
  const landing = false;
  /** Suggestion cards on an empty room that is not #general (and not a DM). */
  const showOpenerCards =
    empty && !activeDmMemberIdEarly && channelId !== GENERAL_CHANNEL_ID;
  /**
   * The rooms, #general first.
   *
   * #general is in the list before the first snapshot lands as well: a channel
   * list that can open empty is a list with no way back into the room the
   * whole workspace shares.
   */
  const roomChannels = useMemo<FloorChannel[]>(() => {
    // Collapse any accidental duplicate rows by id: the same channel appearing
    // twice would render as two entries that both highlight when it is active.
    const seen = new Set<string>();
    const rooms = channels.filter((room) => {
      if (room.isDM || seen.has(room.id)) return false;
      seen.add(room.id);
      return true;
    });
    const general = rooms.find((room) => room.id === GENERAL_CHANNEL_ID);
    const rest = rooms.filter((room) => room.id !== GENERAL_CHANNEL_ID);
    return [
      general ?? {
        id: GENERAL_CHANNEL_ID,
        name: GENERAL_CHANNEL_ID,
        purpose: "",
        createdAt: 0,
        updatedAt: 0,
        system: true,
        memberIds: [ASSISTANT_MEMBER_ID],
        defaultMemberId: ASSISTANT_MEMBER_ID,
        isDM: false,
      },
      ...rest,
    ];
  }, [channels]);
  const currentTitle =
    activeSession?.title.trim() ||
    deriveChatTitle(messages) ||
    t("channel.general");
  /** Whether the open chat is bookmarked (starred), shown in the header. */
  const bookmarked = activeSession?.pinned ?? false;
  const activeDmMemberId = activeDmMemberIdEarly;
  // Redrob leads the DM list, then the rest, the way Slack floats the workspace
  // bot to the top of your direct messages.
  const dmTeammates = useMemo(
    () =>
      teamMembers
        .filter((member) => member.active)
        .sort((a, b) => (a.builtin === b.builtin ? 0 : a.builtin ? -1 : 1)),
    [teamMembers],
  );
  /** Everyone still on the team, for invite lists and pickers. */
  const activeMembers = useMemo(
    () => teamMembers.filter((member) => member.active),
    [teamMembers],
  );
  /**
   * The sidebar: one row per chat, and a chat is a room or a person.
   *
   * What a row shows about itself - whether anything has been said in it, when,
   * and whether it is starred - comes from the transcript stored under its
   * address, which is why the two are looked up together here.
   */
  const summaryOf = useCallback(
    (sessionId: string): ChatSessionSummaryView | undefined =>
      sessionList.find((session) => session.id === sessionId),
    [sessionList],
  );
  const roomRows = useMemo<ChatRow[]>(
    () =>
      roomChannels.map((room) => {
        const summary = summaryOf(sessionIdOfChannelIn(sessionList, room.id));
        return {
          id: room.id,
          kind: "channel" as const,
          name: room.name,
          pinned: summary?.pinned ?? false,
          messageCount: summary?.messageCount ?? 0,
          system: room.system,
          updatedAt: summary?.updatedAt || room.updatedAt,
          createdAt: summary?.createdAt || room.createdAt,
        };
      }),
    [roomChannels, sessionList, summaryOf],
  );
  const dmRows = useMemo<ChatRow[]>(
    () =>
      dmTeammates.map((member) => {
        const summary = summaryOf(dmSessionId(member.id));
        return {
          id: member.id,
          kind: "dm" as const,
          name: member.name,
          pinned: summary?.pinned ?? false,
          messageCount: summary?.messageCount ?? 0,
          system: false,
          builtin: member.builtin,
          updatedAt: summary?.updatedAt || member.updatedAt,
          createdAt: summary?.createdAt || member.createdAt,
        };
      }),
    [dmTeammates, summaryOf],
  );

  useEffect(() => {
    chatNavBridge.setChatState({
      rooms: roomRows,
      dms: dmRows,
      activeId: unplaced ? "" : (activeDmMemberId ?? channelId),
      busy,
      ready: historyReady,
    });
  }, [roomRows, dmRows, unplaced, activeDmMemberId, channelId, busy, historyReady]);

  useEffect(() => {
    return chatNavBridge.onNavigate((target) => {
      if (target.kind === "channel") {
        openChannel(target.channelId);
      } else if (target.kind === "dm") {
        void openDm(target.memberId);
      } else if (target.kind === "new") {
        startNewChat();
      }
    });
  }, [openChannel, openDm, startNewChat]);

  const dmMember = activeDmMemberId
    ? (teamMembers.find((row) => row.id === activeDmMemberId) ?? null)
    : null;
  /**
   * A one-to-one chat is not in the channel list, so the pane is handed a
   * channel shaped like the person it is with.
   */
  const channel = useMemo<FloorChannel | null>(() => {
    if (dmMember) {
      return {
        id: dmChannelIdOf(dmMember.id),
        name: dmMember.name,
        purpose: dmMember.persona,
        createdAt: dmMember.createdAt,
        updatedAt: dmMember.updatedAt,
        system: false,
        memberIds: [dmMember.id],
        defaultMemberId: dmMember.id,
        isDM: true,
      };
    }
    return channels.find((row) => row.id === channelId) ?? null;
  }, [channels, channelId, dmMember]);
  /** Only the people invited here, which is what "대화 상대" has to mean. */
  const channelMembers = useMemo(() => {
    const ids = channel?.memberIds ?? [ASSISTANT_MEMBER_ID];
    return ids.flatMap((id) => {
      const member = teamMembers.find((row) => row.id === id);
      return member ? [member] : [];
    });
  }, [channel, teamMembers]);
  const channelLabel = channel?.isDM
    ? (channelMembers[0]?.name ?? currentTitle)
    : `#${channel?.name ?? currentTitle}`;
  const mentionItems = useMemo(
    () =>
      channelMembers.map((member) => ({
        id: member.id,
        label: member.name,
        ...(member.persona ? { hint: member.persona } : {}),
      })),
    [channelMembers],
  );
  // Saved flows the `/` palette can invoke by name (OpenWork-style skills).
  const [flowSlashItems, setFlowSlashItems] = useState<MentionItem[]>([]);
  useEffect(() => {
    let alive = true;
    void window.office
      .listWorkflows()
      .then((rows) => {
        if (!alive) return;
        setFlowSlashItems(
          rows.map((flow) => ({
            id: flow.id,
            label: flow.title,
            ...(flow.description ? { hint: flow.description } : {}),
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [pane]);
  /**
   * What to call somebody on screen. The built-in teammate is Redrob wherever
   * it is named, including under its raw id and before the roster has been
   * read, because `assistant` is a row in a table and not a colleague's name.
   */
  const memberName = useCallback(
    (id: string): string => {
      const member = teamMembers.find((row) => row.id === id);
      if (member) return member.name;
      return id === ASSISTANT_MEMBER_ID ? t("chat.model") : id;
    },
    [teamMembers, t],
  );
  // A message is stored with `@id` so the office can route it; a reader wants
  // the name, so it is swapped back in on the way to the screen.
  const withMentionNames = useMemo(() => {
    const byId = new Map(
      teamMembers.map((member) => [member.id.toLowerCase(), member.name]),
    );
    if (!byId.has(ASSISTANT_MEMBER_ID)) {
      byId.set(ASSISTANT_MEMBER_ID, t("chat.model"));
    }
    return (text: string): string =>
      text.replace(
        /(^|\s)@([\p{L}\p{N}_-]+)/gu,
        (whole, pre: string, id: string) => {
          const name = byId.get(id.toLowerCase());
          return name ? `${pre}@${name}` : whole;
        },
      );
  }, [teamMembers, t]);
  /** The files this conversation produced, newest last, listed once each. */
  const paneFiles = useMemo<ChatPaneFile[]>(() => {
    const seen = new Map<string, ChatPaneFile>();
    for (const message of messages) {
      if (message.kind === "chat") {
        for (const art of message.artifacts ?? []) {
          seen.set(art.id, { id: art.id, title: art.title, kind: art.kind });
        }
        continue;
      }
      if (message.kind !== "channel-event") continue;
      if (message.event.type !== "artifact") continue;
      const payload = message.event.payload;
      const id = String(payload["artifactId"] ?? "");
      if (!id) continue;
      seen.set(id, {
        id,
        title: String(payload["label"] ?? id),
        kind: String(payload["kind"] ?? ""),
      });
    }
    return [...seen.values()];
  }, [messages]);
  const chatMessageCount = messages.filter(
    (message) => message.kind === "chat",
  ).length;
  /** Who the live bubble belongs to: the teammate this turn was sent to. */
  const liveAuthor =
    replyingMemberId && replyingMemberId !== ASSISTANT_MEMBER_ID
      ? (teamMembers.find((member) => member.id === replyingMemberId) ?? null)
      : null;

  function selectPaneTab(tab: ChatPaneTab): void {
    setPane((prev) => toggleChatPane(prev, { kind: tab }));
  }

  function selectPaneMember(memberId: string): void {
    setPane((prev) => toggleChatPane(prev, { kind: "member", memberId }));
  }

  /**
   * An opener card starts a room, not a private word with Redrob.
   *
   * Work in this office lives in a room other people can be invited into, so
   * the card makes one, puts Redrob in it, and says the line there. Clicking
   * the same card twice walks back into the room it made the first time rather
   * than minting `#rejection-email-2`.
   */
  async function startFromCard(suggestion: {
    text: string;
    room: string;
  }): Promise<void> {
    if (busy) return;
    const said = t(suggestion.text);
    // Cards only show on an empty chat, and outside #general that chat is
    // already in a room somebody chose. Saying it there is the whole job.
    if (channelIdRef.current !== GENERAL_CHANNEL_ID) {
      await sendText(said);
      return;
    }
    const name = t(suggestion.room);
    let room: FloorChannel | null = null;
    try {
      const created = await window.office.floorCreateChannel({
        name,
        purpose: said,
        memberIds: [ASSISTANT_MEMBER_ID],
        defaultMemberId: ASSISTANT_MEMBER_ID,
      });
      if (created.ok) {
        room = created.channel;
        setChannels((prev) =>
          prev.some((row) => row.id === created.channel.id)
            ? prev
            : [...prev, created.channel],
        );
      } else {
        const snapshot = await window.office.floorSnapshot();
        setChannels(snapshot.channels);
        room = snapshot.channels.find((item) => item.name === name) ?? null;
        if (!room) {
          setError(created.reason);
          return;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    await persistCurrentSession(messages);
    adoptTranscript(roomSessionId(room.id), []);
    await sendText(said);
  }

  async function inviteToChannel(memberId: string): Promise<void> {
    try {
      const result = await window.office.inviteToChannel(channelId, [memberId]);
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      setChannels((prev) =>
        prev.map((row) =>
          row.id === result.channel.id ? result.channel : row,
        ),
      );
      // The invite notice is a channel event; pull it into the transcript now.
      void ingestChannelEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function removeFromChannel(memberId: string): Promise<void> {
    try {
      const result = await window.office.removeFromChannel(channelId, memberId);
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      setChannels((prev) =>
        prev.map((row) =>
          row.id === result.channel.id ? result.channel : row,
        ),
      );
      void ingestChannelEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div
      data-tour="chat-panel"
      className={
        page
          ? "relative flex h-full w-full min-h-0 flex-1 overflow-hidden bg-card"
          : "relative flex min-h-[28rem] overflow-hidden rounded border border-gray-300 bg-card dark:border-gray-800"
      }
    >
      <WhisperInstallDialog voice={voice} />
      {addingTeammate ? (
        <AddTeammateDialog
          onClose={() => setAddingTeammate(false)}
          onCreated={(member) => {
            setTeamMembers((prev) => [...prev, member]);
            // Added from the member list of a room means added to that room.
            // #general already has them, and a DM takes no third person.
            if (
              pane?.kind === "members" &&
              channelId !== GENERAL_CHANNEL_ID &&
              !channel?.isDM
            ) {
              void inviteToChannel(member.id);
            } else {
              setPane({ kind: "member", memberId: member.id });
            }
          }}
        />
      ) : null}

      {!hideSidebar ? (
        <>
          <ChatSessionsPanel
            rooms={roomRows}
            dms={dmRows}
            activeId={unplaced ? "" : (activeDmMemberId ?? channelId)}
            busy={busy}
            ready={historyReady}
            collapsed={historyCollapsed}
            {...(historyCollapsed ? {} : { style: historyPanels.style("pane") })}
            onToggleCollapsed={toggleHistoryCollapsed}
            onNewChat={startNewChat}
            onAddTeammate={() => setAddingTeammate(true)}
            onOpen={(row) => {
              if (row.kind === "dm") void openDm(row.id);
              else openChannel(row.id);
            }}
            onRename={(channelId_, name) => void renameChannel(channelId_, name)}
            onTogglePin={(row, pinned) =>
              void togglePinSession(
                row.kind === "dm"
                  ? dmSessionId(row.id)
                  : sessionIdOfChannelIn(sessionList, row.id),
                pinned,
              )
            }
            onDelete={(channelId_) => void removeChannel(channelId_)}
          />
          {historyCollapsed ? null : (
            <PanelResizeHandle
              label={t("chat.historyResize")}
              onResizeStart={(event) => historyPanels.beginResize("pane", event)}
              onReset={() => historyPanels.reset("pane")}
            />
          )}
        </>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/*
          A chat with nothing in it yet is an opening screen, not a room: no
          name to show, nothing to file, nobody to look up. The bar and the
          side pane arrive with the first thing said.
        */}
        {landing ? null : (
          <>
            <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-card px-4 dark:border-gray-800">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  type="button"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors ${
                    bookmarked
                      ? "text-warning hover:bg-warning-soft"
                      : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                  }`}
                  title={bookmarked ? t("chat.unbookmark") : t("chat.bookmark")}
                  aria-label={bookmarked ? t("chat.unbookmark") : t("chat.bookmark")}
                  aria-pressed={bookmarked}
                  disabled={!activeSession}
                  onClick={() =>
                    void togglePinSession(activeSessionId, !bookmarked)
                  }
                >
                  <StarIcon className="h-4 w-4" filled={bookmarked} />
                </button>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="flex min-w-0 items-center gap-1.5 text-[0.9375rem] font-bold text-gray-900 dark:text-white">
                      {channel?.isDM && channelMembers[0]?.builtin ? (
                        <BrandLogo
                          variant="mark"
                          theme={resolvedTheme === "dark" ? "onDark" : "light"}
                          className="h-5 w-5 shrink-0 rounded ring-1 ring-gray-900/5 dark:ring-white/10"
                        />
                      ) : channel?.isDM && channelMembers[0] ? (
                        <MemberAvatar
                          name={channelMembers[0].name}
                          seed={channelMembers[0].id}
                          size="sm"
                        />
                      ) : (
                        <HashIcon className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-300" />
                      )}
                      {/* The room's own name, never the chat's title: #general is
                          where everybody is, and it is not renamed by whatever was
                          asked in it last. */}
                      <span className="truncate">{channelLabel}</span>
                    </p>
                    <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      {cloudReady ? t("chat.routeCloud") : t("chat.routeLocal")}
                      {backend ? ` · ${backend}` : ""}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {cloudReady ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[0.6875rem] font-semibold text-success-ink ring-1 ring-inset ring-success-muted transition-all hover:ring-success active:scale-[0.98]"
                    title={t("chat.chipConnectedTitle")}
                    aria-label={t("chat.openModelsSettings")}
                    onClick={() => onOpenSettings?.("models")}
                    disabled={!onOpenSettings}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-success"
                      aria-hidden
                    />
                    {t("chat.chipConnected")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-2.5 py-1 text-[0.6875rem] font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    title={t("chat.chipSetupTitle")}
                    aria-label={t("chat.openModelsSettings")}
                    onClick={() => onOpenSettings?.("models")}
                    disabled={!onOpenSettings}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-gray-400"
                      aria-hidden
                    />
                    {t("chat.chipSetup")}
                  </button>
                )}
              </div>
            </div>

            {/* Tab dock below the channel header divider line */}
            <ChatPaneBar
              active={pane}
              counts={{
                files: paneFiles.length,
                members: channelMembers.length,
              }}
              onSelect={selectPaneTab}
            />
          </>
        )}

        <div
          ref={scrollParentRef}
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={(event) => {
            const el = event.currentTarget;
            const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
            stickToBottomRef.current = dist < 80;
          }}
        >
          {/* Messages run the full width of the pane and stack, the way Slack
              stacks them. A centred reading column belongs to a document. */}
          <div className="flex min-h-full w-full flex-col py-4">
            {empty ? (
              activeDmMemberId ? (
                // A DM is one conversation with one person — no product mark,
                // no opener cards. Just the fact that nothing has been said.
                <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4 text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t("chat.dmEmpty")}
                  </p>
                </div>
              ) : (
                <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-8 px-4 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <BrandLogo
                      variant="mark"
                      theme={resolvedTheme === "dark" ? "onDark" : "light"}
                      className="h-12 w-12 rounded shadow-lg shadow-gray-900/15 ring-1 ring-gray-900/5 dark:ring-white/10"
                    />
                    <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                      {t("chat.greeting")}
                    </h2>
                    <p className="max-w-md text-sm text-gray-700 dark:text-gray-300">
                      {t("chat.greetingBody")}
                    </p>
                  </div>
                  {/* Empty rooms that are not #general get the opener cards. */}
                  {showOpenerCards ? (
                    <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
                      {SUGGESTIONS.map((suggestion) => (
                        <button
                          key={suggestion.text}
                          type="button"
                          className="rounded border border-gray-300 bg-white px-4 py-3 text-left text-sm text-gray-800 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-400 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-600"
                          disabled={busy}
                          onClick={() => void startFromCard(suggestion)}
                        >
                          {t(suggestion.text)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            ) : (
              <div className="flex flex-col">
                {foldSourceRuns(messages).map((message) => {
                  if (message.kind === "source-group") {
                    return (
                      <div key={message.id} className="px-4">
                        <SourcesFold
                          group={message}
                          emptyLabel={
                            message.blocked
                              ? t("chat.searchChallenge")
                              : t("chat.searchEmpty")
                          }
                          openLabel={t("chat.openSource")}
                        />
                      </div>
                    );
                  }
                  if (message.kind === "channel-event") {
                    return (
                      <div key={message.id} className="px-4">
                        <ChannelEventBlock
                          event={message.event}
                          members={teamMembers}
                          onResolveApproval={(
                            approvalId,
                            approved,
                            decision,
                          ) => {
                            void window.office
                              .floorResolveApproval(
                                approvalId,
                                approved,
                                decision,
                              )
                              .then(() => {
                                document
                                  .getElementById(`approval-${approvalId}`)
                                  ?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "center",
                                  });
                              });
                          }}
                          onOpenArtifact={(artifactId) => {
                            void openArtifactPane(artifactId);
                          }}
                        />
                      </div>
                    );
                  }
                  const author =
                    message.role === "user"
                      ? null
                      : message.authorId &&
                          message.authorId !== ASSISTANT_MEMBER_ID
                        ? (teamMembers.find(
                            (member) => member.id === message.authorId,
                          ) ?? null)
                        : null;
                  const authorName =
                    message.role === "user"
                      ? t("chat.you")
                      : (author?.name ?? t("chat.model"));
                  const stamp = formatBubbleTime(message.at, locale);
                  const grouped = groupedWithPrevious(messages, message);

                  if (message.role === "user") {
                    const isEditing = editingUserId === message.id;
                    return (
                      <SlackRow
                        key={message.id}
                        grouped={grouped}
                        stamp={stamp}
                        at={message.at}
                        name={authorName}
                        avatar={
                          <span
                            aria-hidden
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-gray-900 text-[0.6875rem] font-bold text-white"
                          >
                            {t("chat.you").slice(0, 2)}
                          </span>
                        }
                        actions={
                          isEditing || busy ? null : (
                            <>
                              <button
                                type="button"
                                className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                                aria-label={t("chat.edit")}
                                title={t("chat.edit")}
                                onClick={() => beginEditUserMessage(message)}
                              >
                                <PencilIcon className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                                aria-label={t("chat.regenerate")}
                                title={t("chat.regenerate")}
                                onClick={() =>
                                  void regenerateFromUser(message.id)
                                }
                              >
                                <RefreshIcon className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )
                        }
                      >
                        {message.attachments?.length ? (
                          <ul className="mb-1 flex flex-wrap gap-1">
                            {message.attachments.map((file) => (
                              <li
                                key={file.name}
                                className="rounded bg-gray-100 px-2 py-0.5 text-[0.6875rem] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                              >
                                {file.name}
                                {file.truncated
                                  ? ` · ${t("chat.attachmentTruncated")}`
                                  : ""}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {isEditing ? (
                          <div className="rounded border border-gray-300 bg-white px-3 py-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                            <textarea
                              className="max-h-48 min-h-[4.5rem] w-full resize-y bg-transparent text-[0.9375rem] leading-relaxed text-gray-900 outline-none dark:text-gray-100"
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (
                                  isSubmitHotkey(e) &&
                                  !e.nativeEvent.isComposing
                                ) {
                                  e.preventDefault();
                                  void submitEditUserMessage(message.id);
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelEditUserMessage();
                                }
                              }}
                              autoFocus
                            />
                            <div className="mt-2 flex justify-end gap-2">
                              <button
                                type="button"
                                className="rounded px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                                onClick={cancelEditUserMessage}
                              >
                                {t("chat.editCancel")}
                              </button>
                              <button
                                type="button"
                                className="rounded bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900"
                                disabled={!editDraft.trim() || busy}
                                onClick={() =>
                                  void submitEditUserMessage(message.id)
                                }
                              >
                                {t("chat.editSave")}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-gray-900 dark:text-gray-100">
                            {withMentionNames(message.content)}
                          </p>
                        )}
                      </SlackRow>
                    );
                  }
                  return (
                    <SlackRow
                      key={message.id}
                      grouped={grouped}
                      stamp={stamp}
                      at={message.at}
                      name={authorName}
                      {...(author?.persona ? { subtitle: author.persona } : {})}
                      avatar={
                        author ? (
                          <MemberAvatar name={author.name} seed={author.id} />
                        ) : (
                          <BrandLogo
                            variant="mark"
                            theme={resolvedTheme === "dark" ? "onDark" : "light"}
                            className="h-8 w-8 shrink-0 rounded ring-1 ring-gray-900/5 dark:ring-white/10"
                          />
                        )
                      }
                      actions={
                        <button
                          type="button"
                          className="rounded px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                          onClick={() =>
                            void copyMessage(message.id, message.content)
                          }
                        >
                          {copiedId === message.id
                            ? t("chat.copied")
                            : t("chat.copy")}
                        </button>
                      }
                    >
                      {message.reasoning?.trim() ? (
                        <details className="chat-reasoning mb-1">
                          <summary className="chat-reasoning-summary">
                            {t("chat.reasoningLabel")}
                          </summary>
                          <pre className="chat-reasoning-body">
                            {message.reasoning}
                          </pre>
                        </details>
                      ) : null}
                      {message.steps?.length ? (
                        <WorkedFold steps={message.steps} t={t} />
                      ) : null}
                      {message.content.trim() ? (
                        <MarkdownBody
                          source={withMentionNames(message.content)}
                          className="markdown-body chat-md text-[0.9375rem] leading-relaxed text-gray-900 dark:text-gray-100"
                        />
                      ) : null}
                      {message.media?.length ? (
                        <ToolMediaImages media={message.media} />
                      ) : null}
                      {message.options?.length ? (
                        <div
                          className="mt-2 flex flex-wrap gap-2"
                          role="group"
                          aria-label={t("chat.pickOne")}
                        >
                          {message.options.map((option) => (
                            <button
                              key={option}
                              type="button"
                              className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800"
                              disabled={busy}
                              onClick={() => void sendText(option)}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {message.artifacts?.length ? (
                        <ul
                          className={`flex flex-col gap-2 ${message.content.trim() ? "mt-2" : ""}`}
                        >
                          {message.artifacts.map((art) => {
                            const selected = art.id === activeArtifactId;
                            return (
                              <li key={art.id}>
                                <button
                                  type="button"
                                  className={`flex w-full items-start gap-3 rounded border px-3 py-2.5 text-left transition-colors ${
                                    selected
                                      ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900"
                                      : "border-gray-300 bg-white text-gray-800 hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800"
                                  }`}
                                  onClick={() => void openArtifactPane(art.id)}
                                >
                                  <span
                                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded text-xs font-bold ${
                                      selected
                                        ? "bg-white/20 text-white dark:bg-gray-900/15 dark:text-gray-900"
                                        : "bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700"
                                    }`}
                                    aria-hidden
                                  >
                                    A
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold">
                                      {art.title}
                                    </span>
                                    <span
                                      className={`mt-0.5 block text-[0.6875rem] ${
                                        selected
                                          ? "text-white/80 dark:text-gray-900/70"
                                          : "text-gray-700 dark:text-gray-400"
                                      }`}
                                    >
                                      {t(`artifacts.kind.${art.kind}`)} ·{" "}
                                      {t("chat.artifactOpen")}
                                    </span>
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                      {message.timingMs != null ? (
                        <span className="mt-1 block text-[0.6875rem] tabular-nums text-gray-600 dark:text-gray-400">
                          {message.thinking
                            ? t("chat.timingThinking", {
                                sec: formatLatencySeconds(message.timingMs),
                              })
                            : t("chat.timing", {
                                sec: formatLatencySeconds(message.timingMs),
                              })}
                        </span>
                      ) : null}
                    </SlackRow>
                  );
                })}

                {phase === "fetching" ? (
                  <div
                    className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300"
                    aria-live="polite"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded bg-gray-900/90 text-white dark:bg-gray-100/90 dark:text-gray-900">
                      <LinkIcon className="h-3.5 w-3.5 animate-pulse" />
                    </span>
                    <span>{t("chat.fetchingLinks")}</span>
                  </div>
                ) : null}

                {phase === "searching" ? (
                  <div
                    className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300"
                    aria-live="polite"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded bg-gray-900/90 text-white dark:bg-gray-100/90 dark:text-gray-900">
                      <GlobeIcon className="h-3.5 w-3.5 animate-pulse" />
                    </span>
                    <span>{t("chat.searching")}</span>
                  </div>
                ) : null}

                {streaming || streamingReasoning || phase === "answering" ? (
                  <div aria-live="polite">
                    {streaming ||
                    streamingReasoning ||
                    streamingTools ||
                    streamingSteps.length ? (
                      <SlackRow
                        grouped={false}
                        stamp={null}
                        name={liveAuthor?.name ?? t("chat.model")}
                        {...(liveAuthor?.persona
                          ? { subtitle: liveAuthor.persona }
                          : {})}
                        avatar={
                          liveAuthor ? (
                            <MemberAvatar
                              name={liveAuthor.name}
                              seed={liveAuthor.id}
                            />
                          ) : (
                            <BrandLogo
                              variant="mark"
                              theme={resolvedTheme === "dark" ? "onDark" : "light"}
                              className="h-8 w-8 shrink-0 rounded ring-1 ring-gray-900/5 dark:ring-white/10"
                            />
                          )
                        }
                        actions={null}
                      >
                        <StepList steps={streamingSteps} />
                        {streamingReasoning || streamingTools ? (
                          // Folded while it streams too: the running commentary
                          // pushed the answer off screen every turn.
                          <details className="chat-reasoning mb-1">
                            <summary className="chat-reasoning-summary">
                              {t("chat.reasoningLabel")}
                            </summary>
                            <pre className="chat-reasoning-body">
                              {[streamingReasoning, streamingTools]
                                .filter(Boolean)
                                .join("\n\n")}
                            </pre>
                          </details>
                        ) : null}
                        {streaming ? (
                          <MarkdownBody
                            source={streaming}
                            className="markdown-body chat-md text-[0.9375rem] leading-relaxed text-gray-900 dark:text-gray-100"
                          />
                        ) : null}
                      </SlackRow>
                    ) : (
                      // Slack's "[name] is typing…" with the bouncing dots —
                      // a full message row for silence felt like status noise.
                      <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                        <span
                          className="inline-flex items-center gap-1"
                          aria-hidden="true"
                        >
                          <span className="floor-typing-dot h-1.5 w-1.5 rounded-full bg-gray-500" />
                          <span className="floor-typing-dot h-1.5 w-1.5 rounded-full bg-gray-500" />
                          <span className="floor-typing-dot h-1.5 w-1.5 rounded-full bg-gray-500" />
                        </span>
                        <span className="min-w-0 truncate">
                          {t("floor.composing", {
                            role: liveAuthor?.name ?? t("chat.model"),
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <Composer
          ref={composerRef}
          onEmptyChange={setDraftEmpty}
          onFiles={(files) => void attachDropped(files)}
          above={
            <>
              {approval ? (
                <TaskApprovalPrompt
                  request={approval}
                  onDecide={(decision) => {
                    setApproval(null);
                    void window.office
                      .resolveTaskApproval({
                        callId: approval.callId,
                        decision,
                      })
                      .catch(() => undefined);
                  }}
                />
              ) : null}
              {cpuSlow && !cloudReady ? (
                <label className="mb-2 flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={voiceForce}
                    onChange={(event) => setVoiceForce(event.target.checked)}
                  />
                  {t("voice.cpuOverride")}
                </label>
              ) : null}
              {searchNotice ? (
                <div
                  className="mb-2 flex flex-wrap items-center gap-2 rounded border border-primary-muted bg-primary-soft px-3 py-2 text-sm text-foreground"
                  role="status"
                >
                  <span className="min-w-0 flex-1">{searchNotice}</span>
                  {challengePending ? (
                    <>
                      <button
                        type="button"
                        className="rounded bg-card px-2 py-1 text-xs font-medium text-primary-ink ring-1 ring-primary-muted"
                        disabled={busy}
                        onClick={() => void window.office.showWebSearch()}
                      >
                        {t("chat.searchOpenBrowser")}
                      </button>
                      <button
                        type="button"
                        className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
                        disabled={busy}
                        onClick={() => void retrySearch()}
                      >
                        {t("chat.searchRetry")}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
              {error ? (
                <p
                  className="mb-2 rounded border border-destructive-muted bg-destructive-soft px-3 py-2 text-sm text-destructive-ink"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              <AttachmentChips
                files={attachments}
                attaching={attaching}
                disabled={busy}
                onRemove={(id) =>
                  setAttachments((prev) =>
                    prev.filter((item) => item.id !== id),
                  )
                }
              />
              <VoiceStatus voice={voice} />
            </>
          }
          onSubmit={(markdown) => {
            if (busy && desktopRunning) {
              void window.office.abortTask(taskRunIdRef.current ?? undefined);
              return;
            }
            if (voice.armedRef.current) {
              void voice.stop();
              return;
            }
            void send(markdown);
          }}
          placeholder={
            voice.finalizing
              ? t("voice.finalizing")
              : voice.armed
                ? voice.connecting
                  ? t("voice.micConnecting")
                  : voice.justReady
                    ? t("voice.micReady")
                    : voice.liveWhisper
                      ? t("chat.liveCaptionsWhisper")
                      : t("voice.recording")
                : activeDmMemberId
                  ? t("chat.placeholderDm", {
                      name: dmMember?.name ?? t("chat.model"),
                    })
                  : t("chat.placeholderChannel", {
                      name: channel?.name ?? channelId,
                    })
          }
          readOnly={voice.finalizing}
          busy={busy}
          active={voice.armed}
          mentions={mentionItems}
          slashItems={flowSlashItems}
          canSend={
            // While a task runs the button is an abort. What decides that is
            // whether a desktop run is actually in flight, not whether the
            // toggle is on: chat routes to the desktop by itself now, and
            // keying off the toggle left those runs with no way to stop.
            busy
              ? desktopRunning
              : !draftEmpty || (attachments.length > 0 && !voice.armed)
          }
          sendLabel={busy && computerUse ? t("chat.taskAbort") : t("chat.send")}
          hint={t("chat.composerHint")}
          leading={
            <>
              <ComposerAction
                label={t("chat.attachFile")}
                disabled={busy || voice.armed}
                onClick={() => void attachFiles()}
              >
                <PaperclipIcon className="h-4 w-4" />
              </ComposerAction>
              <ComposerAction
                label={
                  webSearch ? t("chat.webSearchOn") : t("chat.webSearchOff")
                }
                active={webSearch}
                pressed={webSearch}
                tone="sky"
                disabled={busy || computerUse}
                onClick={() => setWebSearchEnabled(!webSearch)}
              >
                <GlobeIcon className="h-4 w-4" />
              </ComposerAction>
              <ComposerAction
                label={
                  computerUse
                    ? t("chat.computerUseOn")
                    : t("chat.computerUseOff")
                }
                active={computerUse}
                pressed={computerUse}
                tone="amber"
                disabled={busy}
                onClick={() => setComputerUse((v) => !v)}
              >
                <span className="text-[0.65rem] font-bold" aria-hidden>
                  PC
                </span>
              </ComposerAction>
            </>
          }
          trailing={
            <>
              <ComposerAction
                label={
                  voice.armed ? t("voice.recording") : t("voice.holdToTalk")
                }
                active={voice.armed}
                pressed={voice.armed}
                tone="brand"
                disabled={voice.finalizing || (!voice.armed && busy)}
                onClick={() => {
                  if (voice.armedRef.current) void voice.stop();
                  else void voice.start();
                }}
              >
                <MicIcon className="h-4 w-4" />
              </ComposerAction>
            </>
          }
        />
      </div>

      {pane && !landing ? (
        <>
          <PanelResizeHandle
            label={t("chat.paneResize")}
            onResizeStart={(event) => artifactPanels.beginResize("pane", event)}
            onReset={() => artifactPanels.reset("pane")}
          />
          <div
            className="flex min-h-0 flex-col border-l border-gray-300 dark:border-gray-800"
            style={artifactPanels.style("pane")}
          >
            <ChatSidePanel
              pane={pane}
              channel={channel}
              channelLabel={channelLabel}
              members={channelMembers}
              teammates={activeMembers}
              files={paneFiles}
              messageCount={chatMessageCount}
              artifactTitle={activeArtifact?.title ?? null}
              artifactSlot={
                <>
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4">
                    {artifactLoading ? (
                      <LoadingBlock label={t("artifacts.loading")} />
                    ) : (
                      <DocumentWorkspace
                        artifact={activeArtifact}
                        onCreated={(artifact) => {
                          setActiveArtifactId(artifact.id);
                          setActiveArtifact(artifact);
                        }}
                        onArtifactUpdated={(next) => {
                          setActiveArtifact(next);
                        }}
                        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
                      />
                    )}
                  </div>
                  {activeArtifact?.encoding !== "binary" &&
                  activeArtifact?.body ? (
                    <div className="flex shrink-0 gap-2 border-t border-gray-200 px-3 py-2 dark:border-gray-800">
                      <button
                        type="button"
                        className="btn-secondary flex-1 px-3 py-1.5 text-xs"
                        onClick={() => {
                          const blob = new Blob([activeArtifact.body], {
                            type: "text/markdown;charset=utf-8",
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `${activeArtifact.title.replace(/[^\w가-힣]+/g, "-") || "artifact"}.md`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        {t("artifacts.download")}
                      </button>
                    </div>
                  ) : null}
                </>
              }
              onClose={() => {
                if (pane.kind === "artifact") closeArtifactPane();
                else setPane(null);
              }}
              onOpenFile={(artifactId) => void openArtifactPane(artifactId)}
              onSelectMember={selectPaneMember}
              onInvite={(memberId) => void inviteToChannel(memberId)}
              onRemoveMember={(memberId) => void removeFromChannel(memberId)}
              onAddTeammate={() => setAddingTeammate(true)}
              onMemberSaved={(member) => {
                adoptMembers(
                  teamMembers.map((row) =>
                    row.id === member.id ? member : row,
                  ),
                );
              }}
              onMemberDeleted={(memberId) => {
                setPane(null);
                // They are deactivated, not gone: their past messages stay, so
                // the roster is refetched rather than the member dropped, and a
                // DM open with them steps back to a fresh chat.
                if (channelIdRef.current === dmChannelIdOf(memberId)) {
                  startNewChat();
                }
                void window.office.listTeamMembers().then(adoptMembers);
                void window.office
                  .floorSnapshot()
                  .then((snapshot) => setChannels(snapshot.channels))
                  .catch(() => undefined);
              }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * What a task saw, shown rather than described.
 *
 * Asking for a screenshot and being told "Captured display 59" is a receipt,
 * not an answer. The file is on this machine and the window is Chromium, so
 * the picture is simply displayed; clicking one opens it full size.
 */
/**
 * The question, asked where the person is.
 *
 * It used to be filed in the Office approval tray, which meant being sent to
 * another room to answer something about the conversation you were already
 * in. It is also asked in words: "screen.capture needs approval" is a property
 * name, and a decision is only as good as the question behind it.
 *
 * "Always allow" is the answer to the real complaint. A six-step task asked
 * six times teaches people to click through without reading, which is worse
 * than not asking.
 */
function TaskApprovalPrompt({
  request,
  onDecide,
}: {
  request: TaskApprovalRequestView;
  onDecide: (decision: "allow_once" | "allow_always" | "deny") => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="mb-2 rounded border border-warning-muted bg-warning-soft px-3 py-2.5">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-warning-ink">
        {t("chat.approvalNeeded")}
      </p>
      <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">
        {request.title}
      </p>
      {request.detail ? (
        <p className="mt-0.5 break-words text-xs text-gray-700 dark:text-gray-300">
          {request.detail}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-gray-100 dark:text-gray-900"
          onClick={() => onDecide("allow_once")}
        >
          {t("chat.approvalAllowOnce")}
        </button>
        <button
          type="button"
          className="rounded bg-white px-3 py-1.5 text-xs font-medium text-gray-800 ring-1 ring-gray-300 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700"
          onClick={() => onDecide("allow_always")}
        >
          {t("chat.approvalAllowAlways")}
        </button>
        <button
          type="button"
          className="rounded px-3 py-1.5 text-xs font-medium text-destructive-ink hover:bg-destructive-soft"
          onClick={() => onDecide("deny")}
        >
          {t("chat.approvalDeny")}
        </button>
      </div>
    </div>
  );
}

/**
 * Every citation a run produced, behind one collapsed lid.
 *
 * Each search used to print its own card, so a turn that searched three times
 * buried its answer under three link lists. One accordion per run keeps the
 * evidence one click away without making the reader scroll past it.
 */
function SourcesFold({
  group,
  emptyLabel,
  openLabel,
}: {
  group: SourceGroup;
  emptyLabel: string;
  openLabel: string;
}): JSX.Element {
  const { t } = useI18n();
  const tone = group.blocked
    ? "border-warning-muted bg-warning-soft text-foreground"
    : "border-primary-muted bg-primary-soft text-foreground";
  const iconTone = group.blocked
    ? "text-warning-ink"
    : "text-primary-ink";
  const labelTone = group.blocked
    ? "text-warning-ink"
    : "text-primary-ink";
  const queryLine = group.queries.join(" · ");

  return (
    <details className={`group rounded border text-sm ${tone}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <GlobeIcon className={`h-3.5 w-3.5 shrink-0 ${iconTone}`} />
        <span
          className={`shrink-0 text-xs font-semibold uppercase tracking-wide ${labelTone}`}
        >
          {t("chat.searchSourcesSummary", { count: group.refs.length })}
        </span>
        {queryLine ? (
          <span className="min-w-0 flex-1 truncate text-xs opacity-70">
            · {queryLine}
          </span>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        <span
          className={`ml-auto shrink-0 text-[0.625rem] transition-transform group-open:rotate-180 ${labelTone}`}
          aria-hidden
        >
          ▾
        </span>
      </summary>
      {group.refs.length === 0 ? (
        <p className="border-t border-black/5 px-4 py-3 text-xs opacity-80 dark:border-white/10">
          {emptyLabel}
        </p>
      ) : (
        <ul className="flex flex-col gap-2 border-t border-black/5 px-4 py-3 dark:border-white/10">
          {group.refs.map((ref) => (
            <li key={ref.url} className="min-w-0">
              <button
                type="button"
                className="group/hit block w-full rounded bg-white px-3 py-2 text-left transition hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800"
                onClick={() => void window.office.openExternal(ref.url)}
              >
                <p className="truncate text-sm font-medium text-gray-900 group-hover/hit:text-primary-ink dark:text-gray-100">
                  {ref.title}
                </p>
                {ref.snippet ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                    {ref.snippet}
                  </p>
                ) : null}
                <p className="mt-1 flex items-center gap-1.5 truncate text-[0.6875rem] text-primary-ink">
                  {ref.from === "page" ? (
                    <LinkIcon className="h-3 w-3 shrink-0" />
                  ) : null}
                  <span className="truncate">
                    {openLabel} · {ref.url}
                    {ref.blocked ? " · !" : ""}
                  </span>
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
