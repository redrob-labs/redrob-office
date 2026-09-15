import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "@redrob/ui";
import {
  FLOOR_STAFF_LAYERS,
  type ArtifactView,
  type ChatAttachment,
  type FloorBriefView,
  type FloorChannel,
  type FloorChannelPost,
  type FloorMeetingView,
  type FloorSeatView,
  type FloorSnapshotView,
  type FloorStaffLayer,
} from "../../shared/office-api";
import { MarkdownBody } from "./MarkdownBody";
import { DocumentWorkspace } from "./document-workspace";
import { nowMs } from "./clock";
import { Spinner } from "./Spinner";
import {
  Composer,
  ComposerAction,
  type ComposerHandle,
  type MentionItem,
} from "./Composer";
import { VoiceStatus, WhisperInstallDialog } from "./VoiceCapture";
import { useVoiceDictation } from "./use-voice-dictation";
import { setWebSearchEnabled, useWebSearchEnabled } from "./web-search-setting";
import {
  attachmentsContext,
  attachmentsFromFiles,
  MAX_ATTACHMENTS,
  mergeAttachments,
} from "./attach-files";
import { AttachmentChips } from "./AttachmentChips";
import { parseDirective } from "./floor-directive";
import { splitAddressee } from "./floor-mentions";
import {
  collectFloorFiles,
  matchesFloorSearch,
  type FloorFile,
} from "./floor-channel";
import {
  FLOOR_PANE_TABS,
  FLOOR_PANE_TITLE,
  isPaneOpen,
  nextPaneTab,
  togglePane,
  type FloorPane,
  type FloorPaneTab,
} from "./floor-pane";
import {
  buildFloorRows,
  saysItsOwnWords,
  type FloorRow,
} from "./floor-messages";
import {
  ArtifactsIcon,
  BellIcon,
  ChartIcon,
  ChatIcon,
  GlobeIcon,
  HashIcon,
  HeaderIconButton,
  MeetingIcon,
  MicIcon,
  PaperclipIcon,
  MoreVerticalIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  StopIcon,
  TrashIcon,
  UsersIcon,
  XIcon,
} from "./icons";

const DEFAULT_CHANNEL_ID = "general";

/**
 * The room everybody is in, for the moment before the first snapshot lands.
 * It is never created from here: the office seeds it, and this only keeps the
 * rail from opening without the one channel that always exists.
 */
const GENERAL_PLACEHOLDER: FloorChannel = {
  id: DEFAULT_CHANNEL_ID,
  name: DEFAULT_CHANNEL_ID,
  purpose: "",
  createdAt: 0,
  updatedAt: 0,
  system: true,
  memberIds: ["assistant"],
  defaultMemberId: "assistant",
  isDM: false,
};

/**
 * Type chips. The office reads as a chat, but every line is still one of five
 * typed messages, and the colour is how you tell a delivery from a challenge
 * without reading the sentence.
 */
/**
 * The badge beside a name, for the message types that have a word for it.
 *
 * `post.type` is an open string — a bus message type for a message, an audit
 * event name for a system note — so a type with nothing to say gets no badge.
 * Looking the label up blind put the untranslated key on screen instead.
 */
const TYPE_BADGE: Record<string, { labelKey: string; className: string }> = {
  REQUEST: {
    labelKey: "floor.typeREQUEST",
    className: "bg-gray-100 text-gray-600",
  },
  DELIVER: {
    labelKey: "floor.typeDELIVER",
    className: "bg-success-soft text-success-ink",
  },
  CHALLENGE: {
    labelKey: "floor.typeCHALLENGE",
    className: "bg-destructive-soft text-destructive-ink",
  },
  ESCALATE: {
    labelKey: "floor.typeESCALATE",
    className: "bg-warning-soft text-warning-ink",
  },
  BLOCK: {
    labelKey: "floor.typeBLOCK",
    className: "bg-gray-200 text-gray-700",
  },
};

const SEAT_DOT: Record<FloorSeatView["state"], string> = {
  working: "bg-success",
  blocked: "bg-destructive",
  "waiting-approval": "bg-warning",
  parked: "bg-gray-300",
  idle: "bg-gray-300",
};

const TAB_ICON: Record<
  FloorPaneTab,
  (props: { className?: string }) => JSX.Element
> = {
  meeting: MeetingIcon,
  files: ArtifactsIcon,
  directives: PinIcon,
  details: ChartIcon,
};

const TAB_LABEL_KEY: Record<FloorPaneTab, string> = {
  meeting: "floor.meetingRoom",
  files: "floor.tabFiles",
  directives: "floor.tabDirectives",
  details: "floor.details",
};

const STAFF_JOB_KEY: Record<FloorStaffLayer, { label: string; hint: string }> =
  {
    research: {
      label: "floor.staffJobResearch",
      hint: "floor.staffJobResearchHint",
    },
    editorial: {
      label: "floor.staffJobEditorial",
      hint: "floor.staffJobEditorialHint",
    },
    review: { label: "floor.staffJobReview", hint: "floor.staffJobReviewHint" },
    production: {
      label: "floor.staffJobProduction",
      hint: "floor.staffJobProductionHint",
    },
  };

/**
 * The five seats the office ships with, which have no name of their own to show.
 *
 * Their `role` is an English word the code routes on, and it was being printed
 * straight onto the nameplate - a Korean floor staffed by "Researcher". A seat
 * somebody hired keeps the role they typed, because that is already their words.
 */
const BUILTIN_ROLE_KEY: Record<string, string> = {
  manager: "floor.roleManager",
  researcher: "floor.roleResearcher",
  writer: "floor.roleWriter",
  reviewer: "floor.roleReviewer",
  publisher: "floor.rolePublisher",
};

function roleLabel(
  seat: FloorSeatView,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const key = seat.custom ? undefined : BUILTIN_ROLE_KEY[seat.staffId];
  return key ? t(key) : seat.role;
}

function clockLabel(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayLabel(at: number): string {
  return new Date(at).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * An unconfirmed line, shaped like the post it is about to become so it can go
 * through the same grouping as everything else instead of being appended to
 * the end as a special case.
 */
function outboxPost(line: OutboxLine, channelId: string): FloorChannelPost {
  return {
    id: line.id,
    channelId,
    kind: "message",
    type: "REQUEST",
    from: "floor-intake",
    to: "",
    origin: "human",
    body: line.body,
    detail: "",
    evidence: [],
    artifact: null,
    options: [],
    createdAt: line.createdAt,
    notBefore: line.createdAt,
    pending: false,
    traceId: "",
    meetingId: null,
    progress: null,
  };
}

function seatStatusKey(state: FloorSeatView["state"]): string {
  if (state === "working") return "floor.seatWorking";
  if (state === "blocked") return "floor.seatBlocked";
  if (state === "waiting-approval") return "floor.seatWaiting";
  if (state === "parked") return "floor.seatParked";
  return "floor.seatIdle";
}

function initials(role: string): string {
  const words = role.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
}

/** A line the composer has accepted but the main process has not confirmed yet. */
interface OutboxLine {
  id: string;
  channelId: string;
  body: string;
  createdAt: number;
}

export function FloorPanel({
  onOpenArtifact,
}: {
  /** Opens a delivered file in the Documents tab. */
  onOpenArtifact?: ((artifactId: string) => void) | undefined;
}): JSX.Element {
  const { t, locale } = useI18n();
  const webSearch = useWebSearchEnabled();
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [snapshot, setSnapshot] = useState<FloorSnapshotView | null>(null);
  const [snapshotAt, setSnapshotAt] = useState(0);
  const [posts, setPosts] = useState<FloorChannelPost[]>([]);
  const [outbox, setOutbox] = useState<OutboxLine[]>([]);
  const [brief, setBrief] = useState<{
    brief: FloorBriefView;
    markdown: string;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pane, setPane] = useState<FloorPane | null>(null);
  // Beside the conversation, not instead of it: opening a file used to send
  // you to the Documents tab and take the channel away with it.
  const openArtifactInPane = useCallback((artifactId: string): void => {
    setPane((current) => togglePane(current, { kind: "artifact", artifactId }));
  }, []);
  const [railOpen, setRailOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [approvalJump, setApprovalJump] = useState(0);
  const [channelId, setChannelId] = useState(DEFAULT_CHANNEL_ID);
  const [channelForm, setChannelForm] = useState<FloorChannel | "new" | null>(
    null,
  );
  const [staffForm, setStaffForm] = useState<FloorSeatView | "new" | null>(
    null,
  );
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const approvalsRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const composerRef = useRef<ComposerHandle | null>(null);
  /** A channel opened before the snapshot listing it has arrived. */
  const awaitingChannel = useRef<string | null>(null);
  /** The channel on screen, for discarding reads that arrive after a switch. */
  const openChannel = useRef(channelId);

  const loadChannel = useCallback(async () => {
    const requested = channelId;
    try {
      const next = await window.office.floorChannel(requested);
      // A slow read for the channel the reader just left must not land under
      // the name of the one they are looking at now.
      if (requested === openChannel.current) setPosts(next);
    } catch {
      // The snapshot error path already says the Floor is unavailable.
    }
  }, [channelId]);

  const refresh = useCallback(async () => {
    try {
      const next = await window.office.floorSnapshot();
      setSnapshot(next);
      setSnapshotAt(nowMs());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    // The scheduler broadcasts on every state change, which is also every time
    // something new was said. One subscription drives both halves of the view.
    return window.office.onFloorUpdate((next) => {
      setSnapshot(next);
      setSnapshotAt(nowMs());
    });
  }, [refresh]);

  // Settings → clear local documents now wipes Floor chat too. Without this
  // listener the channel kept showing the conversation that no longer exists.
  useEffect(() => {
    return window.office.onLocalDataWiped(() => {
      setPosts([]);
      setOutbox([]);
      setBrief(null);
      setNotice(null);
      setChannelId(DEFAULT_CHANNEL_ID);
      void refresh();
    });
  }, [refresh]);

  // Switching channels empties the thread on the way in. Leaving the previous
  // conversation on screen under the new channel's name for the length of a
  // round trip reads as the office having lost track of which room it is in.
  // Declared before the load effect so the ref is current when it runs.
  useEffect(() => {
    openChannel.current = channelId;
    setPosts([]);
  }, [channelId]);

  useEffect(() => {
    void loadChannel();
  }, [loadChannel, snapshot]);

  // A channel that was deleted from under the reader drops them back at the
  // office rather than leaving them staring at an empty view. A channel that
  // was just created is not that: the snapshot has not caught up yet, and
  // bouncing on it would undo the navigation into the new channel.
  useEffect(() => {
    const channels = snapshot?.channels;
    if (!channels || channels.length === 0) return;
    if (channels.some((channel) => channel.id === channelId)) {
      awaitingChannel.current = null;
      return;
    }
    if (awaitingChannel.current === channelId) return;
    setChannelId(channels[0]!.id);
  }, [snapshot, channelId]);

  useEffect(() => {
    if (!stickToBottom.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [posts, outbox]);

  // The approvals button lives in the header but the cards live in the
  // channel, so the jump has to survive the tab switch that puts them on screen.
  useEffect(() => {
    if (approvalJump === 0) return;
    approvalsRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [approvalJump]);

  // A paced message becomes visible on the scheduler's clock, and the
  // scheduler only broadcasts when something changes. Ticking locally between
  // broadcasts is what makes "is typing" stop at the moment the line lands
  // rather than at the next unrelated state change.
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    const handle = setInterval(() => setTicks((count) => count + 1), 1_000);
    return () => clearInterval(handle);
  }, []);

  // Localised here rather than at each nameplate, so every surface that names a
  // seat - messages, typing lines, meetings, the approval tray - reads the same.
  const roleFor = useMemo(() => {
    const map = new Map<string, string>();
    for (const seat of snapshot?.seats ?? [])
      map.set(seat.staffId, roleLabel(seat, t));
    return map;
  }, [snapshot, t]);

  const senderOf = useCallback(
    (staffId: string) => roleFor.get(staffId) ?? staffId,
    [roleFor],
  );

  // What `@` offers. The hint is what they are doing, because deciding who to ask
  // is mostly deciding who is free.
  const mentionable = useMemo<MentionItem[]>(
    () =>
      (snapshot?.seats ?? []).map((seat) => ({
        id: seat.staffId,
        label: roleLabel(seat, t),
        hint: seat.taskTitle ?? t(seatStatusKey(seat.state)),
      })),
    [snapshot, t],
  );

  // The office runs on the scheduler's clock, not the renderer's. Until the
  // first snapshot arrives there is no domain time, so nothing is held back.
  const now = useMemo(
    () =>
      snapshot
        ? snapshot.now + (nowMs() - snapshotAt)
        : Number.POSITIVE_INFINITY,
    // `ticks` is the input here: it is what makes this recompute between
    // broadcasts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot, snapshotAt, ticks],
  );

  /**
   * Who the reader should see as mid-sentence.
   *
   * Three different waits look identical from the outside, and all three used
   * to look like nothing at all: a seat that has picked a task up, a seat
   * whose model call is running and has written nothing yet, and a seat whose
   * answer exists but is still being paced out.
   */
  const composing = useMemo(() => {
    const ids = new Set<string>();
    for (const seat of snapshot?.seats ?? []) {
      if (seat.typing || seat.state === "working") ids.add(seat.staffId);
    }
    for (const post of posts) {
      if (post.kind !== "message") continue;
      if (post.pending && post.notBefore > now && post.origin !== "human")
        ids.add(post.from);
    }
    return ids;
  }, [snapshot, posts, now]);

  /** A paced message is not visible to its recipient yet, so it is not in the channel yet. */
  const visible = useMemo(
    () => posts.filter((post) => !(post.pending && post.notBefore > now)),
    [posts, now],
  );

  // An optimistic line stays up only until the real one arrives. Matching on
  // the text rather than on a receipt means a broadcast that lands before the
  // send resolves does not double the message on screen.
  const unconfirmed = useMemo(
    () =>
      outbox.filter(
        (line) =>
          line.channelId === channelId &&
          !visible.some(
            (post) => post.origin === "human" && post.body === line.body,
          ),
      ),
    [outbox, channelId, visible],
  );

  const searching = searchOpen && query.trim().length > 0;
  const shown = useMemo(
    () =>
      searching
        ? visible.filter((post) =>
            matchesFloorSearch(post, senderOf(post.from), query),
          )
        : visible,
    [searching, visible, senderOf, query],
  );

  const rows = useMemo(
    () =>
      buildFloorRows({
        posts: shown,
        // A search result is a list of hits, not a conversation, so nothing
        // half-sent belongs in it.
        sending: searching
          ? []
          : unconfirmed.map((line) => outboxPost(line, channelId)),
      }),
    [shown, searching, unconfirmed, channelId],
  );

  const files = useMemo(
    () => collectFloorFiles(visible, senderOf),
    [visible, senderOf],
  );

  /**
   * Send now, resolve the model later.
   *
   * The line goes up before the IPC round trip and the main process queues it
   * before anything asks an inference route for a token. Waiting on either is
   * what made the composer feel like it had swallowed the message.
   */
  async function send(markdown: string): Promise<void> {
    const text = markdown.trim();
    if (!text && attachments.length === 0) return;
    const files = attachments;
    composerRef.current?.clear();
    setAttachments([]);
    await sendText(text, files);
  }

  /**
   * Attach what was dropped on the composer or pasted into it.
   *
   * Text is what a seat can use: it arrives as quoted context on the work rather
   * than as a line in the channel. A picture is refused here rather than
   * accepted and quietly ignored, because no seat can look at one yet.
   */
  /** The paperclip, for people who would rather not drag anything. */
  async function attachPicked(): Promise<void> {
    try {
      const picked = await window.office.pickChatAttachments();
      const usable = picked.filter((file) => !file.image);
      if (usable.length > 0) {
        setAttachments((prev) => mergeAttachments(prev, usable));
        setNotice(null);
      }
      if (usable.length < picked.length) setNotice(t("floor.attachNoImages"));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }

  async function attachDropped(dropped: File[]): Promise<void> {
    if (dropped.length === 0) return;
    setAttaching(true);
    try {
      const outcome = await attachmentsFromFiles(dropped, attachments);
      const seen = outcome.files.filter((file) => file.image);
      const usable = outcome.files.filter((file) => !file.image);
      if (usable.length > 0) {
        setAttachments((prev) => mergeAttachments(prev, usable));
      }
      if (seen.length > 0) setNotice(t("floor.attachNoImages"));
      else if (outcome.rejected.some((item) => item.reason === "full")) {
        setNotice(t("composer.tooManyFiles", { count: MAX_ATTACHMENTS }));
      } else if (usable.length > 0) setNotice(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setAttaching(false);
    }
  }

  /**
   * Everything a message goes through once it has words, whether they were
   * typed or spoken.
   */
  async function sendText(
    text: string,
    files: readonly ChatAttachment[] = [],
  ): Promise<void> {
    stickToBottom.current = true;

    const directive = parseDirective(text);
    if (directive) {
      try {
        const result = await window.office.floorDirective(directive);
        setNotice(
          result.ok
            ? t("floor.directiveApplied", { kind: directive.kind })
            : t("floor.refused", { reason: result.reason }),
        );
      } catch (err) {
        setNotice(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    // A named seat is the sender's own assignment, so it goes with the message
    // and the lead is not asked to make a decision that is already made.
    const said = splitAddressee(
      text,
      (snapshot?.seats ?? []).map((seat) => seat.staffId),
    );
    // Attached text is for whoever picks the work up, so it rides the request
    // rather than the channel: nobody wants to scroll past a pasted CSV.
    const attached = attachmentsContext(files) || undefined;
    const body =
      said.text ||
      files.map((file) => file.name).join(", ") ||
      t("floor.attachedOnly");
    const line: OutboxLine = {
      id: `local-${nowMs()}-${Math.random().toString(36).slice(2, 8)}`,
      channelId,
      body,
      createdAt: nowMs(),
    };
    setOutbox((lines) => [...lines, line]);
    try {
      const result = await window.office.floorSay(
        body,
        channelId,
        said.to,
        attached,
      );
      if (!result.ok) {
        // The words are the user's, so they go back in the composer rather
        // than vanishing with the refusal.
        setNotice(t("floor.refused", { reason: result.reason }));
        composerRef.current?.setText(text);
        return;
      }
      setNotice(null);
      await loadChannel();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
      composerRef.current?.setText(text);
    } finally {
      setOutbox((lines) => lines.filter((item) => item.id !== line.id));
    }
  }

  /**
   * Stop what a seat is doing, from the seat.
   *
   * The abort itself is the directive the office already had; what was missing
   * was any way to reach it without knowing a trace id, which nothing in the UI
   * has ever shown a reader.
   */
  async function stopWork(seat: FloorSeatView): Promise<void> {
    if (!seat.traceId) return;
    try {
      const result = await window.office.floorDirective({
        kind: "ABORT",
        traceId: seat.traceId,
        body: "Stopped from the floor",
      });
      if (!result.ok) setNotice(t("floor.refused", { reason: result.reason }));
      else setNotice(null);
      await loadChannel();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }

  const voice = useVoiceDictation({
    busy: false,
    locale,
    t,
    onError: setNotice,
    // Speaking is a way of sending. The words go to the channel, not into the
    // box for a second confirmation.
    onTranscript: (text) => sendText(text),
    onArm: () => composerRef.current?.clear(),
  });

  async function decide(id: string, approved: boolean): Promise<void> {
    await window.office.floorResolveApproval(
      id,
      approved,
      approved ? "approved" : "rejected",
    );
    void loadChannel();
  }

  async function loadBrief(regenerate: boolean): Promise<void> {
    try {
      setBrief(await window.office.floorBrief(regenerate));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveChannel(input: {
    name: string;
    purpose: string;
  }): Promise<void> {
    const target = channelForm;
    if (!target) return;
    const result =
      target === "new"
        ? await window.office.floorCreateChannel(input)
        : await window.office.floorUpdateChannel(target.id, input);
    if (!result.ok) {
      setNotice(t("floor.refused", { reason: result.reason }));
      return;
    }
    setNotice(null);
    setChannelForm(null);
    awaitingChannel.current = result.channel.id;
    setChannelId(result.channel.id);
    void refresh();
  }

  async function removeChannel(channel: FloorChannel): Promise<void> {
    if (channel.system) return;
    if (
      !window.confirm(t("floor.channelDeleteConfirm", { name: channel.name }))
    )
      return;
    const result = await window.office.floorDeleteChannel(channel.id);
    if (!result.ok) {
      setNotice(t("floor.refused", { reason: result.reason }));
      return;
    }
    setNotice(null);
    setChannelForm(null);
    // Leave the deleted room. Prefer the office channel; if something has
    // gone wrong and it is gone too, land on whichever channel is left.
    if (channelId === channel.id) {
      const next =
        channels.find((item) => item.id === DEFAULT_CHANNEL_ID) ??
        channels.find((item) => item.id !== channel.id) ??
        null;
      setChannelId(next?.id ?? DEFAULT_CHANNEL_ID);
    }
    void refresh();
  }

  async function saveStaff(input: {
    role: string;
    layer: FloorStaffLayer;
    personality: string;
  }): Promise<void> {
    const target = staffForm;
    if (!target) return;
    const result =
      target === "new"
        ? await window.office.floorHireStaff(input)
        : await window.office.floorUpdateStaff(target.staffId, input);
    if (!result.ok) {
      setNotice(t("floor.refused", { reason: result.reason }));
      return;
    }
    setNotice(null);
    setStaffForm(null);
    void refresh();
  }

  async function dismissStaff(seat: FloorSeatView): Promise<void> {
    if (!window.confirm(t("floor.staffDismissConfirm", { role: seat.role })))
      return;
    const result = await window.office.floorDismissStaff(seat.staffId);
    if (!result.ok) {
      setNotice(t("floor.refused", { reason: result.reason }));
      return;
    }
    setNotice(null);
    setStaffForm(null);
    void refresh();
  }

  if (error && !snapshot) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold text-gray-900">
          {t("floor.title")}
        </h1>
        <p className="rounded border border-destructive-muted bg-destructive-soft px-4 py-6 text-sm text-destructive-ink">
          {t("floor.startError", { reason: error })}
        </p>
      </div>
    );
  }

  const seats = snapshot?.seats ?? [];
  const listed = snapshot?.channels ?? [];
  // #general is where the whole workspace is, so it is in the rail even while
  // the first snapshot is still on its way. A rail that can open empty is a
  // rail with no way back into the room everybody shares.
  const channels = listed.some((item) => item.id === DEFAULT_CHANNEL_ID)
    ? listed
    : [GENERAL_PLACEHOLDER, ...listed];
  const channel = channels.find((item) => item.id === channelId) ?? null;
  const pending = snapshot?.tray.pending ?? 0;
  const meetings = snapshot?.meetings ?? [];
  const directives = snapshot?.directives ?? [];

  return (
    <div className="relative flex min-h-0 w-full flex-1">
      <WhisperInstallDialog voice={voice} />
      {railOpen ? (
        <ChannelRail
          channels={channels}
          activeId={channelId}
          seats={seats}
          composing={composing}
          onSelect={(id) => setChannelId(id)}
          onNewChannel={() => setChannelForm("new")}
          onEditChannel={(item) => setChannelForm(item)}
          onDeleteChannel={(item) => void removeChannel(item)}
          onInviteStaff={() => setStaffForm("new")}
          onOpenProfile={(seat) =>
            setPane((current) =>
              togglePane(current, { kind: "profile", staffId: seat.staffId }),
            )
          }
        />
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ViewHeader
          channel={channel}
          snapshot={snapshot}
          seats={seats}
          pending={pending}
          railOpen={railOpen}
          onToggleRail={() => setRailOpen((open) => !open)}
          searchOpen={searchOpen}
          query={query}
          searchCount={shown.length}
          searchTotal={visible.length}
          onQuery={setQuery}
          onToggleSearch={() => {
            setSearchOpen((open) => {
              if (open) setQuery("");
              return !open;
            });
          }}
          onOpenDetails={() =>
            setPane((current) => togglePane(current, { kind: "details" }))
          }
          onManageChannel={() => {
            if (channel) setChannelForm(channel);
          }}
          onDeleteChannel={() => {
            if (channel && !channel.system) void removeChannel(channel);
          }}
          onJumpApprovals={() => setApprovalJump((count) => count + 1)}
        />

        <ChannelPaneBar
          active={pane}
          counts={{
            meeting: meetings.length,
            files: files.length,
            directives: directives.length,
          }}
          onSelect={(kind) =>
            setPane((current) => togglePane(current, { kind }))
          }
        />

        {snapshot?.productionHalted ? (
          <p className="shrink-0 border-b border-destructive-muted bg-destructive-soft px-5 py-2 text-sm font-medium text-destructive-ink">
            {t("floor.productionHalted", {
              pending,
              threshold: snapshot.tray.threshold,
            })}
          </p>
        ) : null}

        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              className="min-h-0 flex-1 overflow-auto px-5 py-4"
              onScroll={(event) => {
                const el = event.currentTarget;
                stickToBottom.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
            >
              <div className="flex w-full flex-col pb-2">
                {rows.length === 0 ? (
                  <p className="py-10 text-center text-sm text-gray-400">
                    {searching
                      ? t("floor.searchEmpty", { query })
                      : t("floor.channelEmpty")}
                  </p>
                ) : (
                  rows.map((row) => {
                    if (row.kind === "date")
                      return <DateDivider key={row.id} at={row.at} />;
                    if (row.kind === "note") {
                      return (
                        <NoteRow
                          key={row.id}
                          post={row.post}
                          roleFor={roleFor}
                        />
                      );
                    }
                    if (row.kind === "said") {
                      return (
                        <SaidRow
                          key={row.id}
                          post={row.post}
                          roleFor={roleFor}
                        />
                      );
                    }
                    if (row.kind === "progress") {
                      return (
                        <ProgressRow
                          key={row.id}
                          post={row.post}
                          roleFor={roleFor}
                        />
                      );
                    }
                    if (row.kind === "spoken") {
                      return (
                        <SpokenRow
                          key={row.id}
                          post={row.post}
                          roleFor={roleFor}
                          onOpenArtifact={openArtifactInPane}
                        />
                      );
                    }
                    return (
                      <MessageRow
                        key={row.id}
                        row={row}
                        roleFor={roleFor}
                        detailOpen={
                          pane?.kind === "message" &&
                          pane.postId === row.post.id
                        }
                        onOpenDetail={() =>
                          setPane((current) =>
                            togglePane(current, {
                              kind: "message",
                              postId: row.post.id,
                            }),
                          )
                        }
                        onOpenArtifact={openArtifactInPane}
                      />
                    );
                  })
                )}
                {searching ? null : (
                  <div
                    ref={approvalsRef}
                    className="flex flex-col gap-3 px-5 py-2"
                  >
                    {snapshot?.tray.items
                      .filter((item) => item.channelId === channelId)
                      .map((item) => (
                        <ApprovalCard
                          key={item.id}
                          item={item}
                          onDecide={decide}
                        />
                      ))}
                  </div>
                )}
                {searching
                  ? null
                  : [...composing].map((staffId) => {
                      const seat = seats.find(
                        (item) => item.staffId === staffId,
                      );
                      return (
                        <TypingRow
                          key={`typing-${staffId}`}
                          role={senderOf(staffId)}
                          {...(seat?.traceId
                            ? { onStop: () => void stopWork(seat) }
                            : {})}
                        />
                      );
                    })}
                <div ref={bottomRef} />
              </div>
            </div>

            <Composer
              ref={composerRef}
              above={
                <>
                  {notice ? (
                    <p className="mb-2 rounded bg-gray-100 px-3 py-1.5 text-xs text-gray-700">
                      {notice}
                    </p>
                  ) : null}
                  <AttachmentChips
                    files={attachments}
                    attaching={attaching}
                    onRemove={(id) =>
                      setAttachments((prev) =>
                        prev.filter((item) => item.id !== id),
                      )
                    }
                  />
                  <VoiceStatus voice={voice} />
                </>
              }
              onFiles={(files) => void attachDropped(files)}
              // A file on its own is worth sending; the words are optional.
              {...(attachments.length > 0 ? { canSend: true } : {})}
              readOnly={voice.finalizing}
              active={voice.armed}
              onSubmit={(markdown) => void send(markdown)}
              placeholder={t("floor.composerPlaceholder", {
                channel: channel?.name ?? t("floor.channelName"),
              })}
              sendLabel={t("floor.send")}
              mentions={mentionable}
              leading={
                <>
                  <ComposerAction
                    label={t("chat.attachFile")}
                    onClick={() => void attachPicked()}
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
                    onClick={() => setWebSearchEnabled(!webSearch)}
                  >
                    <GlobeIcon className="h-4 w-4" />
                  </ComposerAction>
                </>
              }
              // Saying so is what makes sending mid-turn feel deliberate rather
              // than like talking over someone.
              hint={
                composing.size > 0
                  ? t("floor.composerJoins")
                  : t("floor.directiveHelp")
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
                    disabled={voice.finalizing}
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

          {pane ? (
            <DetailPane pane={pane} onClose={() => setPane(null)}>
              {pane.kind === "meeting" ? (
                <MeetingTab meetings={meetings} roleFor={roleFor} />
              ) : null}
              {pane.kind === "files" ? (
                <FilesTab files={files} onOpen={openArtifactInPane} />
              ) : null}
              {pane.kind === "directives" ? (
                <DirectivesTab directives={directives} />
              ) : null}
              {pane.kind === "details" ? (
                <DetailsTab
                  snapshot={snapshot}
                  channel={channel}
                  brief={brief}
                  roleFor={roleFor}
                  onLoadBrief={loadBrief}
                />
              ) : null}
              {pane.kind === "message" ? (
                <MessagePane
                  post={posts.find((item) => item.id === pane.postId) ?? null}
                  sender={senderOf(
                    posts.find((item) => item.id === pane.postId)?.from ?? "",
                  )}
                  onOpenArtifact={openArtifactInPane}
                />
              ) : null}
              {pane.kind === "artifact" ? (
                <ArtifactPane
                  artifactId={pane.artifactId}
                  onOpenInDocuments={onOpenArtifact}
                />
              ) : null}
              {pane.kind === "profile" ? (
                <ProfilePane
                  seat={
                    seats.find((item) => item.staffId === pane.staffId) ?? null
                  }
                  typing={composing.has(pane.staffId)}
                  onEdit={() => {
                    const seat = seats.find(
                      (item) => item.staffId === pane.staffId,
                    );
                    if (seat) setStaffForm(seat);
                  }}
                  onStop={() => {
                    const seat = seats.find(
                      (item) => item.staffId === pane.staffId,
                    );
                    if (seat) void stopWork(seat);
                  }}
                />
              ) : null}
            </DetailPane>
          ) : null}
        </div>
      </div>

      {channelForm ? (
        <ChannelDialog
          channel={channelForm === "new" ? null : channelForm}
          onClose={() => setChannelForm(null)}
          onSave={saveChannel}
          onDelete={removeChannel}
        />
      ) : null}

      {staffForm ? (
        <StaffDialog
          seat={staffForm === "new" ? null : staffForm}
          onClose={() => setStaffForm(null)}
          onSave={saveStaff}
          onDismiss={dismissStaff}
        />
      ) : null}
    </div>
  );
}

/**
 * Slack's left rail: every channel in the office, then who is in it. Both
 * lists are editable from here, because the place you notice a channel needs
 * renaming is the place you are reading it.
 */
function ChannelRail({
  channels,
  activeId,
  seats,
  composing,
  onSelect,
  onNewChannel,
  onEditChannel,
  onDeleteChannel,
  onInviteStaff,
  onOpenProfile,
}: {
  channels: FloorChannel[];
  activeId: string;
  seats: FloorSeatView[];
  composing: Set<string>;
  onSelect: (id: string) => void;
  onNewChannel: () => void;
  onEditChannel: (channel: FloorChannel) => void;
  onDeleteChannel: (channel: FloorChannel) => void;
  onInviteStaff: () => void;
  onOpenProfile: (seat: FloorSeatView) => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <aside
      className="hidden w-56 shrink-0 flex-col overflow-auto border-r border-gray-200 bg-gray-50 px-2 py-3 md:flex"
      aria-label={t("floor.channels")}
    >
      <div className="flex items-center gap-1 px-2 pb-1">
        <p className="flex-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">
          {t("floor.channels")}
        </p>
        <HeaderIconButton
          className="p-1"
          side="bottom-end"
          label={t("floor.channelAdd")}
          onClick={onNewChannel}
        >
          <PlusIcon className="h-3.5 w-3.5" />
        </HeaderIconButton>
      </div>
      <ul className="flex flex-col gap-0.5">
        {channels.map((channel) => {
          const active = channel.id === activeId;
          return (
            <li key={channel.id} className="group relative">
              <button
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect(channel.id)}
                className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[0.8125rem] transition-colors ${
                  channel.system ? "pr-7" : "pr-12"
                } ${
                  active
                    ? "bg-gray-900 font-medium text-white"
                    : "text-gray-700 hover:bg-gray-200/70"
                }`}
              >
                <HashIcon
                  className={`h-3.5 w-3.5 shrink-0 ${active ? "text-white/70" : "text-gray-400"}`}
                />
                <span className="truncate">{channel.name}</span>
              </button>
              <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                {/*
                  Plain buttons with a native tooltip rather than the header's
                  hover-card one. The rail is a narrow `overflow-auto` column,
                  which clips an absolutely positioned tooltip and grows a
                  scrollbar around it, and the header button's light hover fill
                  turns a white icon invisible on the selected row.
                */}
                <button
                  type="button"
                  aria-label={t("floor.channelManage")}
                  title={t("floor.channelManage")}
                  className={`rounded p-1 transition-colors ${
                    active
                      ? "text-white/70 hover:bg-white/20 hover:text-white"
                      : "text-gray-400 hover:bg-gray-300/70 hover:text-gray-800"
                  }`}
                  onClick={() => onEditChannel(channel)}
                >
                  <PencilIcon className="h-3 w-3" />
                </button>
                {!channel.system ? (
                  <button
                    type="button"
                    aria-label={t("floor.channelDelete")}
                    title={t("floor.channelDelete")}
                    className={`rounded p-1 transition-colors ${
                      active
                        ? "text-white/70 hover:bg-white/20 hover:text-white"
                        : "text-gray-400 hover:bg-destructive-soft hover:text-destructive-ink"
                    }`}
                    onClick={() => onDeleteChannel(channel)}
                  >
                    <TrashIcon className="h-3 w-3" />
                  </button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex items-center gap-1 px-2 pb-1">
        <p className="flex-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">
          {t("floor.team")}
        </p>
        <HeaderIconButton
          className="p-1"
          side="bottom-end"
          label={t("floor.staffInvite")}
          onClick={onInviteStaff}
        >
          <PlusIcon className="h-3.5 w-3.5" />
        </HeaderIconButton>
      </div>
      <ul className="flex flex-col gap-0.5">
        {seats.map((seat) => (
          <li key={seat.staffId} className="group relative">
            <button
              type="button"
              onClick={() => onOpenProfile(seat)}
              className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-gray-200/70"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-900 text-[9px] font-semibold text-white">
                {initials(roleLabel(seat, t))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEAT_DOT[seat.state]}`}
                  />
                  <span className="truncate text-xs font-medium text-gray-900">
                    {roleLabel(seat, t)}
                  </span>
                </span>
                <span className="block truncate text-[11px] text-gray-500">
                  {composing.has(seat.staffId)
                    ? t("floor.typing")
                    : (seat.taskTitle ?? t(seatStatusKey(seat.state)))}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * Slack's channel header: what this place is on the left, what you can do to it
 * on the right.
 */
function ViewHeader({
  channel,
  snapshot,
  seats,
  pending,
  railOpen,
  onToggleRail,
  searchOpen,
  query,
  searchCount,
  searchTotal,
  onQuery,
  onToggleSearch,
  onOpenDetails,
  onManageChannel,
  onDeleteChannel,
  onJumpApprovals,
}: {
  channel: FloorChannel | null;
  snapshot: FloorSnapshotView | null;
  seats: FloorSeatView[];
  pending: number;
  railOpen: boolean;
  onToggleRail: () => void;
  searchOpen: boolean;
  query: string;
  searchCount: number;
  searchTotal: number;
  onQuery: (next: string) => void;
  onToggleSearch: () => void;
  onOpenDetails: () => void;
  onManageChannel: () => void;
  onDeleteChannel: () => void;
  onJumpApprovals: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent): void {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  return (
    <header className="shrink-0 border-b border-gray-200">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button
          type="button"
          className="flex min-w-0 items-center gap-1 rounded px-1.5 py-1 text-left hover:bg-gray-100"
          aria-label={t("floor.channelDetails")}
          onClick={onOpenDetails}
        >
          <HashIcon className="h-4 w-4 shrink-0 text-gray-500" />
          <span className="truncate text-base font-semibold tracking-tight text-gray-900">
            {channel?.name ?? t("floor.channelName")}
          </span>
        </button>

        {snapshot?.paused ? (
          <span className="shrink-0 rounded bg-gray-200 px-2 py-0.5 text-[11px] text-gray-700">
            {t("floor.paused")}
          </span>
        ) : null}

        <p className="hidden min-w-0 flex-1 truncate text-xs text-gray-500 lg:block">
          {channel?.purpose || t("floor.channelTopic")}
        </p>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            className={`flex items-center gap-1.5 rounded px-2 py-1.5 transition-colors ${
              railOpen ? "bg-gray-100" : "hover:bg-gray-100"
            }`}
            aria-pressed={railOpen}
            aria-label={t("floor.membersAction", { count: seats.length })}
            onClick={onToggleRail}
          >
            <UsersIcon className="h-4 w-4 text-gray-500" />
            <span className="flex items-center" aria-hidden="true">
              {seats.slice(0, 3).map((seat, index) => (
                <span
                  key={seat.staffId}
                  className={`flex h-6 w-6 items-center justify-center rounded bg-gray-900 text-[9px] font-semibold text-white ring-2 ring-white ${
                    index > 0 ? "-ml-2" : ""
                  }`}
                >
                  {initials(seat.role)}
                </span>
              ))}
            </span>
            <span className="text-xs font-medium text-gray-700">
              {seats.length}
            </span>
          </button>

          <span className="relative">
            <HeaderIconButton
              className="p-2"
              side="bottom-end"
              label={
                pending > 0
                  ? t("floor.approvalsAction", { count: pending })
                  : t("floor.approvalsNone")
              }
              disabled={pending === 0}
              onClick={onJumpApprovals}
            >
              <BellIcon className="h-[1.15rem] w-[1.15rem]" />
            </HeaderIconButton>
            {pending > 0 ? (
              <span className="pointer-events-none absolute -right-0.5 -top-0.5 min-w-[1.05rem] rounded bg-destructive px-1 text-center text-[10px] font-semibold leading-[1.05rem] text-destructive-foreground">
                {pending}
              </span>
            ) : null}
          </span>

          <HeaderIconButton
            className="p-2"
            side="bottom-end"
            label={t("floor.searchAction")}
            active={searchOpen}
            aria-pressed={searchOpen}
            onClick={onToggleSearch}
          >
            <SearchIcon className="h-[1.15rem] w-[1.15rem]" />
          </HeaderIconButton>

          <div className="relative" ref={menuRef}>
            <HeaderIconButton
              className="p-2"
              side="bottom-end"
              label={t("floor.moreActions")}
              active={menuOpen}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreVerticalIcon className="h-[1.15rem] w-[1.15rem]" />
            </HeaderIconButton>
            {menuOpen ? (
              <div
                aria-label={t("floor.moreActions")}
                className="absolute right-0 top-[calc(100%+6px)] z-40 w-60 rounded border border-gray-200 bg-white p-1.5 shadow-lg"
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
                  onClick={() => {
                    setMenuOpen(false);
                    onManageChannel();
                  }}
                >
                  <PencilIcon className="h-3.5 w-3.5 text-gray-500" />
                  {t("floor.channelManage")}
                </button>
                {channel && !channel.system ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-destructive-ink hover:bg-destructive-soft"
                    onClick={() => {
                      setMenuOpen(false);
                      onDeleteChannel();
                    }}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    {t("floor.channelDelete")}
                  </button>
                ) : null}
                {pending > 0 ? (
                  <p className="px-2 pb-1 pt-1.5 text-[11px] text-gray-400">
                    {t("floor.trayCount", {
                      pending,
                      threshold: snapshot?.tray.threshold ?? 0,
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {searchOpen ? (
        <div className="flex items-center gap-2 border-t border-gray-100 px-4 py-2">
          <SearchIcon className="h-4 w-4 shrink-0 text-gray-400" />
          <input
            ref={searchRef}
            type="search"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
            placeholder={t("floor.searchPlaceholder")}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onToggleSearch();
            }}
          />
          {query.trim() ? (
            <span className="shrink-0 text-[11px] text-gray-400">
              {t("floor.searchCount", {
                count: searchCount,
                total: searchTotal,
              })}
            </span>
          ) : null}
          <HeaderIconButton
            className="p-1.5"
            side="bottom-end"
            label={t("floor.searchClear")}
            onClick={onToggleSearch}
          >
            <XIcon className="h-4 w-4" />
          </HeaderIconButton>
        </div>
      ) : null}
    </header>
  );
}

/** Shared shell for the two things on the Floor a person edits directly. */
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}): JSX.Element {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded border border-gray-200 bg-white p-5 shadow-xl"
      >
        <div className="flex items-start gap-2">
          <h2 className="flex-1 text-base font-semibold text-gray-900">
            {title}
          </h2>
          <HeaderIconButton
            className="p-1.5"
            side="bottom-end"
            label="Close"
            onClick={onClose}
          >
            <XIcon className="h-4 w-4" />
          </HeaderIconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <label className="mt-4 block">
      <span className="block text-xs font-medium text-gray-700">{label}</span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[11px] text-gray-400">{hint}</span>
      ) : null}
    </label>
  );
}

const INPUT_CLASS =
  "mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900";

function ChannelDialog({
  channel,
  onClose,
  onSave,
  onDelete,
}: {
  channel: FloorChannel | null;
  onClose: () => void;
  onSave: (input: { name: string; purpose: string }) => Promise<void>;
  onDelete: (channel: FloorChannel) => Promise<void>;
}): JSX.Element {
  const { t } = useI18n();
  const [name, setName] = useState(channel?.name ?? "");
  const [purpose, setPurpose] = useState(channel?.purpose ?? "");
  const [busy, setBusy] = useState(false);
  const systemChannel = channel?.system === true;

  async function submit(): Promise<void> {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onSave({ name: name.trim(), purpose: purpose.trim() });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={
        channel
          ? t("floor.channelEdit", { name: channel.name })
          : t("floor.channelNew")
      }
      onClose={onClose}
    >
      <Field
        label={t("floor.channelNameLabel")}
        hint={
          systemChannel ? t("floor.channelNameLocked") : t("floor.channelNameHint")
        }
      >
        <input
          autoFocus={!systemChannel}
          className={`${INPUT_CLASS} ${systemChannel ? "bg-gray-100 text-gray-600" : ""}`}
          value={name}
          maxLength={40}
          // #general is the address the whole workspace shares, so it is shown
          // rather than offered: the office refuses the rename anyway.
          disabled={systemChannel}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
        />
      </Field>
      <Field
        label={t("floor.channelPurposeLabel")}
        hint={t("floor.channelPurposeHint")}
      >
        <textarea
          className={`${INPUT_CLASS} min-h-[4.5rem] resize-y`}
          value={purpose}
          maxLength={250}
          onChange={(event) => setPurpose(event.target.value)}
        />
      </Field>
      <div className="mt-5 flex items-center gap-2">
        {channel && !channel.system ? (
          <button
            type="button"
            className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium text-destructive-ink hover:bg-destructive-soft"
            onClick={() => void onDelete(channel)}
          >
            <TrashIcon className="h-3.5 w-3.5" />
            {t("floor.channelDelete")}
          </button>
        ) : null}
        <button
          type="button"
          className="btn-secondary ml-auto px-3 py-1.5 text-xs"
          onClick={onClose}
        >
          {t("floor.channelCancel")}
        </button>
        <button
          type="button"
          className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs"
          disabled={!name.trim() || busy}
          onClick={() => void submit()}
        >
          {busy ? <Spinner className="h-3 w-3" /> : null}
          {channel ? t("floor.channelSave") : t("floor.channelCreate")}
        </button>
      </div>
    </Dialog>
  );
}

function StaffDialog({
  seat,
  onClose,
  onSave,
  onDismiss,
}: {
  seat: FloorSeatView | null;
  onClose: () => void;
  onSave: (input: {
    role: string;
    layer: FloorStaffLayer;
    personality: string;
  }) => Promise<void>;
  onDismiss: (seat: FloorSeatView) => Promise<void>;
}): JSX.Element {
  const { t } = useI18n();
  const editable = seat === null || seat.custom;
  const [role, setRole] = useState(seat?.role ?? "");
  const [layer, setLayer] = useState<FloorStaffLayer>(() => {
    const current = seat?.layer;
    return current &&
      (FLOOR_STAFF_LAYERS as readonly string[]).includes(current)
      ? (current as FloorStaffLayer)
      : "research";
  });
  const [personality, setPersonality] = useState(seat?.personality ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    if (!role.trim() || !personality.trim() || busy) return;
    setBusy(true);
    try {
      await onSave({
        role: role.trim(),
        layer,
        personality: personality.trim(),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={
        seat
          ? t("floor.staffEditTitle", { role: seat.role })
          : t("floor.staffInviteTitle")
      }
      onClose={onClose}
    >
      {!editable ? (
        <p className="mt-3 rounded bg-gray-100 px-3 py-2 text-xs text-gray-600">
          {t("floor.staffBuiltIn")}
        </p>
      ) : null}

      <Field label={t("floor.staffRoleLabel")} hint={t("floor.staffRoleHint")}>
        <input
          autoFocus={editable}
          disabled={!editable}
          className={`${INPUT_CLASS} disabled:bg-gray-50 disabled:text-gray-500`}
          value={role}
          maxLength={40}
          onChange={(event) => setRole(event.target.value)}
        />
      </Field>

      <fieldset className="mt-4" disabled={!editable}>
        <legend className="text-xs font-medium text-gray-700">
          {t("floor.staffJobLabel")}
        </legend>
        <div className="mt-1 flex flex-col gap-1">
          {FLOOR_STAFF_LAYERS.map((id) => (
            <label
              key={id}
              className={`flex cursor-pointer items-start gap-2 rounded border px-3 py-2 ${
                layer === id ? "border-gray-900 bg-gray-50" : "border-gray-200"
              }`}
            >
              <input
                type="radio"
                name="staff-layer"
                className="mt-0.5"
                checked={layer === id}
                onChange={() => setLayer(id)}
              />
              <span className="min-w-0">
                <span className="block text-xs font-medium text-gray-900">
                  {t(STAFF_JOB_KEY[id].label)}
                </span>
                <span className="block text-[11px] text-gray-500">
                  {t(STAFF_JOB_KEY[id].hint)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        label={t("floor.staffPersonalityLabel")}
        hint={t("floor.staffPersonalityHint")}
      >
        <textarea
          disabled={!editable}
          className={`${INPUT_CLASS} min-h-[6rem] resize-y disabled:bg-gray-50 disabled:text-gray-500`}
          value={personality}
          maxLength={1_000}
          placeholder={t("floor.staffPersonalityPlaceholder")}
          onChange={(event) => setPersonality(event.target.value)}
        />
      </Field>

      <div className="mt-5 flex items-center gap-2">
        {seat && seat.custom ? (
          <button
            type="button"
            className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium text-destructive-ink hover:bg-destructive-soft"
            onClick={() => void onDismiss(seat)}
          >
            <TrashIcon className="h-3.5 w-3.5" />
            {t("floor.staffDismiss")}
          </button>
        ) : null}
        <button
          type="button"
          className="btn-secondary ml-auto px-3 py-1.5 text-xs"
          onClick={onClose}
        >
          {t("floor.staffCancel")}
        </button>
        {editable ? (
          <button
            type="button"
            className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs"
            disabled={!role.trim() || !personality.trim() || busy}
            onClick={() => void submit()}
          >
            {busy ? <Spinner className="h-3 w-3" /> : null}
            {seat ? t("floor.staffSave") : t("floor.staffHire")}
          </button>
        ) : null}
      </div>
    </Dialog>
  );
}

/**
 * The switcher for the right-hand pane. Each button opens its view beside the
 * conversation, and clicking the open one closes the pane again.
 */
function ChannelPaneBar({
  active,
  counts,
  onSelect,
}: {
  active: FloorPane | null;
  counts: Partial<Record<FloorPaneTab, number>>;
  onSelect: (tab: FloorPaneTab) => void;
}): JSX.Element {
  const { t } = useI18n();
  const tabRefs = useRef(new Map<FloorPaneTab, HTMLButtonElement>());

  return (
    <div
      role="toolbar"
      aria-label={t("floor.tabs")}
      aria-orientation="horizontal"
      className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-gray-200 px-3"
    >
      {FLOOR_PANE_TABS.map((id) => {
        const Icon = TAB_ICON[id];
        const label = t(TAB_LABEL_KEY[id]);
        const count = counts[id] ?? 0;
        const selected = isPaneOpen(active, id);
        return (
          <button
            key={id}
            ref={(node) => {
              if (node) tabRefs.current.set(id, node);
              else tabRefs.current.delete(id);
            }}
            type="button"
            aria-pressed={selected}
            aria-controls={selected ? "floor-detail-pane" : undefined}
            onClick={() => onSelect(id)}
            onKeyDown={(event) => {
              const next = nextPaneTab(id, event.key);
              if (!next) return;
              event.preventDefault();
              tabRefs.current.get(next)?.focus();
            }}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2 text-[0.8125rem] font-medium transition-colors ${
              selected
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
            {count > 0 ? (
              <span className="rounded bg-gray-100 px-1.5 text-[10px] font-semibold leading-4 text-gray-600">
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Three dots, the gesture every chat app has already taught people to read. */
function TypingDots(): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      <span className="floor-typing-dot h-1.5 w-1.5 rounded-full bg-gray-500" />
      <span className="floor-typing-dot h-1.5 w-1.5 rounded-full bg-gray-500" />
      <span className="floor-typing-dot h-1.5 w-1.5 rounded-full bg-gray-500" />
    </span>
  );
}

/**
 * A seat that is working but has not said anything yet.
 *
 * Shaped like a message so it lands in the conversation where the reply will,
 * rather than as a status line somewhere else. This is the whole stretch of a
 * turn that used to be silence: the model call runs for seconds and nothing on
 * screen said anyone was mid-sentence.
 */
function TypingRow({
  role,
  onStop,
}: {
  role: string;
  onStop?: () => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="group flex gap-2.5 px-5 py-1" aria-live="polite">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-gray-200 text-[11px] font-bold text-gray-500">
        {initials(role)}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="rounded bg-gray-100 px-3 py-2">
          <TypingDots />
        </span>
        <span className="truncate text-[13px] text-gray-500">
          {t("floor.composing", { role })}
        </span>
        {/* Where the waiting is, which is the only place a reader is looking for
            a way out of it. Not hidden until hover: wanting this to stop is a
            thing people feel while it is happening, and a control you have to go
            looking for is one that was not there. */}
        {onStop ? (
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
            onClick={onStop}
          >
            <StopIcon className="h-2.5 w-2.5" />
            {t("floor.stop")}
          </button>
        ) : null}
      </span>
    </div>
  );
}

/** Slack's day boundary: a hairline with the date sitting on it. */
function DateDivider({ at }: { at: number }): JSX.Element {
  return (
    <div className="relative my-3 px-5">
      <div className="border-t border-gray-200" />
      <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded border border-gray-200 bg-white px-3 py-0.5 text-xs font-bold text-gray-700">
        {dayLabel(at)}
      </span>
    </div>
  );
}

/** The office doing something to itself: centred, quiet, unattributed. */
function NoteRow({
  post,
  roleFor,
}: {
  post: FloorChannelPost;
  roleFor: Map<string, string>;
}): JSX.Element {
  const { t } = useI18n();
  const text =
    post.kind === "system"
      ? post.body
      : t("floor.handedTo", {
          role: roleFor.get(post.to) ?? post.to,
          task: post.detail || post.body.split("\n")[0] || "",
        });
  return (
    <p className="px-5 py-1 text-center text-xs text-gray-400">
      {clockLabel(post.createdAt)} · {text}
    </p>
  );
}

/**
 * The office speaking for itself: a hello answered, a question about what the
 * reader wants, or an answer to something they asked.
 *
 * For the catalog lines the post carries which kind of line it is and nothing
 * else, so the sentence is built here where the locale is known. An answer is
 * the exception - those words are the reply, written in the language the
 * question was asked in - so it is passed through untouched. Reusing
 * `MessageRow` is the point either way: this should sit in the conversation
 * looking like every other thing a colleague says, not like a notice about the
 * building.
 */
function SpokenRow({
  post,
  roleFor,
  onOpenArtifact,
}: {
  post: FloorChannelPost;
  roleFor: Map<string, string>;
  onOpenArtifact?: ((artifactId: string) => void) | undefined;
}): JSX.Element {
  const { t } = useI18n();
  const key =
    post.type === "floor.glitch"
      ? post.detail === "repeated"
        ? "floor.glitchAgain"
        : "floor.glitch"
      : post.type === "floor.needsGoal"
        ? post.type
        : `floor.smalltalk.${post.detail || "greeting"}`;
  return (
    <MessageRow
      row={{
        kind: "message",
        id: post.id,
        post: {
          ...post,
          kind: "message",
          body: saysItsOwnWords(post) ? post.body : t(key),
          // `detail` carried which line to say, which is bookkeeping. Left on
          // the post it prints under the sentence as the bare word "greeting".
          detail: "",
        },
        grouped: false,
        sending: false,
      }}
      roleFor={roleFor}
      detailOpen={false}
      onOpenDetail={() => undefined}
      {...(onOpenArtifact ? { onOpenArtifact } : {})}
    />
  );
}

/**
 * A colleague saying what they are about to do, in the channel, as a message.
 *
 * The spinner row below says the same thing in a line that the next update
 * overwrites, which works for "still going" and not for "I am searching for
 * this": by the time the person read it, it was gone. What travels is the
 * activity and its target, so the sentence is built in the reader's language.
 */
function SaidRow({
  post,
  roleFor,
}: {
  post: FloorChannelPost;
  roleFor: Map<string, string>;
}): JSX.Element {
  const { t } = useI18n();
  const activity = post.progress?.activity ?? "thinking";
  const target = post.progress?.target ?? "";
  return (
    <MessageRow
      row={{
        kind: "message",
        id: post.id,
        post: {
          ...post,
          kind: "message",
          body: t(`floor.saying.${activity}${target ? "At" : ""}`, { target }),
          detail: "",
        },
        grouped: false,
        sending: false,
      }}
      roleFor={roleFor}
      detailOpen={false}
      onOpenDetail={() => undefined}
    />
  );
}

/**
 * A colleague saying what they are doing while they are still doing it.
 *
 * Indented into the message column rather than centred like a system note,
 * because this is a person talking, not the office announcing something. Kept
 * quiet enough that a channel full of work still reads as the work.
 */
function ProgressRow({
  post,
  roleFor,
}: {
  post: FloorChannelPost;
  roleFor: Map<string, string>;
}): JSX.Element {
  const { t } = useI18n();
  const role = roleFor.get(post.from) ?? post.from;
  const activity = post.progress?.activity ?? "thinking";
  const target = post.progress?.target ?? "";
  const minutes = Math.floor((post.progress?.elapsedMs ?? 0) / 60_000);
  const key = `floor.progress.${activity}${target ? "At" : ""}`;
  return (
    <p className="flex items-center gap-2 py-0.5 pl-[3.25rem] pr-5 text-[13px] text-gray-500">
      <span className="flex shrink-0 items-end gap-0.5" aria-hidden="true">
        <span className="floor-typing-dot h-1.5 w-1.5 rounded-full bg-gray-400" />
        <span className="floor-typing-dot h-1.5 w-1.5 rounded-full bg-gray-400" />
        <span className="floor-typing-dot h-1.5 w-1.5 rounded-full bg-gray-400" />
      </span>
      <span className="min-w-0 truncate">
        {t(key, { role, target })}
        {minutes > 0 ? ` · ${t("floor.progressElapsed", { minutes })}` : ""}
      </span>
    </p>
  );
}

/**
 * One message, laid out the way Slack lays one out: no bubble, left aligned
 * whoever sent it, a squircle avatar in a fixed gutter, and the nameplate
 * dropped when this line continues a run from the same sender. The reader's own
 * messages are not treated specially — Slack does not right-align yours either,
 * and pulling them to the other side of the pane is what stopped this reading
 * like a workplace channel and started it reading like a phone.
 */
function MessageRow({
  row,
  roleFor,
  detailOpen,
  onOpenDetail,
  onOpenArtifact,
}: {
  row: Extract<FloorRow, { kind: "message" }>;
  roleFor: Map<string, string>;
  detailOpen: boolean;
  onOpenDetail: () => void;
  onOpenArtifact?: ((artifactId: string) => void) | undefined;
}): JSX.Element {
  const { t } = useI18n();
  const { post, grouped, sending } = row;
  const human = post.origin === "human";
  const name = human ? t("floor.you") : (roleFor.get(post.from) ?? post.from);
  const badge = TYPE_BADGE[post.type];
  const toRole = !human && post.to ? (roleFor.get(post.to) ?? post.to) : "";

  return (
    <div
      className={`group relative flex gap-2.5 px-5 hover:bg-gray-50 ${
        grouped ? "py-0.5" : "mt-2 py-1"
      } ${sending ? "opacity-60" : ""}`}
    >
      <span className="w-9 shrink-0">
        {grouped ? (
          // Slack keeps the gutter and puts the time in it on hover, so a run
          // of messages stays aligned without repeating the nameplate.
          <span className="hidden pt-1 text-right text-[11px] leading-[1.46] text-gray-400 group-hover:block">
            {clockLabel(post.createdAt)}
          </span>
        ) : (
          <span
            className={`flex h-9 w-9 items-center justify-center rounded text-[11px] font-bold text-white ${
              human ? "bg-brand-600" : "bg-gray-800"
            }`}
          >
            {initials(name)}
          </span>
        )}
      </span>

      <div className="min-w-0 flex-1">
        {grouped ? null : (
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="text-[15px] font-bold leading-tight text-gray-900">
              {name}
            </span>
            {human || !badge ? null : (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}
              >
                {t(badge.labelKey)}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {clockLabel(post.createdAt)}
            </span>
            {sending ? <Spinner className="h-2.5 w-2.5 text-gray-400" /> : null}
          </p>
        )}
        {/*
          The composer sends markdown, so the channel has to read it. Plain
          text here is what left `**bold**` and backticks sitting in the
          message for everyone to see.
        */}
        <div className="text-[15px] leading-[1.46] text-gray-900">
          {toRole ? (
            <span className="font-medium text-brand-600">@{toRole} </span>
          ) : null}
          <MarkdownBody source={post.body} className="markdown-body floor-md" />
        </div>
        {post.detail ? (
          <p className="mt-1 text-[13px] leading-[1.46] text-gray-500">
            {post.detail}
          </p>
        ) : null}
        {post.artifact ? (
          <ArtifactCard artifact={post.artifact} onOpen={onOpenArtifact} />
        ) : null}
        {post.evidence.length > 0 ? (
          <button
            type="button"
            className={`mt-1 self-start text-[13px] underline decoration-dotted ${
              detailOpen
                ? "text-brand-600"
                : "text-gray-500 hover:text-gray-900"
            }`}
            aria-expanded={detailOpen}
            aria-controls={detailOpen ? "floor-detail-pane" : undefined}
            onClick={onOpenDetail}
          >
            {t("floor.evidenceCount", { count: post.evidence.length })}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ArtifactCard({
  artifact,
  onOpen,
  meta,
}: {
  artifact: NonNullable<FloorChannelPost["artifact"]>;
  onOpen?: ((artifactId: string) => void) | undefined;
  /** One line under the file name when the card is out of the conversation. */
  meta?: string;
}): JSX.Element {
  const { t } = useI18n();
  const openable = Boolean(artifact.artifactId && onOpen);
  return (
    <button
      type="button"
      disabled={!openable}
      onClick={() => {
        if (artifact.artifactId && onOpen) onOpen(artifact.artifactId);
      }}
      className={`mt-1.5 flex w-full items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-left ${
        openable ? "hover:bg-gray-100" : "cursor-default"
      }`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white text-[10px] font-semibold text-gray-500">
        {artifact.kind.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-gray-900">
          {artifact.label}
        </span>
        <span className="block truncate text-[10px] text-gray-500">
          {meta ? `${meta} · ${artifact.ref}` : artifact.ref}
        </span>
      </span>
      {openable ? (
        <span className="shrink-0 text-[11px] text-brand-600">
          {t("floor.open")}
        </span>
      ) : null}
    </button>
  );
}

/**
 * A document read beside the conversation that produced it.
 *
 * Opening a file used to mean being sent to the Documents tab, which costs you
 * the channel you were reading. The pane is where everything else that needs
 * room already opens, so a document opens there too, and Documents stays one
 * click away for the person who wants the whole editor.
 */
function ArtifactPane({
  artifactId,
  onOpenInDocuments,
}: {
  artifactId: string;
  onOpenInDocuments?: ((artifactId: string) => void) | undefined;
}): JSX.Element {
  const { t } = useI18n();
  const [artifact, setArtifact] = useState<ArtifactView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setArtifact(null);
    setFailed(false);
    void window.office
      .getArtifact(artifactId)
      .then((full) => {
        if (!live) return;
        setArtifact(full);
        setFailed(!full);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [artifactId]);

  if (failed) {
    return (
      <p className="px-4 py-6 text-xs text-gray-500">{t("floor.paneNoDoc")}</p>
    );
  }
  if (!artifact) {
    return (
      <p className="px-4 py-6 text-xs text-gray-500">{t("documents.loading")}</p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DocumentWorkspace
        artifact={artifact}
        onArtifactUpdated={(next) => setArtifact(next)}
      />
      {onOpenInDocuments ? (
        <button
          type="button"
          className="border-t border-gray-200 px-4 py-2 text-left text-[11px] text-brand-600 hover:bg-gray-50"
          onClick={() => onOpenInDocuments(artifact.id)}
        >
          {t("floor.paneOpenInDocuments")}
        </button>
      ) : null}
    </div>
  );
}

/** The one thing on the Floor that needs a person, put where they are looking. */
function ApprovalCard({
  item,
  onDecide,
}: {
  item: FloorSnapshotView["tray"]["items"][number];
  onDecide: (id: string, approved: boolean) => Promise<void>;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="rounded border-2 border-warning-muted bg-warning-soft px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-warning-ink">
        {t("floor.needsYou")}
      </p>
      <p className="mt-1 text-sm font-medium text-gray-900">{item.headline}</p>
      {item.dissent ? (
        <p className="mt-1 text-xs text-gray-600">
          {t("floor.dissent")}: {item.dissent}
        </p>
      ) : null}
      {item.evidence.length > 0 ? (
        <p className="mt-1 text-[11px] text-gray-500">
          {t("floor.evidence")}: {item.evidence.join(", ")}
        </p>
      ) : null}
      {item.options.length > 0 ? (
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {item.options.map((option) => (
            <li key={option} className="text-xs text-gray-700">
              · {option}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          className="btn-primary px-3 py-1 text-xs"
          onClick={() => void onDecide(item.id, true)}
        >
          {t("floor.approve")}
        </button>
        <button
          type="button"
          className="btn-secondary px-3 py-1 text-xs"
          onClick={() => void onDecide(item.id, false)}
        >
          {t("floor.reject")}
        </button>
      </div>
    </div>
  );
}

/**
 * Slack's right-hand pane: a column beside the conversation with a heading and
 * a close button, holding whatever needed more room than a message row.
 */
function DetailPane({
  pane,
  onClose,
  children,
}: {
  pane: FloorPane;
  onClose: () => void;
  children: ReactNode;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <aside
      id="floor-detail-pane"
      aria-label={t(FLOOR_PANE_TITLE[pane.kind])}
      className="flex w-[22rem] min-w-0 shrink-0 flex-col border-l border-gray-200 bg-white xl:w-[26rem]"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-4 py-2.5">
        <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">
          {t(FLOOR_PANE_TITLE[pane.kind])}
        </h2>
        <button
          type="button"
          className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          aria-label={t("floor.paneClose")}
          title={t("floor.paneClose")}
          onClick={onClose}
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
      {children}
    </aside>
  );
}

/** One message, opened out: what it said, where it came from, what it left. */
function MessagePane({
  post,
  sender,
  onOpenArtifact,
}: {
  post: FloorChannelPost | null;
  sender: string;
  onOpenArtifact?: ((artifactId: string) => void) | undefined;
}): JSX.Element {
  const { t } = useI18n();
  if (!post) {
    return (
      <TabBody>
        <EmptyTab>{t("floor.paneMessageMissing")}</EmptyTab>
      </TabBody>
    );
  }
  return (
    <TabBody>
      <section className="flex flex-col gap-1">
        <p className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-gray-900">{sender}</span>
          <span className="text-xs text-gray-500">
            {clockLabel(post.createdAt)}
          </span>
        </p>
        <MarkdownBody
          source={post.body}
          className="markdown-body chat-md text-sm leading-relaxed text-gray-800"
        />
        {post.detail ? (
          <p className="text-[13px] text-gray-500">{post.detail}</p>
        ) : null}
      </section>

      {post.artifact ? (
        <ArtifactCard artifact={post.artifact} onOpen={onOpenArtifact} />
      ) : null}

      {post.evidence.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionTitle>{t("floor.paneMessageSources")}</SectionTitle>
          <ul className="flex flex-col gap-1">
            {post.evidence.map((item, index) => (
              <li
                key={`${item.label}-${index}`}
                className="text-[13px] text-gray-700"
              >
                {item.label}
                {item.locator ? ` #${item.locator}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </TabBody>
  );
}

/** Who someone is, without leaving the conversation they said it in. */
function ProfilePane({
  seat,
  typing,
  onEdit,
  onStop,
}: {
  seat: FloorSeatView | null;
  typing: boolean;
  onEdit: () => void;
  onStop: () => void;
}): JSX.Element {
  const { t } = useI18n();
  if (!seat) {
    return (
      <TabBody>
        <EmptyTab>{t("floor.paneProfileMissing")}</EmptyTab>
      </TabBody>
    );
  }
  return (
    <TabBody>
      <div className="flex flex-col items-center gap-2 pb-1 pt-2 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded bg-gray-900 text-xl font-semibold text-white">
          {initials(roleLabel(seat, t))}
        </span>
        <p className="text-base font-bold text-gray-900">
          {roleLabel(seat, t)}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className={`h-2 w-2 rounded-full ${SEAT_DOT[seat.state]}`} />
          {typing ? t("floor.typing") : t(seatStatusKey(seat.state))}
        </p>
      </div>

      <section className="surface flex flex-col gap-2 px-4 py-3">
        <SectionTitle>{t("floor.paneProfileWorking")}</SectionTitle>
        <p className="text-sm text-gray-800">
          {seat.taskTitle ?? t("floor.paneProfileIdle")}
        </p>
        {seat.traceId ? (
          <button
            type="button"
            className="btn-secondary flex items-center gap-1.5 self-start px-2.5 py-1.5 text-xs"
            onClick={onStop}
          >
            <StopIcon className="h-3 w-3" />
            {t("floor.stop")}
          </button>
        ) : null}
      </section>

      <button
        type="button"
        className="btn-secondary px-3 py-2 text-sm"
        onClick={onEdit}
      >
        {t("floor.paneProfileEdit")}
      </button>
    </TabBody>
  );
}

/** Scroll body shared by every view the pane can hold. */
function TabBody({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        {children}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
      {children}
    </p>
  );
}

function EmptyTab({ children }: { children: ReactNode }): JSX.Element {
  return <p className="py-10 text-center text-sm text-gray-400">{children}</p>;
}

function MeetingTab({
  meetings,
  roleFor,
}: {
  meetings: FloorMeetingView[];
  roleFor: Map<string, string>;
}): JSX.Element {
  const { t } = useI18n();
  if (meetings.length === 0) {
    return (
      <TabBody>
        <EmptyTab>{t("floor.meetingEmpty")}</EmptyTab>
      </TabBody>
    );
  }
  return (
    <TabBody>
      {meetings.map((meeting) => (
        <section key={meeting.id} className="surface px-4 py-3">
          <p className="text-sm font-medium text-gray-900">{meeting.topic}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {t("floor.meetingRound", {
              round: meeting.round,
              max: meeting.maxRounds,
            })}
            {meeting.state !== "open" ? ` · ${t("floor.meetingLocked")}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {meeting.participants.map((id) => roleFor.get(id) ?? id).join(", ")}
          </p>
          {meeting.outcome ? (
            <p className="mt-1.5 text-xs text-gray-700">
              <span className="font-medium">{t("floor.meetingOutcome")}</span>{" "}
              {meeting.outcome}
            </p>
          ) : null}
        </section>
      ))}
    </TabBody>
  );
}

/** Slack's Files and links, built out of what the office delivered. */
function FilesTab({
  files,
  onOpen,
}: {
  files: FloorFile[];
  onOpen?: ((artifactId: string) => void) | undefined;
}): JSX.Element {
  const { t } = useI18n();
  if (files.length === 0) {
    return (
      <TabBody>
        <EmptyTab>{t("floor.filesEmpty")}</EmptyTab>
      </TabBody>
    );
  }
  return (
    <TabBody>
      {files.map((file) => (
        <ArtifactCard
          key={file.artifact.artifactId ?? file.artifact.ref}
          artifact={file.artifact}
          onOpen={onOpen}
          meta={`${file.from} · ${clockLabel(file.deliveredAt)}`}
        />
      ))}
    </TabBody>
  );
}

function DirectivesTab({
  directives,
}: {
  directives: FloorSnapshotView["directives"];
}): JSX.Element {
  const { t } = useI18n();
  return (
    <TabBody>
      {directives.length === 0 ? (
        <EmptyTab>{t("floor.directivesEmpty")}</EmptyTab>
      ) : (
        directives.map((directive) => (
          <section key={directive.id} className="surface px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {directive.kind}
            </p>
            <p className="mt-1 text-sm text-gray-800">{directive.body}</p>
          </section>
        ))
      )}
      <p className="px-1 text-[11px] text-gray-400">
        {t("floor.directiveHelp")}
      </p>
    </TabBody>
  );
}

/** Everything that is true about the office but is not part of the conversation. */
function DetailsTab({
  snapshot,
  channel,
  brief,
  roleFor,
  onLoadBrief,
}: {
  snapshot: FloorSnapshotView | null;
  channel: FloorChannel | null;
  brief: { brief: FloorBriefView; markdown: string } | null;
  roleFor: Map<string, string>;
  onLoadBrief: (regenerate: boolean) => Promise<void>;
}): JSX.Element {
  const { t } = useI18n();
  const [loadingBrief, setLoadingBrief] = useState(false);

  async function load(regenerate: boolean): Promise<void> {
    setLoadingBrief(true);
    try {
      await onLoadBrief(regenerate);
    } finally {
      setLoadingBrief(false);
    }
  }

  return (
    <TabBody>
      {channel ? (
        <section className="surface px-4 py-3">
          <SectionTitle>{t("floor.channelPurposeLabel")}</SectionTitle>
          <p className="mt-1.5 text-sm text-gray-800">
            {channel.purpose || t("floor.channelPurposeEmpty")}
          </p>
        </section>
      ) : null}

      {snapshot ? (
        <section className="surface px-4 py-3">
          <SectionTitle>{t("floor.wallMetrics")}</SectionTitle>
          <dl className="mt-1.5 grid grid-cols-3 gap-2 text-xs">
            <div>
              <dt className="text-gray-500">{t("floor.wallCost")}</dt>
              <dd className="font-medium text-gray-900">
                {(snapshot.wall.costMicros / 1_000_000).toFixed(2)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">{t("floor.wallGate")}</dt>
              <dd className="font-medium text-gray-900">
                {Math.round(snapshot.wall.gatePassRate * 100)}%
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">{t("floor.wallRework")}</dt>
              <dd className="font-medium text-gray-900">
                {Math.round(snapshot.wall.reworkRate * 100)}%
              </dd>
            </div>
          </dl>
          <p className="mt-2.5 text-xs text-gray-500">
            {t("floor.tokenMeterValue", {
              used: snapshot.meter.tokens.toLocaleString(),
              budget: snapshot.meter.budget.toLocaleString(),
            })}
          </p>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-full ${snapshot.meter.lightsOut ? "bg-destructive" : "bg-gray-900"}`}
              style={{
                width: `${Math.min(100, Math.round(snapshot.meter.ratio * 100))}%`,
              }}
            />
          </div>
        </section>
      ) : null}

      {snapshot && snapshot.agenda.length > 0 ? (
        <section className="surface px-4 py-3">
          <SectionTitle>{t("floor.agenda")}</SectionTitle>
          <ul className="mt-1.5 flex flex-col gap-1">
            {snapshot.agenda.map((item) => (
              <li key={item.id} className="text-xs text-gray-600">
                {item.label}
                <span className="text-gray-400">
                  {" "}
                  · {roleFor.get(item.staffId) ?? item.staffId}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="surface px-4 py-3">
        <div className="flex items-center gap-2">
          <SectionTitle>{t("floor.brief")}</SectionTitle>
          <button
            type="button"
            className="btn-secondary ml-auto flex items-center gap-1.5 px-2 py-0.5 text-[10px]"
            disabled={loadingBrief}
            onClick={() => void load(true)}
          >
            {loadingBrief ? <Spinner className="h-2.5 w-2.5" /> : null}
            {t("floor.briefRefresh")}
          </button>
        </div>
        {brief ? (
          <MarkdownBody
            source={brief.markdown}
            className="markdown-body mt-1.5 text-xs"
          />
        ) : (
          <button
            type="button"
            className="btn-secondary mt-1.5 flex w-full items-center justify-center gap-1.5 px-2 py-1 text-xs"
            disabled={loadingBrief}
            onClick={() => void load(false)}
          >
            {loadingBrief ? <Spinner className="h-3 w-3" /> : null}
            {t("floor.brief")}
          </button>
        )}
      </section>
    </TabBody>
  );
}
