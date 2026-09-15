import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  appendOfficeEvent,
  clearAuditLog,
  readAudit,
  type AuditEntry,
} from "../audit/tool-audit.js";
import { toolGroupOf, APPROVAL_REQUIRED_TOOLS } from "../security/index.js";
import type { SecurityPolicyBundle } from "../security/index.js";
import type { TaskModelCall, ApprovalDecision } from "../office/runtime.js";
import { allowAlways, isAlwaysAllowed } from "./chat-permissions.js";
import type { TaskStreamEvent } from "../tools/types.js";
import { WEB_TOOL_NAMES } from "../tools/web-tools.js";
import { MessageBus } from "./bus/index.js";
import { INTAKE_ID } from "./bus/types.js";
import type { ArtifactRef, EvidenceRef, FloorMessage } from "./bus/types.js";
import { openFloorDb, type FloorDb } from "./queue/sqlite.js";
import { migrateFloorDb } from "./queue/schema.js";
import { FloorQueue, type QueuedRow } from "./queue/queue.js";
import {
  DirectiveStore,
  TraceStore,
  type DirectiveKind,
} from "./traces/index.js";
import { MeetingRoom } from "./meetings/index.js";
import {
  ApprovalTray,
  APPROVAL_TRAY_HALT_THRESHOLD,
} from "./approvals/tray.js";
import { TokenMeter } from "./budget/token-meter.js";
import { TaskStore } from "./tasks/store.js";
import { executeTask, type TaskExecutionExtraTool } from "./tasks/executor.js";
import { activityOf, progressSummary, type Activity } from "./progress.js";
import {
  runDeterministicGates,
  recordGateResults,
  gateStats,
  type GateResult,
} from "./tasks/gates.js";
import {
  ASK_TEMPLATE_ID,
  BUILTIN_TASK_TEMPLATES,
  INTAKE_TEMPLATE_ID,
  SMALLTALK_TEMPLATE_ID,
  findTemplate,
  templatesFromWorkflow,
  type TaskTemplate,
} from "./tasks/templates.js";
import { classifySmalltalk } from "./smalltalk.js";
import {
  buildChannelBrief,
  trimRequestInstruction,
  type BriefAnswer,
} from "./channel-brief.js";
import { abortAllApprovals } from "./approval-waiters.js";
import type { TaskRecord } from "./tasks/types.js";
import {
  DEFAULT_ROSTER,
  composeRoster,
  findStaff,
  isProductionStaff,
  validateRoster,
} from "./staff/roster.js";
import {
  HiredStaffStore,
  isHireableLayer,
  staffIdFromRole,
  type HireableLayer,
  type HiredStaff,
} from "./staff/hired.js";
import {
  OUTPUT_CONTRACT_PROMPT,
  parseStaffOutput,
  type BusStaffOutput,
} from "./staff/output-contract.js";
import type { SeatView, StaffSpec, StaffState } from "./staff/types.js";
import {
  ChannelStore,
  DEFAULT_CHANNEL_ID,
  dmChannelId,
  isDmChannelId,
  type Channel,
} from "./channels/index.js";
import { ChannelEventStore } from "./channels/events.js";
import { ChannelMemoryStore } from "./channels/memories.js";
import { stickyFromHistory } from "./channels/routing.js";
import {
  TeamMemberStore,
  ASSISTANT_ID,
  specFromTeamMember,
  type TeamMember,
  type ToolPermission,
} from "./staff/team-members.js";
import {
  DEFAULT_OFFICE_POLICY,
  MEETING_MAX_ROUNDS,
  nextBriefAt,
  type OfficePolicy,
} from "./policy.js";
import { FloorStateStore } from "./state.js";
import { PowerController } from "./power.js";
import {
  buildDailyBrief,
  renderDailyBrief,
  type DailyBrief,
} from "./brief/daily-brief.js";
import {
  clockOf,
  MINUTE,
  RealTimeSource,
  type CancelWake,
  type SchedulingTimeSource,
} from "./time/index.js";

export interface OfficeSchedulerOptions {
  userDataPath: string;
  policy?: Partial<OfficePolicy>;
  roster?: StaffSpec[];
  templates?: TaskTemplate[];
  basePolicy: SecurityPolicyBundle;
  providers: Parameters<typeof executeTask>[0]["providers"];
  provider?: Parameters<typeof executeTask>[0]["provider"];
  model?: string;
  thinking?: boolean;
  /** Injected model transport. Production leaves this unset. */
  callModel?: TaskModelCall;
  /**
   * The clock this scheduler and everything it owns reads. Defaults to real
   * time; the demo and tests pass a VirtualTimeSource. Injected rather than
   * global so two schedulers can run on two clocks.
   */
  clock?: SchedulingTimeSource;
  /**
   * Asked before every turn: can a route actually serve a call right now?
   *
   * This is where binding happens, not at the composer. Resolving a route
   * probes the GPU and stats model weights, which takes seconds on a cold
   * cache — doing it before the message is posted is what made sending feel
   * slow, and it buys nothing, because a turn that cannot run still has to
   * report that in the channel.
   */
  inferenceReady?: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  /**
   * Whether a seat may look things up on the web, read fresh on every turn.
   *
   * It follows the one switch a person already has in the chat composer, so the
   * office does not answer a question chat two panels away would answer, and
   * turning it off stops the floor too. Read per turn rather than at boot,
   * because a setting is changed between turns.
   */
  webSearchAllowed?: () => Promise<boolean> | boolean;
  /**
   * Purpose for the starting channel, so the shell can localise it. The name is
   * not a choice: `#general` is the address the whole workspace shares.
   */
  defaultChannel?: { purpose: string };
  /**
   * Files a delivered file in the library so a person can open it. Returns the
   * library id. Left unset the Floor still runs; the deliverable is then only
   * a path in the channel.
   */
  fileDeliverable?: (input: {
    path: string;
    title: string;
  }) => Promise<string | null>;
  onChange?: (snapshot: FloorSnapshot) => void;
}

export interface MeetingView {
  id: string;
  topic: string;
  round: number;
  maxRounds: number;
  state: "open" | "escalated" | "closed";
  participants: string[];
  outcome: string | null;
}

export interface ChannelEvidence {
  label: string;
  locator: string;
}

export interface ChannelArtifact {
  kind: string;
  /** Path or opaque id, whatever the deliverer pointed at. */
  ref: string;
  label: string;
  /** Set once the file has been filed in the library and can be opened. */
  artifactId: string | null;
}

export interface ChannelProgress {
  /** What the colleague is in the middle of. */
  activity: string;
  /** The file, query or command, when there is one worth naming. */
  target: string;
  /** How long the turn has been running. */
  elapsedMs: number;
  /**
   * True when the colleague is telling the room what they are starting, which
   * belongs in the channel as a line they said. False for the periodic "still
   * going", which is a status and is replaced by the next one.
   */
  spoken: boolean;
}

/**
 * One line in the office channel. A typed bus message rendered as something a
 * person can read, or a one-line note about something the Floor did to itself.
 */
export interface ChannelPost {
  id: string;
  kind: "message" | "system";
  channelId: string;
  /** Bus message type, or the audit event name for system notes. */
  type: string;
  from: string;
  /** Who is being addressed. Empty when the message has no recipient. */
  to: string;
  origin: "human" | "staff" | "system";
  body: string;
  /** The second line: an alternative, an unblock condition, a decision. */
  detail: string;
  evidence: ChannelEvidence[];
  artifact: ChannelArtifact | null;
  /** ESCALATE choices. The tray item carries the buttons. */
  options: string[];
  createdAt: number;
  /** Domain time this becomes visible to its recipient. */
  notBefore: number;
  /** Still being written: paced, not yet delivered. */
  pending: boolean;
  traceId: string;
  meetingId: string | null;
  /**
   * Set on a progress note, and null on everything else. Structured rather
   * than a sentence so the channel can say it in the reader's language.
   */
  progress: ChannelProgress | null;
}

export interface AgendaItem {
  id: string;
  label: string;
  staffId: string;
  kind: "scheduled" | "carried-block";
}

export interface FloorSnapshot {
  now: number;
  paused: boolean;
  productionHalted: boolean;
  channels: Channel[];
  seats: SeatView[];
  meetings: MeetingView[];
  agenda: AgendaItem[];
  tray: {
    pending: number;
    threshold: number;
    overflowing: boolean;
    items: Array<{
      id: string;
      /** The channel whose work raised this, so a card lands in one room. */
      channelId: string;
      headline: string;
      kind: string;
      evidence: string[];
      dissent: string | null;
      options: string[];
      createdAt: number;
    }>;
  };
  meter: {
    tokens: number;
    budget: number;
    ratio: number;
    lightsOut: boolean;
  };
  wall: {
    costMicros: number;
    gatePassRate: number;
    reworkRate: number;
  };
  queue: { pending: number; inFlight: number; done: number };
  directives: Array<{
    id: string;
    kind: DirectiveKind;
    body: string;
    appliesFrom: number;
  }>;
  interruptions: Array<{
    from: number;
    to: number | null;
    cause: string;
    note: string;
  }>;
}

/**
 * Budget for a whole derivation tree (I1). Deliberately a module constant and
 * not a setting: a budget that can be raised from the UI is not a budget. On
 * exceeding it a Trace stops deriving and escalates rather than buying room.
 */
const TRACE_TOKEN_BUDGET = 24_000;
const TRACE_MAX_DEPTH = 4;
/** How long a running Task takes to reach its next checkpoint. */
export const CHECKPOINT_INTERVAL_MS = 5 * MINUTE;

/** How many lines the channel hands the renderer at once. */
const CHANNEL_LIMIT = 500;

/**
 * How many turns of a channel a conversation turn carries.
 *
 * Enough that "the one from last week" resolves, short enough that a local
 * model still has room for its tools.
 */
const CONVERSATION_TURNS = 16;

/** Mentioning another channel agent from inside the current agent's turn. */
const DELEGATE_TOOL = "agents.mention";
/** Enough for one mentioned agent to continue a useful chain, without cycles. */
const MAX_DELEGATE_DEPTH = 3;
const DOCUMENT_ASK =
  /(?:\.xlsx|\.docx|\.pptx|\.csv|spreadsheet|excel|workbook|document|deck|slides?|엑셀|스프레드시트|문서|워드|슬라이드|발표\s*자료|파일)/iu;

/** A person's ask whose output is a file, not a fact for the lead to answer. */
function isDocumentIntake(row: QueuedRow): boolean {
  if (row.message.type !== "REQUEST" || row.message.origin !== "human") {
    return false;
  }
  return DOCUMENT_ASK.test(row.message.saidAs ?? "");
}

/** Structured detail rides along as the audit row's argsSummary JSON. */
function detailOf(event: AuditEntry): Record<string, unknown> {
  if (!event.argsSummary) return {};
  try {
    const parsed = JSON.parse(event.argsSummary) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function refLabel(ref: EvidenceRef): string {
  return ref.label ?? `${ref.kind}:${ref.id}`;
}

function evidenceOf(refs: readonly EvidenceRef[]): ChannelEvidence[] {
  return refs.map((ref) => ({
    label: refLabel(ref),
    locator: ref.locator ?? "",
  }));
}

/** A typed bus message, said out loud. */
function messagePost(row: QueuedRow): ChannelPost {
  const message = row.message;
  const base = {
    id: row.id,
    kind: "message" as const,
    channelId: row.channelId,
    type: message.type,
    from: row.from,
    to: row.to,
    origin: message.origin ?? ("staff" as const),
    evidence: [] as ChannelEvidence[],
    artifact: null as ChannelArtifact | null,
    options: [] as string[],
    detail: "",
    createdAt: row.createdAt,
    notBefore: row.notBefore,
    pending: row.state === "pending",
    traceId: row.traceId,
    meetingId: row.meetingId ?? null,
    progress: null,
  };
  switch (message.type) {
    case "REQUEST":
      return {
        ...base,
        // `saidAs` is what a person typed; `instruction` is that goal wrapped
        // in the intake template's standing orders. The reader gets their own
        // words back, not the prompt the office built around them.
        body: message.saidAs ?? message.instruction,
        // The needs label is how the office files the task on a desk. Under a
        // person's own message it is either their words a second time or the
        // template's English title, and neither tells them anything.
        detail: base.origin === "human" ? "" : (message.needs[0]?.label ?? ""),
      };
    case "DELIVER":
      return {
        ...base,
        body: message.claim,
        artifact: {
          kind: message.artifactRef.kind,
          ref: message.artifactRef.id,
          label: refLabel(message.artifactRef),
          artifactId: message.artifactRef.artifactId ?? null,
        },
      };
    case "CHALLENGE":
      return {
        ...base,
        body: message.targetClaim,
        detail: message.alternative,
        evidence: evidenceOf(message.evidenceRef),
      };
    case "ESCALATE":
      return {
        ...base,
        // An escalation is addressed to the room, not to a peer.
        to: "",
        body: message.reason,
        options: message.options,
        evidence: evidenceOf(message.evidenceRef),
      };
    case "BLOCK":
      return {
        ...base,
        body: message.reason,
        detail: message.unblockCondition,
      };
  }
}

/** Audit events the channel shows as a one-line note rather than a message. */
const SYSTEM_EVENTS: ReadonlySet<string> = new Set([
  "task.progress",
  // The office saying hello back. Carries the kind of thing that was said, not
  // a sentence, so the channel can word it in the reader's language.
  "floor.greeted",
  // Intake asking what the person wants, for the same reason.
  "floor.needsGoal",
  // The office owning a malfunction, rather than quoting the validator.
  "floor.glitch",
  // A seat answering a question. Carries its own words, since they are the point.
  "floor.answered",
  "production.halted",
  "production.resumed",
  // An ESCALATE never reaches the bus (I7), so the tray is where it surfaces.
  "approval.queued",
  "approval.resolved",
  "directive.applied",
  "governor.killed",
  "budget.exhausted",
  "meeting.closed",
  "brief.published",
  "task.failed",
  "gate.failed",
]);

function systemPost(
  event: AuditEntry,
  channelId: string,
  tracesHere: ReadonlySet<string>,
): ChannelPost | null {
  if (!SYSTEM_EVENTS.has(event.event)) return null;
  const detail = detailOf(event);
  // A progress note is about one piece of work, and reporting it in a channel
  // that never asked for it would be a colleague talking about somebody else's
  // job in the wrong room.
  const spokenIn = detail["channelId"];
  if (typeof spokenIn === "string") {
    if (spokenIn !== channelId) return null;
  } else if (event.traceId && !tracesHere.has(event.traceId)) {
    // An event bound to a trace belongs to whichever channel that trace spoke
    // in. Only notes about the office as a whole - production halting, a brief
    // being published - carry no trace and are shown wherever the reader is.
    return null;
  }
  return {
    id: `sys-${event.eventTime}-${event.event}`,
    kind: "system",
    channelId,
    type: event.event,
    from: event.staffMemberId ?? "",
    to: "",
    origin: "system",
    body: event.resultSummary,
    detail:
      typeof detail["decision"] === "string"
        ? detail["decision"]
        : typeof detail["smalltalk"] === "string"
          ? detail["smalltalk"]
          : // A second failure in a row has its own sentence, because repeating
            // the first one is what makes the office look like it is only ever
            // missing things.
            detail["repeated"] === true
            ? "repeated"
            : "",
    evidence: [],
    artifact: answeredArtifact(detail["artifactId"]),
    options: [],
    createdAt: event.eventTime,
    notBefore: event.eventTime,
    pending: false,
    traceId: event.traceId ?? "",
    meetingId: null,
    progress: progressOf(event),
  };
}

/**
 * The file card on an answer that made a file.
 *
 * A document filed by name carries its name in its id, which is the only place
 * the channel can read it from without going to the library and back.
 */
function answeredArtifact(id: unknown): ChannelArtifact | null {
  if (typeof id !== "string" || !id) return null;
  const name = id.startsWith("file:") ? id.slice("file:".length) : id;
  return { kind: "file", ref: name, label: name, artifactId: id };
}

/** The structured note behind a progress event, for the channel to phrase. */
function progressOf(event: AuditEntry): ChannelProgress | null {
  if (event.event !== "task.progress") return null;
  const detail = detailOf(event);
  return {
    activity:
      typeof detail["activity"] === "string" ? detail["activity"] : "thinking",
    target: typeof detail["target"] === "string" ? detail["target"] : "",
    elapsedMs:
      typeof detail["elapsedMs"] === "number" ? detail["elapsedMs"] : 0,
    spoken: detail["spoken"] === true,
  };
}

/**
 * Owns the queue and drives Tasks through OfficeRuntime. It lives in the main
 * process on purpose: a renderer-side loop is throttled the moment the window
 * is minimised, which is exactly when long work is still running.
 */
export class OfficeScheduler {
  readonly policy: OfficePolicy;
  readonly templates: TaskTemplate[];
  readonly db: FloorDb;
  readonly queue: FloorQueue;
  readonly traces: TraceStore;
  readonly directives: DirectiveStore;
  readonly tasks: TaskStore;
  readonly meetings: MeetingRoom;
  readonly tray: ApprovalTray;
  readonly meter: TokenMeter;
  readonly floorState: FloorStateStore;
  readonly channels: ChannelStore;
  readonly hiredStaff: HiredStaffStore;
  readonly teamMembers: TeamMemberStore;
  readonly channelEvents: ChannelEventStore;
  readonly channelMemories: ChannelMemoryStore;
  readonly bus: MessageBus;
  readonly power = new PowerController();
  /** The one clock this scheduler and everything it owns reads. */
  readonly clock: SchedulingTimeSource;

  readonly #options: OfficeSchedulerOptions;
  readonly #baseRoster: StaffSpec[];
  #roster: StaffSpec[];
  readonly #aborts = new Map<string, AbortController>();
  /** `taskId:tool` granted by a human in the tray, consumed on the retry. */
  readonly #grants = new Set<string>();
  readonly #seatState = new Map<string, StaffState>();
  readonly #seatTask = new Map<string, string>();
  /**
   * Seats with a model call actually in flight. Pacing alone cannot answer
   * "who is typing": a staff member spends the whole model call saying
   * nothing, and only becomes a paced message once the answer already exists.
   */
  readonly #typing = new Set<string>();
  /**
   * What a person said to a trace that was already working, by traceId.
   *
   * Every `say()` used to open its own trace, so a second line was a rival job
   * that knew nothing about the first - which is why answering a question with
   * "뭐라고?" produced a fresh manager with no goal in front of it instead of a
   * reply. Drained at the top of each iteration of whichever turn in the trace
   * runs next, so an interjection reaches a seat mid-work.
   */
  readonly #followUps = new Map<string, string[]>();
  /**
   * Who last took a turn in each channel.
   *
   * A plain follow-up keeps talking to that person. Cleared when they leave
   * the room (resolveRecipient ignores a sticky id that is no longer a member).
   * ChatPanel routes through `prepareChannelSend` before `say`, so both paths
   * read and write this map — sticky only in `say` never saw the follow-up.
   */
  readonly #stickyByChannel = new Map<string, string>();

  /** Who a plain follow-up in this room should keep talking to. */
  stickyRecipient(channelId: string): string | null {
    const cached = this.#stickyByChannel.get(channelId);
    if (cached) return cached;
    // Restart clears the map; the channel log still has who last acted.
    const channel = this.channels.get(channelId);
    if (!channel) return null;
    const recovered = stickyFromHistory(
      this.channelEvents.list(channelId),
      channel.memberIds,
    );
    if (recovered) this.#stickyByChannel.set(channelId, recovered);
    return recovered;
  }

  /** Remember who just took the turn, for the next plain line. */
  rememberSticky(channelId: string, memberId: string): void {
    this.#stickyByChannel.set(channelId, memberId);
  }
  /**
   * Channels where the last thing that happened was the office failing to use
   * its own answer.
   *
   * Once is a malfunction worth owning out loud. Twice in a row is a broken
   * setup, and saying the same sentence again is how a reader ends up asking why
   * we only ever miss - so the second one says that instead, and clears when
   * anything actually works.
   */
  readonly #glitched = new Set<string>();
  #running = false;
  #closed = false;
  #inflight = 0;
  #pumping = false;
  #turns = 0;
  #wakeGeneration = 0;
  #emitting = false;
  #emitPending = false;
  #lastBriefAt = 0;
  #lastBrief: DailyBrief | null = null;
  #cancelWake: CancelWake | null = null;

  constructor(options: OfficeSchedulerOptions) {
    this.#options = options;
    this.clock = options.clock ?? new RealTimeSource();
    this.policy = { ...DEFAULT_OFFICE_POLICY, ...options.policy };
    this.#baseRoster = options.roster ?? DEFAULT_ROSTER;
    this.templates = options.templates ?? BUILTIN_TASK_TEMPLATES;

    const dir = join(options.userDataPath, "floor");
    mkdirSync(dir, { recursive: true });
    this.db = openFloorDb(join(dir, "floor.sqlite"));
    migrateFloorDb(this.db);

    this.queue = new FloorQueue(this.db, this.clock);
    this.traces = new TraceStore(this.db, this.clock);
    this.directives = new DirectiveStore(this.db, this.clock);
    this.tasks = new TaskStore(this.db, this.clock);
    this.meetings = new MeetingRoom(this.db, this.clock);
    this.tray = new ApprovalTray(this.db, this.clock);
    this.meter = new TokenMeter(this.db, this.policy, this.clock);
    this.floorState = new FloorStateStore(this.db, this.clock);
    this.channels = new ChannelStore(this.db, this.clock);
    this.hiredStaff = new HiredStaffStore(this.db, this.clock);
    this.teamMembers = new TeamMemberStore(this.db, this.clock);
    this.channelEvents = new ChannelEventStore(this.db, this.clock);
    this.channelMemories = new ChannelMemoryStore(this.db, this.clock);

    this.teamMembers.ensureAssistant();
    this.channels.ensureDefault(options.defaultChannel?.purpose ?? "");
    this.#syncGeneralMembers();
    this.#roster = this.#buildRoster();

    this.bus = new MessageBus({
      queue: this.queue,
      traces: this.traces,
      meetings: this.meetings,
      policy: this.policy,
      clock: this.clock,
      governorConfig: {
        cycleLimit: 3,
        debounceWindowMs: 45_000,
        concurrency: this.policy.concurrency,
      },
      isProductionHalted: () => this.floorState.load().productionHalted,
      isProducer: (staffId) => {
        const staff = findStaff(this.#roster, staffId);
        return staff ? isProductionStaff(staff) : false;
      },
    });
  }

  get roster(): StaffSpec[] {
    return this.#roster;
  }

  /**
   * Built-in seats plus whoever a person hired, validated together. A bad
   * hired seat cannot take the office down with it: it is dropped and the
   * shipped roster still stands.
   */
  #buildRoster(): StaffSpec[] {
    const hired = this.hiredStaff.list();
    const hiredRoster = composeRoster(this.#baseRoster, hired);
    const existingIds = new Set(hiredRoster.map((staff) => staff.id));
    const teammates = this.teamMembers
      .listActive()
      .filter(
        (member) => member.id !== ASSISTANT_ID && !existingIds.has(member.id),
      );
    const teammateIds = teammates.map((member) => member.id);
    const allIds = [...hiredRoster.map((staff) => staff.id), ...teammateIds];
    const composed = [
      ...hiredRoster.map((staff) => ({
        ...staff,
        peers: [...new Set([...staff.peers, ...teammateIds])],
      })),
      ...teammates.map((member) => specFromTeamMember(member, allIds)),
    ];
    const validation = validateRoster(composed);
    if (validation.ok) {
      for (const staff of composed) {
        if (!this.#seatState.has(staff.id))
          this.#seatState.set(staff.id, "idle");
      }
      return composed;
    }
    const base = composeRoster(this.#baseRoster, []);
    const baseValidation = validateRoster(base);
    if (!baseValidation.ok) {
      throw new Error(`Invalid roster: ${baseValidation.errors.join("; ")}`);
    }
    for (const staff of base) {
      if (!this.#seatState.has(staff.id)) this.#seatState.set(staff.id, "idle");
    }
    return base;
  }

  /**
   * Everybody in the workspace is in `#general`, the way everybody in a Slack
   * workspace is in its default channel. The rooms somebody creates are still
   * invite-only; the one room nobody created is not.
   */
  #syncGeneralMembers(): void {
    const general = this.channels.get(DEFAULT_CHANNEL_ID);
    if (!general) return;
    const everyone = this.teamMembers.listActive().map((member) => member.id);
    if (everyone.length === 0) return;
    const same =
      everyone.length === general.memberIds.length &&
      everyone.every((id) => general.memberIds.includes(id));
    if (same) return;
    this.channels.update(DEFAULT_CHANNEL_ID, {
      memberIds: everyone,
      defaultMemberId: general.memberIds.includes(general.defaultMemberId)
        ? general.defaultMemberId
        : ASSISTANT_ID,
    });
  }

  addTeamMember(input: {
    id: string;
    name: string;
    persona: string;
    toneHints?: string;
    permission?: ToolPermission;
  }): { ok: true; member: TeamMember } | { ok: false; reason: string } {
    const created = this.teamMembers.create(input);
    if (!created.ok) return created;
    this.#syncGeneralMembers();
    this.#roster = this.#buildRoster();
    this.#emit();
    return created;
  }

  /**
   * Removing a teammate deactivates them, the way Slack does: they stop working
   * and leave every room and picker, but the messages they already sent stay
   * where they are with their name still on them. Their one-to-one chat is kept
   * as history and simply drops out of the list.
   */
  removeTeamMember(
    memberId: string,
  ): { ok: true } | { ok: false; reason: string } {
    const removed = this.teamMembers.deactivate(memberId);
    if (!removed.ok) return removed;
    // Stop anything they were doing: a deactivated seat should not keep
    // spending tokens on a turn nobody can act on any more.
    const dmId = dmChannelId(memberId);
    for (const traceId of this.queue.traceIdsInChannel(dmId)) {
      for (const task of this.tasks.list()) {
        if (task.traceId === traceId) this.#aborts.get(task.id)?.abort();
      }
      this.queue.killTrace(traceId);
      this.traces.setState(traceId, "aborted");
    }
    // Leave the rooms, keep the transcript: their lines stay, they just stop
    // answering and stop being offered to `@`.
    for (const channel of this.channels.list()) {
      if (!channel.memberIds.includes(memberId)) continue;
      const memberIds = channel.memberIds.filter((id) => id !== memberId);
      this.channels.update(channel.id, {
        memberIds: memberIds.length > 0 ? memberIds : [ASSISTANT_ID],
      });
    }
    this.#roster = this.#buildRoster();
    this.#emit();
    return { ok: true };
  }

  updateTeamMember(
    id: string,
    patch: {
      name?: string;
      persona?: string;
      toneHints?: string;
      permission?: ToolPermission;
    },
  ): { ok: true; member: TeamMember } | { ok: false; reason: string } {
    const updated = this.teamMembers.update(id, patch);
    if (!updated.ok) return updated;
    this.#roster = this.#buildRoster();
    this.#emit();
    return updated;
  }

  /** Nothing running and nothing claimed. Used by the demo driver and tests. */
  isIdle(): boolean {
    return this.#inflight === 0 && !this.#pumping;
  }

  get inflight(): number {
    return this.#inflight;
  }

  /** Staff turns completed. The minimised-window bench counts these. */
  get turnsCompleted(): number {
    return this.#turns;
  }

  concurrency(): number {
    return this.policy.concurrency;
  }

  /**
   * Wire (or re-wire) the cloud model the runner uses. The board itself does
   * not need a model; only Task execution does. Callers that open the Floor
   * for the snapshot / tray / channel list leave this unset until work is
   * actually submitted.
   */
  setInference(input: {
    providers: OfficeSchedulerOptions["providers"];
    provider: NonNullable<OfficeSchedulerOptions["provider"]>;
    model: string;
    thinking?: boolean;
  }): void {
    this.#options.providers = input.providers;
    this.#options.provider = input.provider;
    this.#options.model = input.model;
    this.#options.thinking = Boolean(input.thinking);
  }

  /** True once a tool-calling route has been bound. */
  hasInference(): boolean {
    return Boolean(this.#options.provider && this.#options.model);
  }

  /** Which route is bound, so the caller can check it is actually up. */
  get boundProvider(): OfficeSchedulerOptions["provider"] {
    return this.#options.provider;
  }

  // ---------------------------------------------------------------- lifecycle

  async start(): Promise<void> {
    if (this.#running) return;
    this.#running = true;

    const requeued = this.queue.recoverClaimed();
    const recovered = this.tasks.recoverRunning("suspend");
    const state = this.floorState.load();
    if (
      recovered.length > 0 ||
      state.interruptions.some((item) => item.to === null)
    ) {
      this.floorState.closeInterruption(
        `resumed after restart; ${recovered.length} task(s) restored from checkpoint`,
      );
    }

    await appendOfficeEvent({
      clock: this.clock,
      event: "runtime.started",
      summary: `Floor started (requeued=${requeued}, restored=${recovered.length})`,
      detail: { requeued, restored: recovered.length, driver: this.db.driver },
    });

    await this.power.attach({
      onSuspend: () => this.handlePower("suspend"),
      onResume: () => this.handlePower("resume"),
      onBattery: () => this.handlePower("on-battery"),
      onAc: () => this.handlePower("on-ac"),
      onShutdown: () => this.handlePower("shutdown"),
    });

    void this.pump();
  }

  async stop(): Promise<void> {
    if (!this.#running || this.#closed) return;
    this.#running = false;
    this.#wakeGeneration += 1;
    for (const controller of this.#aborts.values()) controller.abort();
    this.#aborts.clear();
    this.tasks.recoverRunning("shutdown");
    this.power.detach();
    await appendOfficeEvent({
      clock: this.clock,
      event: "runtime.stopped",
      summary: "Floor stopped",
    });
  }

  /**
   * Closing is also how a crash is simulated: the database goes away without a
   * clean stop, so every entry point has to check before touching it.
   */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#running = false;
    this.#wakeGeneration += 1;
    for (const controller of this.#aborts.values()) controller.abort();
    this.#aborts.clear();
    this.power.detach();
    this.db.close();
  }

  // ------------------------------------------------------------------- power

  async handlePower(
    event: "suspend" | "resume" | "on-battery" | "on-ac" | "shutdown",
  ): Promise<void> {
    switch (event) {
      case "suspend": {
        for (const controller of this.#aborts.values()) controller.abort();
        this.tasks.recoverRunning("suspend");
        this.floorState.patch({ paused: true });
        this.floorState.openInterruption("suspend", "system suspended");
        break;
      }
      case "resume": {
        this.floorState.patch({ paused: false });
        this.floorState.closeInterruption(
          "system resumed; tasks restored from checkpoint",
        );
        this.queue.recoverClaimed();
        break;
      }
      case "on-battery":
      case "on-ac": {
        this.floorState.patch({});
        break;
      }
      case "shutdown": {
        for (const controller of this.#aborts.values()) controller.abort();
        this.tasks.recoverRunning("shutdown");
        this.floorState.openInterruption("shutdown", "machine shutting down");
        break;
      }
    }
    await appendOfficeEvent({
      clock: this.clock,
      event: "power.event",
      summary: `Power event: ${event}`,
      detail: { event, onBattery: this.power.status().onBattery },
    });
    this.#emit();
    if (event === "resume" || event === "on-ac") void this.pump();
  }

  // ---------------------------------------------------------------- channels

  listChannels(): Channel[] {
    return this.channels.list();
  }

  createChannel(input: {
    name: string;
    purpose: string;
    memberIds?: string[];
    defaultMemberId?: string;
  }): { ok: true; channel: Channel } | { ok: false; reason: string } {
    const result = this.channels.create({
      id: `chan-${randomUUID()}`,
      name: input.name,
      purpose: input.purpose,
      ...(input.memberIds ? { memberIds: input.memberIds } : {}),
      ...(input.defaultMemberId
        ? { defaultMemberId: input.defaultMemberId }
        : {}),
    });
    if (result.ok) {
      void appendOfficeEvent({
        clock: this.clock,
        event: "channel.created",
        summary: `Created #${result.channel.name}`,
        detail: { channelId: result.channel.id },
      }).catch(() => undefined);
      this.#emit();
    }
    return result;
  }

  updateChannel(
    id: string,
    patch: {
      name?: string;
      purpose?: string;
      memberIds?: string[];
      defaultMemberId?: string;
    },
  ): { ok: true; channel: Channel } | { ok: false; reason: string } {
    const result = this.channels.update(id, patch);
    if (result.ok) this.#emit();
    return result;
  }

  /**
   * The one-to-one chat with a teammate, opened by clicking their name.
   *
   * There is exactly one per person and it is not a channel: it carries no
   * name, takes no invitations, never appears in the channel list, and it is
   * removed with the person rather than on its own.
   */
  ensureDmChannel(
    memberId: string,
  ): { ok: true; channel: Channel } | { ok: false; reason: string } {
    const member = this.teamMembers.get(memberId);
    if (!member) return { ok: false, reason: "That teammate is not here." };
    const id = dmChannelId(memberId);
    const existing = this.channels.get(id);
    if (existing) return { ok: true, channel: existing };

    return this.channels.create({
      id,
      // The id is the name: nothing reads it, and a person-shaped name would
      // collide with the room somebody names after the same colleague.
      name: id,
      purpose: "",
      memberIds: [memberId],
      defaultMemberId: memberId,
    });
  }

  /**
   * Who is in the room, changed one invite at a time.
   *
   * A teammate existing is not the same as a teammate being in this
   * conversation: an office where everybody is in every channel is an office
   * where nobody knows who is listening.
   */
  inviteToChannel(
    channelId: string,
    memberIds: readonly string[],
  ): { ok: true; channel: Channel } | { ok: false; reason: string } {
    const channel = this.channels.get(channelId);
    if (!channel)
      return { ok: false, reason: "That channel no longer exists." };
    if (isDmChannelId(channelId)) {
      return {
        ok: false,
        reason: "A chat with one person stays between the two of you.",
      };
    }
    const known = memberIds.filter(
      (id) => id === ASSISTANT_ID || this.teamMembers.get(id) !== null,
    );
    if (known.length === 0) return { ok: false, reason: "Nobody to invite." };
    const already = new Set(channel.memberIds);
    const added = known.filter((id) => !already.has(id));
    const updated = this.updateChannel(channelId, {
      memberIds: [...new Set([...channel.memberIds, ...known])],
    });
    if (!updated.ok) return updated;
    // One notice per person, so the transcript says who walked in.
    for (const memberId of added) {
      const member = this.teamMembers.get(memberId);
      const name =
        member?.name ??
        (memberId === ASSISTANT_ID ? "Redrob" : memberId);
      this.channelEvents.append({
        id: `evt-${randomUUID()}`,
        channelId,
        authorId: "system",
        type: "system",
        payload: { kind: "invite", memberId, name },
      });
    }
    if (added.length > 0) this.#emit();
    return updated;
  }

  removeFromChannel(
    channelId: string,
    memberId: string,
  ): { ok: true; channel: Channel } | { ok: false; reason: string } {
    const channel = this.channels.get(channelId);
    if (!channel)
      return { ok: false, reason: "That channel no longer exists." };
    if (channel.id === DEFAULT_CHANNEL_ID) {
      return {
        ok: false,
        reason: `Everybody is in #${channel.name}. Remove the teammate instead.`,
      };
    }
    if (!channel.memberIds.includes(memberId)) {
      return { ok: true, channel };
    }
    const memberIds = channel.memberIds.filter((id) => id !== memberId);
    if (memberIds.length === 0) {
      return {
        ok: false,
        reason: "A conversation needs at least one teammate in it.",
      };
    }
    const member = this.teamMembers.get(memberId);
    const name =
      member?.name ??
      (memberId === ASSISTANT_ID ? "Redrob" : memberId);
    const updated = this.updateChannel(channelId, { memberIds });
    if (!updated.ok) return updated;

    // Work still running for them in this room has nowhere to speak — stop it
    // rather than letting tokens burn into a chat they left.
    for (const task of this.tasks.list()) {
      if (task.staffId !== memberId) continue;
      if (this.queue.channelIdForTrace(task.traceId) !== channelId) continue;
      this.#aborts.get(task.id)?.abort();
    }
    this.#typing.delete(memberId);
    if (this.#stickyByChannel.get(channelId) === memberId) {
      this.#stickyByChannel.delete(channelId);
    }

    this.channelEvents.append({
      id: `evt-${randomUUID()}`,
      channelId,
      authorId: "system",
      type: "system",
      payload: { kind: "remove", memberId, name },
    });
    this.#emit();
    return updated;
  }

  /**
   * Deleting a channel takes its conversation with it. Work still in flight is
   * aborted first: leaving a trace running for a channel nobody can open again
   * spends tokens on output with nowhere to land.
   */
  deleteChannel(id: string): { ok: true } | { ok: false; reason: string } {
    const channel = this.channels.get(id);
    if (!channel)
      return { ok: false, reason: "That channel no longer exists." };
    if (isDmChannelId(id)) {
      return {
        ok: false,
        reason: "That is a chat with a person. Remove the teammate instead.",
      };
    }
    if (channel.system) {
      return {
        ok: false,
        reason: `#${channel.name} is the office channel and cannot be deleted.`,
      };
    }
    for (const traceId of this.queue.traceIdsInChannel(id)) {
      for (const task of this.tasks.list()) {
        if (task.traceId === traceId) this.#aborts.get(task.id)?.abort();
      }
      this.queue.killTrace(traceId);
      this.traces.setState(traceId, "aborted");
    }
    this.queue.deleteChannelMessages(id);
    // Wipe the transcript and memories too, so a channel made later can never
    // inherit a deleted one's messages just by landing on the same id.
    this.channelEvents.clearChannel(id);
    this.channelMemories.clearChannel(id);
    this.#stickyByChannel.delete(id);
    const removed = this.channels.remove(id);
    if (removed.ok) this.#emit();
    return removed;
  }

  /**
   * Everything the Floor has said or been asked, gone.
   *
   * Settings → clear local documents already wiped the Composer chat and left
   * the office thread alone, so a reader who thought they had wiped "채팅" still
   * saw yesterday's greetings and the approval cards those greetings raised.
   * Hired staff stay: they are people, not conversation.
   */
  async wipeChat(): Promise<{
    messages: number;
    channels: number;
    approvals: number;
  }> {
    for (const controller of this.#aborts.values()) controller.abort();
    this.#aborts.clear();
    abortAllApprovals();
    this.#grants.clear();
    this.#seatState.clear();
    this.#seatTask.clear();
    this.#typing.clear();
    this.#lastBrief = null;
    this.#lastBriefAt = 0;

    const messages = this.queue.clearAll();
    const approvals = this.tray.clearAll();
    const channels = this.channels
      .list()
      .filter((channel) => !channel.system)
      .map((channel) => channel.id);
    for (const id of channels) {
      this.channelEvents.clearChannel(id);
      this.channels.remove(id);
    }
    // Keep #general's transcript empty after a wipe too.
    this.channelEvents.clearChannel(DEFAULT_CHANNEL_ID);

    this.db.prepare("DELETE FROM tasks").run();
    this.db.prepare("DELETE FROM traces").run();
    this.db.prepare("DELETE FROM meetings").run();
    this.db.prepare("DELETE FROM directives").run();
    this.db.prepare("DELETE FROM gate_results").run();
    this.db.prepare("DELETE FROM budget_ledger").run();

    this.floorState.save({
      paused: false,
      productionHalted: false,
      updatedAt: this.clock.now(),
      interruptions: [],
    });

    await clearAuditLog();
    this.#emit();
    return { messages, channels: channels.length, approvals };
  }

  // ------------------------------------------------------------------- staff

  listHiredStaff(): HiredStaff[] {
    return this.hiredStaff.list();
  }

  hireStaff(input: {
    role: string;
    layer: string;
    personality: string;
  }): { ok: true; staff: HiredStaff } | { ok: false; reason: string } {
    const role = input.role.trim();
    if (!role)
      return {
        ok: false,
        reason: "A new colleague needs a role to be called by.",
      };
    if (!isHireableLayer(input.layer)) {
      return {
        ok: false,
        reason: `"${input.layer}" is not a job this office has.`,
      };
    }
    const personality = input.personality.trim();
    if (!personality) {
      return {
        ok: false,
        reason: "Say what this colleague should do, in your own words.",
      };
    }
    const taken = new Set(this.#roster.map((staff) => staff.id));
    const staff = this.hiredStaff.hire({
      id: staffIdFromRole(role, taken),
      role,
      layer: input.layer,
      personality,
    });
    this.#roster = this.#buildRoster();
    this.#emit();
    return { ok: true, staff };
  }

  updateStaff(
    id: string,
    patch: { role?: string; layer?: string; personality?: string },
  ): { ok: true; staff: HiredStaff } | { ok: false; reason: string } {
    if (patch.layer !== undefined && !isHireableLayer(patch.layer)) {
      return {
        ok: false,
        reason: `"${patch.layer}" is not a job this office has.`,
      };
    }
    const staff = this.hiredStaff.update(id, {
      ...(patch.role === undefined ? {} : { role: patch.role.trim() }),
      ...(patch.layer === undefined
        ? {}
        : { layer: patch.layer as HireableLayer }),
      ...(patch.personality === undefined
        ? {}
        : { personality: patch.personality.trim() }),
    });
    if (!staff) return { ok: false, reason: "That seat is not one you hired." };
    this.#roster = this.#buildRoster();
    this.#emit();
    return { ok: true, staff };
  }

  dismissStaff(id: string): { ok: true } | { ok: false; reason: string } {
    if (!this.hiredStaff.dismiss(id)) {
      return {
        ok: false,
        reason: "That seat is not one you hired, so it cannot be dismissed.",
      };
    }
    this.#seatState.delete(id);
    this.#seatTask.delete(id);
    this.#typing.delete(id);
    this.#roster = this.#buildRoster();
    this.#emit();
    return { ok: true };
  }

  // -------------------------------------------------------------------- work

  /**
   * A person typed a goal at a channel. It becomes an intake Task on the
   * lead's desk with the words exactly as typed, and the lead is the one who
   * decides who does what.
   *
   * Nothing here touches a model. The message is on the queue and in the
   * channel before the first token is asked for, so the composer never waits
   * on a GPU probe or a cold llama-server.
   */
  async say(
    text: string,
    channelId = DEFAULT_CHANNEL_ID,
    to?: string,
    /**
     * Files attached to the message, already decoded and marked untrusted. It
     * rides the instruction rather than the channel body, so what a person said
     * stays readable and the seat still gets what they attached.
     */
    attached?: string,
  ): Promise<
    | { ok: true; taskId: string; traceId: string }
    | { ok: false; reason: string }
  > {
    const goal = text.trim();
    if (!goal) return { ok: false, reason: "Nothing to hand out." };
    const channel = this.channels.get(channelId);
    if (!channel)
      return { ok: false, reason: "That channel no longer exists." };

    const { resolveRecipient } = await import("./channels/routing.js");
    const namesById = new Map(
      this.teamMembers.list().map((member) => [member.id, member.name]),
    );
    for (const seat of this.#roster) {
      if (!namesById.has(seat.id)) namesById.set(seat.id, seat.role);
    }
    const routed = resolveRecipient({
      text: goal,
      memberIds: channel.memberIds,
      defaultMemberId: channel.defaultMemberId,
      namesById,
      explicitTo: to ?? null,
      stickyMemberId: this.stickyRecipient(channelId),
    });
    // Remember who this line went to, so the next plain line stays with them.
    this.rememberSticky(channelId, routed.to);
    if (routed.to !== ASSISTANT_ID) {
      await appendOfficeEvent({
        clock: this.clock,
        event: "member.mentioned",
        summary: `Routed to ${routed.to}`,
        detail: { channelId, to: routed.to },
      });
    }

    // A hello is not a goal. Sending it down the intake path asks a manager to
    // break a greeting into assigned steps, and what comes back is an
    // explanation of why that is impossible - the office arguing with someone
    // who only said good morning.
    const social = classifySmalltalk(goal);
    const templateId = social ? SMALLTALK_TEMPLATE_ID : INTAKE_TEMPLATE_ID;
    const template = findTemplate(this.templates, templateId);
    if (!template)
      return { ok: false, reason: `Missing the "${templateId}" template.` };

    // Naming a seat (or resolving a mention / sticky follow-up) says who should
    // deal with it — including a hello. The assistant is the exception: it has
    // no desk on the floor, so it still answers from the chat path.
    const recipient =
      to && to !== ASSISTANT_ID
        ? to
        : routed.viaChat
          ? undefined
          : routed.to;
    if (recipient) {
      return this.#askSeat(goal, channelId, recipient, attached);
    }

    // Said into work that is already running, so it belongs to that work rather
    // than to a job of its own. A hello is exempt: it wants a hello back, not a
    // seat's attention.
    if (!social) {
      const live = this.#liveTraceIn(channelId);
      if (live) {
        return this.#joinLiveWork(
          live,
          attached ? `${goal}\n\n${attached}` : goal,
          channelId,
          goal,
        );
      }
    }

    if (social) {
      return this.submitTask({
        templateId: template.id,
        channelId,
        title: goal.slice(0, 80),
        // No instruction is built, because nothing will read one.
        saidAs: goal,
        origin: "human",
        payload: { smalltalk: social },
      });
    }

    return this.submitTask({
      templateId: template.id,
      channelId,
      title: goal.slice(0, 80),
      instruction: this.#askInstruction(
        template.instruction,
        goal,
        channel,
        attached,
      ),
      saidAs: goal,
      origin: "human",
    });
  }

  /**
   * A seat's standing orders, where it was said, and the words themselves.
   *
   * The purpose is background, never a brief. Handing it over as what the channel
   * "is for" had the lead weigh the goal against it and refuse whatever did not
   * match - a question in #제품-기획 came back as "there is no concrete task
   * related to 제품 기획". It is there to resolve names and unstated context; what
   * a person said is the only thing that says what to do.
   */
  #askInstruction(
    standingOrders: string,
    goal: string,
    channel: Channel | null | undefined,
    attached?: string,
  ): string {
    const purpose = channel?.purpose.trim() ?? "";
    return [
      standingOrders,
      purpose && channel
        ? [
            `\nBackground on where this was said. #${channel.name} is about: ${purpose}`,
            "Use it only to resolve names and context the goal leaves unsaid.",
            "It does not narrow the goal. Never judge the goal against it and never refuse one for being off-topic here.",
          ].join("\n")
        : "",
      "",
      "The goal, as it was given:",
      goal,
      attached ? `\n${attached}` : "",
    ]
      .filter((part) => part !== "")
      .join("\n");
  }

  /** The trace of a turn actually in flight in this channel, if there is one. */
  #liveTraceIn(channelId: string): string | null {
    for (const taskId of this.#aborts.keys()) {
      const task = this.tasks.get(taskId);
      if (!task) continue;
      if (this.queue.channelIdForTrace(task.traceId) !== channelId) continue;
      return task.traceId;
    }
    return null;
  }

  /**
   * Hand a line to work that is already running instead of starting a rival job.
   *
   * The words are put in the channel and immediately settled, because they are a
   * record of what was said and not a request for anyone: enqueue and complete
   * are both synchronous, so the pump cannot claim the row in between and turn an
   * interjection into a second turn. What makes it reach the seat is the mailbox,
   * drained inside the loop that is already running.
   */
  async #joinLiveWork(
    traceId: string,
    goal: string,
    channelId: string,
    /** What to show in the channel, when the seat is being told more than that. */
    said = goal,
  ): Promise<
    | { ok: true; taskId: string; traceId: string }
    | { ok: false; reason: string }
  > {
    const taskId = this.tasks
      .list()
      .find(
        (task) => task.traceId === traceId && this.#aborts.has(task.id),
      )?.id;
    if (!taskId)
      return { ok: false, reason: "That work has already finished." };
    const task = this.tasks.get(taskId);
    if (!task) return { ok: false, reason: "That work has already finished." };

    const now = this.clock.now();
    const id = `msg-${randomUUID()}`;
    this.queue.enqueue({
      id,
      traceId,
      depth: 0,
      channelId,
      type: "REQUEST",
      from: INTAKE_ID,
      to: task.staffId,
      needs: [{ kind: "task", id: taskId }],
      dueBy: now,
      instruction: goal,
      saidAs: said,
      origin: "human",
      createdAt: now,
      notBefore: now,
    });
    this.queue.complete(id, "done");

    const waiting = this.#followUps.get(traceId) ?? [];
    waiting.push(goal);
    this.#followUps.set(traceId, waiting);

    // Logged but never shown: the line is already in the thread in the reader's
    // own words, and a note under it saying it was delivered is bookkeeping.
    await appendOfficeEvent({
      clock: this.clock,
      event: "floor.followUp",
      summary: `Added to ${task.title} while it was running`,
      traceId,
      taskId,
      detail: { channelId },
    });
    this.#emit();
    return { ok: true, taskId, traceId };
  }

  /**
   * Put a goal straight on a named seat's desk.
   *
   * Tagging says who should deal with it, so there is nothing for the lead to
   * decide. The seat is still free to hand it on: its own scope and tool policy
   * are unchanged, so a seat asked for something outside its lane has to be able
   * to REQUEST the seat that owns it rather than fail.
   */
  async #askSeat(
    goal: string,
    channelId: string,
    to: string,
    attached?: string,
  ): Promise<
    | { ok: true; taskId: string; traceId: string }
    | { ok: false; reason: string }
  > {
    const seat = findStaff(this.#roster, to);
    if (!seat) return { ok: false, reason: "That seat is not on the floor." };
    const channel = this.channels.get(channelId);
    const template = findTemplate(this.templates, ASK_TEMPLATE_ID);
    if (!template)
      return {
        ok: false,
        reason: `Missing the "${ASK_TEMPLATE_ID}" template.`,
      };

    return this.submitTask({
      templateId: template.id,
      staffId: seat.id,
      channelId,
      title: goal.slice(0, 80),
      instruction: this.#askInstruction(
        template.instruction,
        goal,
        channel,
        attached,
      ),
      saidAs: goal,
      origin: "human",
    });
  }

  /** Taken by the running turn. Empties the mailbox: a line is delivered once. */
  #drainFollowUps(traceId: string): string[] {
    const waiting = this.#followUps.get(traceId);
    if (!waiting || waiting.length === 0) return [];
    this.#followUps.delete(traceId);
    return waiting;
  }

  /**
   * Words that landed in the moment a turn was ending become their own goal.
   *
   * The loop reads its mailbox before it stops, so this only catches the sliver
   * between it returning and the seat going idle. Without it, a line typed in
   * that sliver would be shown in the channel and then silently ignored, which
   * is worse than either answering it or refusing it.
   *
   * It submits the work rather than calling `say` again, because the words are
   * already in the thread from `#joinLiveWork` and a reader must not watch their
   * own message appear twice.
   */
  #flushOrphanFollowUps(): void {
    for (const [traceId, waiting] of [...this.#followUps]) {
      const running = this.tasks
        .list()
        .some((task) => task.traceId === traceId && this.#aborts.has(task.id));
      if (running) continue;
      this.#followUps.delete(traceId);
      const channelId =
        this.queue.channelIdForTrace(traceId) ?? DEFAULT_CHANNEL_ID;
      const channel = this.channels.get(channelId);
      const template = findTemplate(this.templates, INTAKE_TEMPLATE_ID);
      if (!template) continue;
      for (const goal of waiting) {
        void this.submitTask({
          templateId: template.id,
          channelId,
          title: goal.slice(0, 80),
          instruction: this.#askInstruction(
            template.instruction,
            goal,
            channel,
          ),
        }).catch(() => undefined);
      }
    }
  }

  async submitTask(input: {
    templateId: string;
    /** Overrides the template's own desk, for a seat a person named. */
    staffId?: string;
    traceId?: string;
    channelId?: string;
    instruction?: string;
    /** The words a person typed, when there are any. Never sent to the model. */
    saidAs?: string;
    title?: string;
    /** "human" marks the goal a person typed, so the channel can show it as theirs. */
    origin?: "human" | "system";
    /** Structured detail the handler needs and the model never sees. */
    payload?: Record<string, unknown>;
  }): Promise<
    | { ok: true; taskId: string; traceId: string }
    | { ok: false; reason: string }
  > {
    const template = findTemplate(this.templates, input.templateId);
    if (!template)
      return {
        ok: false,
        reason: `Unknown task template "${input.templateId}"`,
      };
    const desk = input.staffId ?? template.staffId;
    const staff = findStaff(this.#roster, desk);
    if (!staff) return { ok: false, reason: `Unknown StaffMember "${desk}"` };

    const now = this.clock.now();
    if (this.floorState.load().productionHalted && isProductionStaff(staff)) {
      return {
        ok: false,
        reason: `Production is halted: ${this.tray.pendingCount()} approvals are waiting.`,
      };
    }

    const traceId = input.traceId ?? `trace-${randomUUID()}`;
    const taskId = `task-${randomUUID()}`;
    this.traces.open(
      traceId,
      { tokens: TRACE_TOKEN_BUDGET, depth: TRACE_MAX_DEPTH },
      taskId,
    );
    this.tasks.create({
      id: taskId,
      traceId,
      staffId: staff.id,
      templateId: template.id,
      title: input.title ?? template.title,
      instruction: input.instruction ?? template.instruction,
      seat: this.#roster.findIndex((member) => member.id === staff.id),
      ...(input.payload ? { payload: input.payload } : {}),
    });

    const result = await this.bus.publish({
      fromHuman: true,
      message: {
        id: `msg-${randomUUID()}`,
        traceId,
        depth: 0,
        channelId: input.channelId ?? DEFAULT_CHANNEL_ID,
        type: "REQUEST",
        from: INTAKE_ID,
        to: staff.id,
        // The goal when a person gave one, and only otherwise the template's
        // own English title. This label is read out loud in the channel as
        // "{role} was given: {task}", where naming the template told the reader
        // about the office's filing system instead of about their work - in
        // English, in a Korean room.
        needs: [
          { kind: "task", id: taskId, label: input.title ?? template.title },
        ],
        dueBy: now + 60 * MINUTE,
        instruction: input.instruction ?? template.instruction,
        ...(input.saidAs ? { saidAs: input.saidAs } : {}),
        origin: input.origin ?? "system",
      },
    });
    if (!result.ok) return { ok: false, reason: result.reason };

    await appendOfficeEvent({
      clock: this.clock,
      event: "task.enqueued",
      summary: `${template.title} queued for ${staff.role}`,
      traceId,
      taskId,
      staffId: staff.id,
      detail: { templateId: template.id },
    });
    this.#emit();
    void this.pump();
    return { ok: true, taskId, traceId };
  }

  // ---------------------------------------------------------------- runner pool

  /**
   * The pump is the runner pool. Concurrency is the only throttle; nothing
   * here sleeps waiting for a paced message, because pacing lives in the
   * `not_before` column.
   */
  async pump(): Promise<void> {
    if (!this.#running || this.#closed || this.#pumping) return;
    this.#pumping = true;
    try {
      await this.#reconcileProductionHalt();
      await this.#maybePublishBrief();
      // Both awaits above can straddle a close; the database may be gone now.
      if (this.#closed) return;
      const state = this.floorState.load();
      if (!state.paused) {
        for (;;) {
          const free = this.concurrency() - this.#inflight;
          if (free <= 0) break;
          const rows = this.queue.claimReady(free);
          if (rows.length === 0) break;
          for (const row of rows) {
            this.#inflight += 1;
            void this.#handle(row)
              .catch(async (error: unknown) => {
                if (this.#closed) return;
                this.queue.complete(row.id, "failed");
                await appendOfficeEvent({
                  clock: this.clock,
                  event: "task.failed",
                  summary: `Handler crashed: ${error instanceof Error ? error.message : String(error)}`,
                  traceId: row.traceId,
                  messageId: row.id,
                });
              })
              .finally(() => {
                this.#inflight -= 1;
                if (this.#closed) return;
                this.#flushOrphanFollowUps();
                this.#emit();
                void this.pump();
              });
          }
        }
      }
    } finally {
      this.#pumping = false;
    }
    this.#scheduleWake();
  }

  #scheduleWake(): void {
    if (!this.#running || this.#closed) return;
    const now = this.clock.now();
    const candidates: number[] = [];
    if (!this.floorState.load().paused) {
      const nextMessage = this.queue.nextWakeAt();
      // Only a message that is still in the future earns a wake. One that is
      // already due but went unclaimed (pool full, or the pump was paused when
      // it landed) is re-pumped by the in-flight `finally` or by resume, never
      // by a zero-delay wake that would spin the loop.
      if (nextMessage !== null && nextMessage > now)
        candidates.push(nextMessage);
    }
    // Strictly in the future, so `delay` is never zero.
    candidates.push(nextBriefAt(this.policy, now));
    const next = Math.min(...candidates);
    const delay = Math.max(1, next - now);
    const generation = (this.#wakeGeneration += 1);
    // A timer, not a delay. Nothing is executing while this is outstanding —
    // work that must happen later lives in the queue with `notBefore` set, and
    // this only decides when the pump next looks.
    this.#cancelWake?.();
    this.#cancelWake = this.clock.wakeAfter(delay, () => {
      if (generation !== this.#wakeGeneration || !this.#running || this.#closed)
        return;
      void this.pump();
    });
  }

  // ------------------------------------------------------------- message handling

  async #handle(row: QueuedRow): Promise<void> {
    const staff = findStaff(this.#roster, row.to);
    switch (row.message.type) {
      case "REQUEST":
      case "DELIVER":
      case "CHALLENGE": {
        if (!staff) {
          this.queue.complete(row.id, "dropped");
          return;
        }
        await this.#runStaffTurn(row, staff);
        return;
      }
      case "ESCALATE": {
        await this.#fileEscalation(row);
        this.queue.complete(row.id, "done");
        return;
      }
      case "BLOCK": {
        const taskId = row.message.traceId;
        for (const task of this.tasks.list()) {
          if (task.traceId === taskId && task.state !== "done") {
            this.tasks.setState(task.id, "blocked");
          }
        }
        await appendOfficeEvent({
          clock: this.clock,
          event: "message.delivered",
          summary: `BLOCK: ${row.message.reason}`,
          traceId: row.traceId,
          messageId: row.id,
          staffId: row.from,
          detail: { unblockCondition: row.message.unblockCondition },
        });
        this.queue.complete(row.id, "done");
        return;
      }
    }
  }

  #taskForMessage(
    row: QueuedRow,
    staff: StaffSpec,
  ): ReturnType<TaskStore["get"]> {
    const existing = this.tasks
      .list()
      .find(
        (task) =>
          task.traceId === row.traceId &&
          task.staffId === staff.id &&
          task.state !== "done" &&
          task.state !== "failed",
      );
    if (existing) return existing;
    const template =
      this.templates.find((item) => item.staffId === staff.id) ??
      this.templates[0];
    return this.tasks.create({
      id: `task-${randomUUID()}`,
      traceId: row.traceId,
      staffId: staff.id,
      templateId: template?.id ?? "office/adhoc",
      title: template?.title ?? `${staff.role} follow-up`,
      instruction: this.#instructionFor(row),
      seat: this.#roster.findIndex((member) => member.id === staff.id),
    });
  }

  #instructionFor(row: QueuedRow): string {
    const message = row.message;
    switch (message.type) {
      case "REQUEST":
        return message.instruction;
      case "DELIVER":
        return `Verify this delivery from ${message.from}: "${message.claim}" (artifact ${message.artifactRef.kind}:${message.artifactRef.id}).`;
      case "CHALLENGE":
        return `${message.from} challenged your claim "${message.targetClaim}". Their evidence: ${message.evidenceRef
          .map(
            (ref) =>
              `${ref.kind}:${ref.id}${ref.locator ? `#${ref.locator}` : ""}`,
          )
          .join(
            ", ",
          )}. Their alternative: ${message.alternative}. Respond with one typed message.`;
      default:
        return "Respond with one typed message.";
    }
  }

  /**
   * Answer a hello, in one line, without asking a model anything.
   *
   * The words come from the catalog rather than from a turn, for two reasons.
   * The reply has to be in the reader's language, and only the renderer knows
   * which that is - so what travels is the kind of thing that was said, not a
   * sentence. And a greeting that waits on a cold llama-server to be greeted
   * back is worse than no greeting at all.
   */
  async #answerSmalltalk(
    row: QueuedRow,
    staff: StaffSpec,
    task: TaskRecord,
  ): Promise<void> {
    const kind =
      typeof task.payload?.["smalltalk"] === "string"
        ? (task.payload["smalltalk"] as string)
        : "greeting";
    await appendOfficeEvent({
      clock: this.clock,
      event: "floor.greeted",
      // For the log, which is read in English. The channel builds its own line.
      summary: `${staff.role} answered a ${kind}`,
      traceId: row.traceId,
      taskId: task.id,
      staffId: staff.id,
      detail: { channelId: row.channelId, smalltalk: kind },
    });
    this.tasks.finish(task.id, "done", kind, 0);
    this.queue.complete(row.id, "done");
    this.#emit();
  }

  /**
   * A turn that is talking to a person rather than carrying out an assignment.
   *
   * Anything a person typed lands here, whether they addressed the floor or
   * named a seat. What arrives from another seat does not: that is work on the
   * bus, and the bus routes on the typed contract.
   */
  #isConversationTurn(task: TaskRecord, row: QueuedRow): boolean {
    if (row.message.origin !== "human") return false;
    return (
      task.templateId === INTAKE_TEMPLATE_ID ||
      task.templateId === ASK_TEMPLATE_ID
    );
  }

  /**
   * Everything a turn needs that does not depend on which seat is taking it or
   * why. Shared so a delegated turn runs on the same route, policy and history
   * as the turn that asked for it.
   */
  async #turnBasics(
    row: QueuedRow,
    staff: StaffSpec,
  ): Promise<{
    colleagues: Array<{ id: string; role: string }>;
    basePolicy: SecurityPolicyBundle;
    userDataPath: string;
    provider: NonNullable<OfficeSchedulerOptions["provider"]>;
    model: string;
    thinking: boolean;
    providers: OfficeSchedulerOptions["providers"];
    tokenCeiling: number;
    clock: SchedulingTimeSource;
    callModel?: TaskModelCall;
    denyTools?: string[];
  }> {
    const webAllowed = (await this.#options.webSearchAllowed?.()) ?? true;
    const trace = this.traces.get(row.traceId);
    const traceRemaining = trace
      ? Math.max(0, trace.tokenBudget - trace.tokensSpent)
      : 0;
    return {
      colleagues: this.#roster
        .filter((member) => member.id !== staff.id)
        .map((member) => ({ id: member.id, role: member.role })),
      basePolicy: this.#options.basePolicy,
      userDataPath: this.#options.userDataPath,
      provider: this.#options.provider ?? "openrouter",
      model: this.#options.model ?? "floor-default",
      thinking: Boolean(this.#options.thinking),
      providers: this.#options.providers,
      tokenCeiling: Math.min(
        staff.budget.perTaskTokens,
        traceRemaining,
        this.meter.remaining(),
      ),
      clock: this.clock,
      ...(this.#options.callModel
        ? { callModel: this.#options.callModel }
        : {}),
      ...(webAllowed ? {} : { denyTools: [...WEB_TOOL_NAMES] }),
    };
  }

  /**
   * The room's transcript as chat turns, every teammate included.
   *
   * A channel is one conversation. Without the other seats' lines, "@이장훈"
   * followed by "@Redrob what did they say?" has Redrob inventing an answer
   * with no memory of the room. Other speakers are tagged `[Teammate Name]:`
   * on the user side — never as assistant — so this seat keeps its own voice.
   */
  async #historyFor(
    row: QueuedRow,
    staffId: string,
  ): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    const goal =
      row.message.type === "REQUEST"
        ? (row.message.saidAs?.trim() ?? "")
        : "";
    const turns: Array<{
      at: number;
      role: "user" | "assistant";
      content: string;
    }> = [];
    for (const event of this.channelEvents.list(
      row.channelId,
      0,
      CONVERSATION_TURNS * 3,
    )) {
      if (event.type !== "message") continue;
      const text = String(event.payload["text"] ?? "").trim();
      if (!text) continue;
      const fromPerson =
        event.authorId === "human" || event.payload["role"] === "user";
      if (fromPerson) {
        turns.push({ at: event.ts, role: "user", content: text });
        continue;
      }
      const name =
        this.teamMembers.get(event.authorId)?.name ??
        findStaff(this.#roster, event.authorId)?.role ??
        event.authorId;
      const mine = event.authorId === staffId;
      if (mine) {
        // Only this seat's own lines sit in the assistant role. Chat models
        // treat every assistant turn as "what I said", which is how a seat
        // started answering in a colleague's voice after reading [Name]: lines.
        turns.push({ at: event.ts, role: "assistant", content: text });
        continue;
      }
      turns.push({
        at: event.ts,
        role: "user",
        content: `[Teammate ${name}]: ${text}`,
      });
    }
    turns.sort((a, b) => a.at - b.at);
    // The current ask is the turn's instruction; leave it out of history so
    // the model is not asked to answer the same line twice.
    while (
      goal &&
      turns.length > 0 &&
      turns[turns.length - 1]!.role === "user" &&
      turns[turns.length - 1]!.content === goal
    ) {
      turns.pop();
    }
    return turns
      .slice(-CONVERSATION_TURNS)
      .map((turn) => ({ role: turn.role, content: turn.content }));
  }

  /**
   * Handing work to a colleague as a tool call rather than a bus message.
   *
   * A REQUEST posted to a mailbox leaves the sender with nothing to say: it
   * cannot see what came back, so a person watching gets a handoff and then
   * silence, and a seat handed work it has no tools for ends the thread where it
   * stands. Delegating in the loop gives the result back to whoever asked.
   */
  #delegateTool(
    row: QueuedRow,
    from: StaffSpec,
    onArtifact: (artifactId: string) => void,
    visited: ReadonlySet<string> = new Set([from.id]),
    depth = 0,
  ): TaskExecutionExtraTool {
    const channel = this.channels.get(row.channelId);
    const channelMembers = new Map(
      (channel?.memberIds ?? [])
        .map((id) => this.teamMembers.get(id))
        .filter(
          (member): member is TeamMember =>
            Boolean(member?.active && member.id !== ASSISTANT_ID),
        )
        .map((member) => [member.id, member]),
    );
    // User-created agents may mention only other active agents in this room.
    // Legacy workflow seats keep their existing internal routing until that
    // workflow engine is retired; they are never exposed in the channel picker.
    const peers = this.#roster.filter(
      (seat) =>
        !visited.has(seat.id) &&
        (!from.custom || channelMembers.has(seat.id)),
    );
    const peerLabel = (seat: StaffSpec): string => {
      const member = channelMembers.get(seat.id);
      return member
        ? `@${member.name} ("${member.id}", ${member.permission} access)`
        : `"${seat.id}" (${seat.role})`;
    };
    return {
      definition: {
        name: DELEGATE_TOOL,
        description: [
          "Mention one other agent in this channel, give them a self-contained task, and wait for their reply.",
          `The mention is visible in the shared channel. Mentioned agents may mention another agent, up to ${MAX_DELEGATE_DEPTH} mentions total.`,
          `Available agents: ${peers.map(peerLabel).join(", ") || "none"}.`,
        ].join(" "),
        parameters: {
          type: "object",
          properties: {
            to: { type: "string", description: "The mentioned agent's id." },
            task: {
              type: "string",
              description:
                "One or two sentences saying what they should produce. They already see this channel, so do not paste its history.",
            },
            reason: {
              type: "string",
              description:
                "Why you are mentioning them, in one short sentence.",
            },
          },
          required: ["to", "task", "reason"],
        },
      },
      run: async (args) => {
        const to = typeof args["to"] === "string" ? args["to"] : "";
        const task =
          typeof args["task"] === "string" ? args["task"].trim() : "";
        const reason =
          typeof args["reason"] === "string" ? args["reason"].trim() : "";
        if (!reason) {
          return {
            ok: false,
            summary:
              "Say why you are mentioning them (reason cannot be empty).",
          };
        }
        // A person asking for a file needs the seat that can create one. Left to
        // the model this went to Research, which can gather but cannot produce
        // the spreadsheet, and the thread ended there with nothing to show.
        const editorial = peers.find((peer) => peer.layer === "editorial");
        const seat =
          !from.custom &&
          from.layer === "lead" &&
          isDocumentIntake(row) &&
          editorial
            ? editorial
            : peers.find((peer) => peer.id === to);
        if (!seat) {
          return {
            ok: false,
            summary: `No teammate with id "${to}". Pick one of: ${peers
              .map((peer) => peer.id)
              .join(", ")}.`,
          };
        }
        if (!task)
          return { ok: false, summary: "Say what they should produce." };
        const { appendDelegateEvent } = await import("./channels/routing.js");
        const targetMember = channelMembers.get(seat.id);
        appendDelegateEvent(
          this.channelEvents,
          row.channelId,
          from.id,
          seat.id,
          reason,
          {
            task,
            ...(targetMember ? { permission: targetMember.permission } : {}),
          },
        );
        const fromName = this.teamMembers.get(from.id)?.name ?? from.role;
        const targetName = targetMember?.name ?? seat.role;
        await appendOfficeEvent({
          clock: this.clock,
          event: "delegate.called",
          summary: `${fromName} mentioned ${targetName}`,
          traceId: row.traceId,
          staffId: from.id,
          detail: {
            channelId: row.channelId,
            to: seat.id,
            reason,
            task,
            ...(targetMember ? { permission: targetMember.permission } : {}),
          },
        });
        // The assignee can see the channel, so a pasted dataset in the ask is
        // the same waste it was when this travelled as a REQUEST.
        const short = trimRequestInstruction(task);
        if (short.trimmed) {
          await appendOfficeEvent({
            clock: this.clock,
            event: "floor.requestTrimmed",
            summary: `${from.role} assignment was shortened`,
            traceId: row.traceId,
            staffId: from.id,
            detail: {
              channelId: row.channelId,
              before: task.length,
              after: short.text.length,
            },
          });
        }
        return this.#runSubagent(
          row,
          seat,
          short.text,
          onArtifact,
          new Set([...visited, seat.id]),
          depth + 1,
        );
      },
    };
  }

  /**
   * One colleague's turn, run inside the turn that asked for it.
   *
   * It gets its own Task so budget, audit and progress stay per-seat, and the
   * same channel history, so it does not have to be told what the room already
   * knows.
   *
   * Work keeps the typed contract even though the conversation above it does
   * not. That contract is what routes: a draft that has to be checked before it
   * leaves the machine still DELIVERs to the reviewer, and dropping it here
   * would have quietly deleted the review and publish chain.
   */
  async #runSubagent(
    row: QueuedRow,
    seat: StaffSpec,
    instruction: string,
    onArtifact: (artifactId: string) => void,
    visited: ReadonlySet<string>,
    depth: number,
  ): Promise<{ ok: boolean; summary: string }> {
    const taskId = `task-${randomUUID()}`;
    this.tasks.create({
      id: taskId,
      traceId: row.traceId,
      staffId: seat.id,
      templateId: ASK_TEMPLATE_ID,
      title: instruction.slice(0, 80),
      instruction,
      seat: this.#roster.findIndex((member) => member.id === seat.id),
    });
    const task = this.tasks.get(taskId);
    if (!task) return { ok: false, summary: "Could not open the task." };

    const controller = new AbortController();
    this.#aborts.set(taskId, controller);
    this.#seatState.set(seat.id, "working");
    this.#seatTask.set(seat.id, taskId);
    this.#typing.add(seat.id);
    this.#emit();

    const reports = this.#reportProgress(
      seat,
      taskId,
      row.traceId,
      row.channelId,
    );
    try {
      const brief = await this.#briefFor(row, true);
      const outcome = await executeTask({
        ...(await this.#turnBasics(row, seat)),
        task,
        staff: seat,
        signal: controller.signal,
        directives: [OUTPUT_CONTRACT_PROMPT],
        ...(brief ? { channelBrief: brief } : {}),
        ...(depth < MAX_DELEGATE_DEPTH &&
        this.#roster.some((member) => !visited.has(member.id))
          ? {
              extraTools: [
                this.#delegateTool(row, seat, onArtifact, visited, depth),
              ],
            }
          : {}),
        onEvent: (event) => {
          if (event.kind === "tool_result" && event.ok && event.artifactId) {
            onArtifact(event.artifactId);
          }
          reports.observe(event);
        },
        onApproval: (request) =>
          this.#queueApproval(row, seat, taskId, request),
      });
      this.traces.spend(row.traceId, outcome.tokens);
      if (outcome.deferredApproval) {
        this.tasks.saveCheckpoint(taskId, outcome.checkpoint);
        this.tasks.setState(taskId, "waiting-approval");
        return {
          ok: false,
          summary: `${seat.role} needs the person to approve ${outcome.deferredApproval.name} before going on. It is waiting in the approval tray.`,
        };
      }
      return await this.#handOffSubagent(row, seat, taskId, outcome.text);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.tasks.finish(taskId, "blocked", detail, 0);
      return { ok: false, summary: detail };
    } finally {
      reports.stop();
      this.#typing.delete(seat.id);
      this.#aborts.delete(taskId);
      this.#seatState.set(seat.id, "idle");
      this.#seatTask.delete(seat.id);
      this.#emit();
    }
  }

  /**
   * The channel brief a turn runs with: what was said in the room, plus this
   * channel's prior answers folded in by time.
   *
   * A seat handling a row does not need its own orders read back to it, so that
   * row is left out. A colleague delegated to from inside that row is the other
   * case: the person's line is the whole reason it was called, so `keepRow`
   * holds it in.
   */
  async #briefFor(row: QueuedRow, keepRow = false): Promise<string> {
    const answers = await this.#recentAnswers(row.channelId);
    return buildChannelBrief(
      this.queue.listSince(0, 24, row.channelId),
      keepRow ? undefined : row.id,
      answers,
    );
  }

  /**
   * The answers already spoken in a channel.
   *
   * Read from the channel event log — the same transcript the UI shows — so
   * every teammate's line is in the brief, not only audit rows that happened
   * to be tagged `floor.answered`.
   */
  async #recentAnswers(channelId: string): Promise<BriefAnswer[]> {
    const answers: BriefAnswer[] = [];
    for (const event of this.channelEvents.list(channelId, 0, CHANNEL_LIMIT)) {
      if (event.type !== "message") continue;
      if (event.authorId === "human" || event.payload["role"] === "user") {
        continue;
      }
      const text = String(event.payload["text"] ?? "").trim();
      if (!text) continue;
      const role =
        this.teamMembers.get(event.authorId)?.name ??
        findStaff(this.#roster, event.authorId)?.role ??
        event.authorId;
      answers.push({ createdAt: event.ts, role, text });
    }
    return answers;
  }

  /**
   * Put a seat's answer to a question in the channel, in its own words.
   *
   * Unlike a greeting or a request for a clearer goal, these words cannot come
   * from the catalog - they are the answer - so the model is told to write in
   * the language the person used and the text travels as written. Nothing is
   * published to the bus: there is no next desk for an answer to reach.
   */
  async #sayAnswer(
    row: QueuedRow,
    staff: StaffSpec,
    task: TaskRecord,
    text: string,
    made?: string | undefined,
  ): Promise<void> {
    const { appendAssistantMessage } = await import("./channels/routing.js");
    appendAssistantMessage(this.channelEvents, row.channelId, staff.id, text, {
      ...(made ? { artifactId: made } : {}),
    });
    if (made) {
      this.channelEvents.append({
        id: `evt-${randomUUID()}`,
        channelId: row.channelId,
        authorId: staff.id,
        type: "artifact",
        payload: { artifactId: made, label: text.slice(0, 80) },
      });
    }
    await appendOfficeEvent({
      clock: this.clock,
      event: "floor.answered",
      summary: text,
      traceId: row.traceId,
      taskId: task.id,
      staffId: staff.id,
      // The file the turn produced rides along with the sentence about it.
      // Without it a seat that had just written a spreadsheet could only name a
      // path, so the person asked for the contents as text and the whole table
      // was typed out again.
      detail: {
        channelId: row.channelId,
        ...(made ? { artifactId: made } : {}),
      },
    });
    this.tasks.finish(task.id, "done", "Answered", 0);
    this.#seatState.set(staff.id, "idle");
    this.#seatTask.delete(staff.id);
    this.queue.complete(row.id, "done");
    this.#emit();
  }

  /**
   * Own a malfunction in the reader's language instead of quoting the validator.
   *
   * The goal is lost either way - there is no plan to salvage from an answer
   * that did not parse - so the honest thing is to say so and invite them to
   * repeat it, rather than to publish a Zod issue path as though it were a
   * colleague's reply.
   */
  async #sayGlitch(
    row: QueuedRow,
    staff: StaffSpec,
    task: TaskRecord,
    reason: string,
  ): Promise<void> {
    // Nothing is coming out of this trace, so nothing typed into it is waiting
    // to be delivered either. Left in the mailbox, those lines would be handed
    // to the next turn as if they had been said to it.
    const repeated = this.#glitched.has(row.channelId);
    this.#glitched.add(row.channelId);
    this.#followUps.delete(row.traceId);
    this.#aborts.get(task.id)?.abort();
    await appendOfficeEvent({
      clock: this.clock,
      event: "floor.glitch",
      summary: `${staff.role} could not use its own answer`,
      traceId: row.traceId,
      taskId: task.id,
      staffId: staff.id,
      detail: {
        channelId: row.channelId,
        reason,
        ...(repeated ? { repeated: true } : {}),
      },
    });
    this.tasks.finish(task.id, "blocked", reason, 0);
    this.#seatState.set(staff.id, "idle");
    this.#seatTask.delete(staff.id);
    this.queue.complete(row.id, "done");
    this.#emit();
  }

  async #runStaffTurn(row: QueuedRow, staff: StaffSpec): Promise<void> {
    this.#turns += 1;
    const task = this.#taskForMessage(row, staff);
    if (!task) {
      this.queue.complete(row.id, "dropped");
      return;
    }

    if (task.templateId === SMALLTALK_TEMPLATE_ID) {
      await this.#answerSmalltalk(row, staff, task);
      return;
    }

    // Deterministic verification runs before the model ever sees the work.
    let gateResults: GateResult[] = [];
    let gateFailure: GateResult | null = null;
    if (row.message.type === "DELIVER" && staff.layer === "review") {
      const template = findTemplate(this.templates, task.templateId);
      const ref = row.message.artifactRef;
      const verdict = await runDeterministicGates(
        template?.gates ?? ["schema"],
        {
          ...(ref.kind === "file"
            ? { artifactPath: ref.id, sourcePath: ref.id }
            : {}),
          ...(ref.sha256 ? { expectedSha256: ref.sha256 } : {}),
          mustAppearInSource: extractClaimedValues(row.message.claim),
        },
      );
      gateResults = verdict.results;
      gateFailure = verdict.firstFailure;
      recordGateResults(
        this.db,
        task.id,
        gateResults,
        Boolean(gateFailure),
        this.clock,
      );
      if (gateResults.length > 0) {
        await appendOfficeEvent({
          clock: this.clock,
          event: gateFailure ? "gate.failed" : "gate.passed",
          summary: gateFailure
            ? `${gateFailure.gate} gate failed: ${gateFailure.detail}`
            : `${gateResults.length} deterministic gate(s) passed`,
          traceId: row.traceId,
          taskId: task.id,
          staffId: staff.id,
          detail: {
            gates: gateResults.map((result) => ({
              gate: result.gate,
              passed: result.passed,
            })),
            ...(gateFailure?.locator ? { locator: gateFailure.locator } : {}),
          },
        });
      }
    }

    this.tasks.markStarted(task.id);
    this.#seatState.set(staff.id, "working");
    this.#seatTask.set(staff.id, task.id);
    this.#emit();
    await appendOfficeEvent({
      clock: this.clock,
      event: "task.started",
      summary: `${staff.role} started ${task.title}`,
      traceId: row.traceId,
      taskId: task.id,
      staffId: staff.id,
    });

    const controller = new AbortController();
    this.#aborts.set(task.id, controller);
    // Left unset the floor may search, which is what a seat with the tool in its
    // spec means. The host wires this to the person's own switch.
    const webAllowed = (await this.#options.webSearchAllowed?.()) ?? true;
    const deniedForTurn = new Set<string>(webAllowed ? [] : WEB_TOOL_NAMES);
    // A document ask is orchestration work for the lead. With search tools in
    // reach, the lead repeatedly researched until its iteration budget ran out,
    // then either asked what the goal was or handed file creation to Research.
    // The Writer already owns both web research and document tools.
    if (staff.layer === "lead" && isDocumentIntake(row)) {
      for (const tool of staff.tools) deniedForTurn.add(tool);
    }
    const directiveRecords = this.directives.effectiveFor(
      row.traceId,
      this.clock.now(),
    );
    const trace = this.traces.get(row.traceId);
    const dayRemaining = this.meter.remaining();
    const traceRemaining = trace
      ? Math.max(0, trace.tokenBudget - trace.tokensSpent)
      : 0;
    const ceiling = Math.min(
      staff.budget.perTaskTokens,
      traceRemaining,
      dayRemaining,
    );

    if (ceiling <= 0) {
      await this.#escalateBudget(row, staff, task.id);
      this.#aborts.delete(task.id);
      this.queue.complete(row.id, "done");
      return;
    }

    // The board can start without a model. Work cannot. This is the first
    // point in the whole path that needs one, which is deliberate: resolving a
    // route probes the GPU and stats weights, and doing that at the composer
    // is what made sending a message feel slow.
    //
    // A bound route is not the same as a working one: the weights may be on
    // disk with no runtime able to load them. Asking here turns a mid-flight
    // crash into a sentence the reader can act on, which matters most for a
    // message the queue recovered from an earlier run.
    const usable = this.#options.callModel
      ? { ok: true as const }
      : ((await this.#options.inferenceReady?.()) ?? { ok: true as const });
    if (!usable.ok) {
      const reason = usable.reason;
      await appendOfficeEvent({
        clock: this.clock,
        event: "task.failed",
        summary: reason,
        traceId: row.traceId,
        taskId: task.id,
        staffId: staff.id,
      });
      this.tasks.finish(task.id, "failed", reason, 0);
      this.#seatState.set(staff.id, "idle");
      this.#seatTask.delete(staff.id);
      this.#aborts.delete(task.id);
      this.queue.complete(row.id, "failed");
      this.#emit();
      return;
    }

    // Nobody has said anything yet, and nobody will until the model answers.
    // Marking the seat here is what lets the channel show "Writer is typing…"
    // for the part of a turn that is actually the wait.
    this.#typing.add(staff.id);
    this.#emit();

    const reports = this.#reportProgress(
      staff,
      task.id,
      row.traceId,
      row.channelId,
    );
    // A person talking to a seat is a conversation, not an assignment: it gets
    // the thread as real turns and answers in prose, with colleagues reachable
    // as a tool. Work travelling between seats keeps the typed contract, which
    // is what the bus routes on.
    const talking = this.#isConversationTurn(task, row);
    const basics = await this.#turnBasics(row, staff);
    const channelBrief = talking ? "" : await this.#briefFor(row);
    // The last file this turn produced, so an answer about it can carry it.
    let made: string | undefined;
    let outcome: Awaited<ReturnType<typeof executeTask>>;
    try {
      outcome = await executeTask({
        ...basics,
        task,
        staff,
        ...(deniedForTurn.size > 0 ? { denyTools: [...deniedForTurn] } : {}),
        tokenCeiling: ceiling,
        signal: controller.signal,
        directives: [
          ...directiveRecords.map(
            (directive) => `${directive.kind}: ${directive.body}`,
          ),
          ...(gateFailure
            ? [
                `Deterministic check "${gateFailure.gate}" already failed: ${gateFailure.detail}. Locator ${gateFailure.locator ?? "unknown"}. Do not re-litigate it; challenge with that evidence.`,
              ]
            : gateResults.length > 0
              ? [
                  `Deterministic checks all passed: ${gateResults.map((r) => r.gate).join(", ")}.`,
                ]
              : []),
          ...(talking ? [] : [OUTPUT_CONTRACT_PROMPT]),
        ],
        // Work already arrives with the channel brief; the thread as turns is
        // what a conversation needs, and giving a bus turn both would only
        // repeat the room at it twice.
        ...(talking
          ? {
              output: "prose" as const,
              history: await this.#historyFor(row, staff.id),
              extraTools: [
                this.#delegateTool(row, staff, (artifactId) => {
                  made = artifactId;
                }),
              ],
            }
          : {}),
        // The assignee already sees what was said in the room, so a lead can
        // assign in one line instead of pasting the deliverable into chat.
        ...(channelBrief ? { channelBrief } : {}),
        onEvent: (event) => {
          if (event.kind === "tool_result" && event.ok && event.artifactId) {
            made = event.artifactId;
          }
          reports.observe(event);
        },
        onApproval: (request) =>
          this.#queueApproval(row, staff, task.id, request),
        humanFollowUps: () => this.#drainFollowUps(row.traceId),
      });
    } finally {
      reports.stop();
      this.#typing.delete(staff.id);
    }
    this.#aborts.delete(task.id);

    this.tasks.addTokens(task.id, outcome.tokens);
    this.traces.spend(row.traceId, outcome.tokens);
    const spend = this.meter.spend({
      staffId: staff.id,
      traceId: row.traceId,
      tokens: outcome.tokens,
      costMicros: Math.round(outcome.tokens * 0.6),
    });
    await appendOfficeEvent({
      clock: this.clock,
      event: "budget.spent",
      summary: `${staff.role} spent ${outcome.tokens} tokens`,
      traceId: row.traceId,
      taskId: task.id,
      staffId: staff.id,
      detail: {
        tokens: outcome.tokens,
        dayTokens: spend.tokens,
        budget: spend.budget,
      },
    });
    if (spend.exhausted) {
      const exhaustion = this.meter.noteExhaustion();
      await appendOfficeEvent({
        clock: this.clock,
        event: "budget.exhausted",
        summary: `Token budget exhausted; action: ${exhaustion.action}`,
        detail: { action: exhaustion.action },
      });
    }

    if (outcome.deferredApproval) {
      this.tasks.saveCheckpoint(task.id, outcome.checkpoint);
      this.tasks.setState(task.id, "waiting-approval");
      this.#seatState.set(staff.id, "waiting-approval");
      this.queue.complete(row.id, "done");
      this.#emit();
      return;
    }

    // The reply is the reply. There is nothing to parse, so there is no parse to
    // fail: the glitch, the retake and the request for a clearer goal all exist
    // to rescue a sentence that had to become a routable message, and a
    // conversation has nothing to route.
    if (talking) {
      const said = outcome.text.trim();
      if (said) {
        this.#glitched.delete(row.channelId);
        await this.#sayAnswer(row, staff, task, said, made);
        return;
      }
      await this.#sayGlitch(row, staff, task, "The turn came back empty");
      return;
    }

    const parsed = parseStaffOutput(outcome.text);
    if (!parsed.ok) {
      const denial = outcome.denialReasons[0];
      const reason = denial ?? `Unusable output: ${parsed.reason}`;
      // Only work reaches here now, and work has somewhere to go: the seat that
      // is waiting on it. A person never sees a validator's own words, because
      // nothing they say is parsed in the first place.
      await this.#publishDerived(row, staff, task.id, {
        type: "BLOCK",
        reason,
        unblockCondition: denial
          ? "Grant the seat what it was refused, or reassign the step"
          : "Reissue the task with a valid typed answer",
      });
      this.tasks.finish(task.id, "blocked", reason, 0);
      this.#seatState.set(staff.id, "blocked");
      this.queue.complete(row.id, "done");
      this.#emit();
      return;
    }

    // Something came back usable, so whatever was wrong is no longer the last
    // thing that happened here.
    this.#glitched.delete(row.channelId);

    // A question is not work, so its answer is not a bus message. It goes to the
    // person who asked and the trace ends there.
    if (parsed.output.type === "ANSWER") {
      await this.#sayAnswer(row, staff, task, parsed.output.text, made);
      return;
    }

    await this.#publishDerived(row, staff, task.id, parsed.output);
    const finalState =
      parsed.output.type === "BLOCK"
        ? "blocked"
        : parsed.output.type === "ESCALATE"
          ? "checkpointed"
          : "done";
    const summary =
      parsed.output.type === "BLOCK"
        ? parsed.output.reason
        : parsed.output.type === "ESCALATE"
          ? parsed.output.reason
          : parsed.output.type === "CHALLENGE"
            ? `Challenged: ${parsed.output.targetClaim}`
            : parsed.output.type === "DELIVER"
              ? parsed.output.claim
              : parsed.output.instruction;
    this.tasks.finish(task.id, finalState, summary, 0);
    this.#seatState.set(
      staff.id,
      finalState === "done"
        ? "idle"
        : finalState === "blocked"
          ? "blocked"
          : "idle",
    );
    this.#seatTask.delete(staff.id);
    await appendOfficeEvent({
      clock: this.clock,
      event: "task.finished",
      summary: `${staff.role} finished ${task.title} with ${parsed.output.type}`,
      traceId: row.traceId,
      taskId: task.id,
      staffId: staff.id,
      detail: {
        outputType: parsed.output.type,
        iterations: outcome.iterations,
      },
    });
    this.queue.complete(row.id, "done");
    this.#emit();
  }

  /**
   * What a delegated seat came back with, turned into one line for whoever asked
   * and, where the contract says so, onto the bus as well.
   *
   * ANSWER comes straight back. DELIVER goes both ways: the reviewer gets the
   * draft through the bus as before, and the seat that delegated hears that it
   * exists, so it has something to tell the person instead of falling silent
   * while a review happens out of sight.
   */
  async #handOffSubagent(
    row: QueuedRow,
    seat: StaffSpec,
    taskId: string,
    text: string,
  ): Promise<{ ok: boolean; summary: string }> {
    const parsed = parseStaffOutput(text);
    if (!parsed.ok) {
      this.tasks.finish(taskId, "blocked", parsed.reason, 0);
      return {
        ok: false,
        summary: `${seat.role} could not put its result in the office contract (${parsed.reason}). Say what you need from them in plainer terms, or answer the person yourself.`,
      };
    }
    const output = parsed.output;
    this.tasks.finish(taskId, "done", output.type, 0);
    if (output.type === "ANSWER") {
      // A mention is a public channel conversation, not a private RPC. The
      // result still returns to the agent that mentioned this one so it can
      // continue, but the mentioned agent's own words must also appear under
      // its own identity in the transcript.
      const { appendAssistantMessage } = await import("./channels/routing.js");
      appendAssistantMessage(
        this.channelEvents,
        row.channelId,
        seat.id,
        output.text,
        { mentionedReply: true },
      );
      return { ok: true, summary: output.text };
    }
    await this.#publishDerived(row, seat, taskId, output);
    if (output.type === "DELIVER") {
      return {
        ok: true,
        summary: `${seat.role} finished: ${output.claim}. It has gone to ${output.to} to be checked.`,
      };
    }
    if (output.type === "BLOCK") {
      return {
        ok: false,
        summary: `${seat.role} is blocked: ${output.reason}`,
      };
    }
    if (output.type === "ESCALATE") {
      return {
        ok: false,
        summary: `${seat.role} needs a decision from the person: ${output.reason}. It is in the approval tray.`,
      };
    }
    return {
      ok: true,
      summary: `${seat.role} passed it on and the floor is carrying it.`,
    };
  }

  async #publishDerived(
    row: QueuedRow,
    staff: StaffSpec,
    taskId: string,
    output: BusStaffOutput,
  ): Promise<void> {
    const now = this.clock.now();
    const depth = row.depth + 1;
    const base = {
      id: `msg-${randomUUID()}`,
      traceId: row.traceId,
      depth,
      // Derived work stays in the channel the goal was said in, so a channel
      // holds the whole thread rather than only its first line.
      channelId: row.channelId,
      from: staff.id,
    };

    if (output.type === "CHALLENGE") {
      const meetingId = row.meetingId ?? `meet-${row.traceId}`;
      this.meetings.open({
        id: meetingId,
        traceId: row.traceId,
        topic: output.targetClaim,
        participants: [staff.id, row.from],
      });
      const verdict = this.meetings.enterRound(meetingId);
      await appendOfficeEvent({
        clock: this.clock,
        event: verdict.ok ? "meeting.round" : "meeting.escalated",
        summary: verdict.ok
          ? `Meeting ${meetingId} round ${verdict.round}/${MEETING_MAX_ROUNDS}`
          : verdict.reason,
        traceId: row.traceId,
        taskId,
        staffId: staff.id,
        detail: { meetingId, round: verdict.round },
      });
      if (!verdict.ok) {
        this.meetings.escalateAndClose(meetingId, verdict.reason);
        await this.#fileTrayItem({
          traceId: row.traceId,
          taskId,
          staffId: staff.id,
          kind: "meeting-deadlock",
          headline: `Unresolved after ${MEETING_MAX_ROUNDS} rounds: ${output.targetClaim}`,
          detail: verdict.reason,
          evidence: output.evidenceRef,
          dissent: output.alternative,
          options: [
            "Accept the original claim",
            "Accept the challenger's alternative",
          ],
        });
        await appendOfficeEvent({
          clock: this.clock,
          event: "meeting.closed",
          summary: `Meeting ${meetingId} locked and handed to the approval tray`,
          traceId: row.traceId,
          taskId,
          detail: { meetingId },
        });
        return;
      }
      await this.bus.publish({
        message: {
          ...base,
          type: "CHALLENGE",
          to: output.to,
          meetingId,
          targetClaim: output.targetClaim,
          evidenceRef: output.evidenceRef,
          alternative: output.alternative,
        },
      });
      return;
    }

    if (output.type === "ESCALATE") {
      await this.#fileTrayItem({
        traceId: row.traceId,
        taskId,
        staffId: staff.id,
        kind: "escalation",
        headline: output.reason,
        detail: output.reason,
        evidence: output.evidenceRef,
        dissent: null,
        options: output.options,
      });
      return;
    }

    if (output.type === "BLOCK") {
      await this.bus.publish({
        message: {
          ...base,
          type: "BLOCK",
          // A block on intake work goes to whoever hands work out, not to self.
          to: row.from === INTAKE_ID ? this.#leadId(staff.id) : row.from,
          reason: output.reason,
          unblockCondition: output.unblockCondition,
        },
      });
      return;
    }

    if (output.type === "DELIVER") {
      const result = await this.bus.publish({
        message: {
          ...base,
          type: "DELIVER",
          to: output.to,
          artifactRef: await this.#fileIfDeliverable(
            output.artifactRef,
            output.claim,
          ),
          claim: output.claim,
          ...(row.meetingId ? { meetingId: row.meetingId } : {}),
        },
      });
      if (
        !result.ok &&
        (result.code === "trace-budget" || result.code === "depth-budget")
      ) {
        await this.#escalateBudget(row, staff, taskId, result.reason);
      }
      return;
    }

    // A lead that pastes the deliverable into the assignment burns the channel
    // twice: once as chat, again when the person asks to see the file. Cut it
    // down; the assignee already has the channel brief.
    let instruction = output.instruction;
    let recipient = output.to;
    if (staff.layer === "lead") {
      // Even if a model names Research, a human asking for a file needs the
      // editorial seat that can actually create it. Research can still be
      // requested by Writer if a separate notes artifact is useful.
      if (isDocumentIntake(row)) {
        recipient =
          this.#roster.find((member) => member.layer === "editorial")?.id ??
          recipient;
      }
      const cut = trimRequestInstruction(instruction);
      if (cut.trimmed) {
        instruction = cut.text;
        await appendOfficeEvent({
          clock: this.clock,
          event: "floor.requestTrimmed",
          summary: `${staff.role} assignment was shortened`,
          traceId: row.traceId,
          taskId,
          staffId: staff.id,
          detail: {
            channelId: row.channelId,
            before: output.instruction.length,
            after: instruction.length,
          },
        });
      }
    }

    const result = await this.bus.publish({
      message: {
        ...base,
        type: "REQUEST",
        to: recipient,
        needs: output.needs,
        dueBy: now + output.dueByMinutes * MINUTE,
        instruction,
      },
    });
    if (
      !result.ok &&
      (result.code === "trace-budget" || result.code === "depth-budget")
    ) {
      await this.#escalateBudget(row, staff, taskId, result.reason);
    }
  }

  /**
   * A delivered file is only a path until it is filed. Copy it into the
   * library so the channel card can open it, and carry the library id on the
   * reference. Filing failing is not worth losing the delivery over.
   */
  async #fileIfDeliverable(
    ref: ArtifactRef,
    claim: string,
  ): Promise<ArtifactRef> {
    const file = this.#options.fileDeliverable;
    if (!file || ref.kind !== "file" || ref.artifactId) return ref;
    try {
      const artifactId = await file({
        path: ref.id,
        title: ref.label ?? claim.slice(0, 80),
      });
      return artifactId ? { ...ref, artifactId } : ref;
    } catch {
      return ref;
    }
  }

  /**
   * Where a trace was being talked about. An approved task resumes in the
   * channel it came from, not wherever the tray happened to be opened.
   */
  #channelOfTrace(traceId: string): string {
    return this.queue.listByTrace(traceId)[0]?.channelId ?? DEFAULT_CHANNEL_ID;
  }

  /** Who hears about a stuck task: the lead, or the editorial seat if there is none. */
  #leadId(fallback: string): string {
    return (
      this.#roster.find((staff) => staff.layer === "lead")?.id ??
      this.#roster.find((staff) => staff.layer === "editorial")?.id ??
      fallback
    );
  }

  async #escalateBudget(
    row: QueuedRow,
    staff: StaffSpec,
    taskId: string,
    reason?: string,
  ): Promise<void> {
    const trace = this.traces.get(row.traceId);
    const detail =
      reason ??
      `Trace ${row.traceId} is out of budget (${trace?.tokensSpent ?? 0}/${trace?.tokenBudget ?? 0} tokens, depth ${trace?.deepest ?? 0}/${trace?.maxDepth ?? 0}).`;
    this.traces.setState(row.traceId, "escalated");
    this.queue.killTrace(row.traceId);
    await appendOfficeEvent({
      clock: this.clock,
      event: "trace.budget.exceeded",
      summary: detail,
      traceId: row.traceId,
      taskId,
      staffId: staff.id,
    });
    await this.#fileTrayItem({
      traceId: row.traceId,
      taskId,
      staffId: staff.id,
      kind: "budget",
      headline: `Out of budget: ${detail}`,
      detail,
      evidence: [{ kind: "task", id: taskId }],
      dissent: null,
      options: [
        "Close the trace as-is",
        "Raise the budget and restart the trace",
      ],
    });
    this.tasks.setState(taskId, "checkpointed");
  }

  async #fileEscalation(row: QueuedRow): Promise<void> {
    if (row.message.type !== "ESCALATE") return;
    await this.#fileTrayItem({
      traceId: row.traceId,
      taskId: null,
      staffId: row.from,
      kind: "escalation",
      headline: row.message.reason,
      detail: row.message.reason,
      evidence: row.message.evidenceRef,
      dissent: null,
      options: row.message.options,
    });
  }

  async #fileTrayItem(input: {
    traceId: string;
    taskId: string | null;
    staffId: string;
    kind: "outbound" | "escalation" | "meeting-deadlock" | "budget";
    headline: string;
    detail: string;
    evidence: EvidenceRef[];
    dissent: string | null;
    options: string[];
  }): Promise<string> {
    const id = `apr-${randomUUID()}`;
    this.tray.queue({
      id,
      traceId: input.traceId,
      taskId: input.taskId,
      staffId: input.staffId,
      kind: input.kind,
      headline: input.headline,
      detail: input.detail,
      evidence: input.evidence,
      dissent: input.dissent,
      options: input.options,
    });
    await appendOfficeEvent({
      clock: this.clock,
      event: "approval.queued",
      summary: input.headline,
      traceId: input.traceId,
      ...(input.taskId ? { taskId: input.taskId } : {}),
      staffId: input.staffId,
      detail: {
        approvalId: id,
        kind: input.kind,
        pending: this.tray.pendingCount(),
      },
    });
    await this.#reconcileProductionHalt();
    this.#emit();
    return id;
  }

  /**
   * Keeps the channel posted while a turn runs long.
   *
   * An office goes quiet when someone takes a while, and silence reads as
   * nothing happening — the complaint is never the wait itself, it is not
   * knowing. So the turn's own stream is watched for the latest thing the
   * colleague is doing, and that gets said on a timer.
   *
   * These are notes, not bus messages: a REQUEST would enqueue real work and
   * spend a model call on saying hello. Nothing here asks the model anything.
   */
  #reportProgress(
    staff: StaffSpec,
    taskId: string,
    traceId: string,
    channelId: string,
  ): { observe: (event: TaskStreamEvent) => void; stop: () => void } {
    const startedAt = this.clock.now();
    let announced = false;
    let stopped = false;

    const report = async (activity: Activity): Promise<void> => {
      // The turn can finish while the audit write is being scheduled.
      if (stopped) return;
      const now = this.clock.now();
      const elapsedMs = now - startedAt;
      this.channelEvents.append({
        id: `evt-${randomUUID()}`,
        channelId,
        authorId: staff.id,
        type: "progress",
        payload: {
          activity: activity.kind,
          target: "",
          role: staff.role,
          elapsedMs,
        },
      });
      await appendOfficeEvent({
        clock: this.clock,
        event: "task.progress",
        summary: progressSummary(staff.role, activity, elapsedMs),
        traceId,
        taskId,
        staffId: staff.id,
        detail: {
          channelId,
          activity: activity.kind,
          // One compact announcement describes the kind of work. Individual
          // queries and filenames are implementation detail, and putting every
          // one in chat produced a wall of progress messages.
          target: "",
          elapsedMs,
          spoken: true,
        },
      });
      this.#emit();
    };

    return {
      observe: (event) => {
        if (announced || event.kind !== "tool_request") return;
        const next = activityOf(event);
        if (!next) return;
        // A task gets one short spoken update, at the first concrete action.
        // Later tool calls stay behind the scenes instead of narrating every
        // search query, page and file.
        announced = true;
        void report(next);
      },
      stop: () => {
        stopped = true;
      },
    };
  }

  async #queueApproval(
    row: QueuedRow,
    staff: StaffSpec,
    taskId: string,
    request: {
      callId: string;
      name: string;
      args: Record<string, unknown>;
      risk: string;
    },
  ): Promise<ApprovalDecision> {
    // I4 draws the line at leaving the machine. Drafting inside the folders the
    // StaffSpec already scopes does not wake anyone up.
    if (!requiresHumanApproval(request.name)) return "allow_once";

    // Standing yes for this channel (persisted) — do not ask again.
    if (isAlwaysAllowed(row.channelId, request.name)) return "allow_session";

    // The person already said yes to exactly this call in the tray (once).
    const grant = `${taskId}:${request.name}`;
    if (this.#grants.delete(grant)) return "allow_once";

    const approvalId = await this.#fileTrayItem({
      traceId: row.traceId,
      taskId,
      staffId: staff.id,
      kind: "outbound",
      headline: `${staff.role} wants to run ${request.name}`,
      detail: JSON.stringify(request.args).slice(0, 2_000),
      evidence: [{ kind: "task", id: taskId }],
      dissent: null,
      options: ["Approve once", "Reject"],
    });
    this.channelEvents.append({
      id: `evt-${randomUUID()}`,
      channelId: row.channelId,
      authorId: staff.id,
      type: "approval",
      payload: {
        approvalId,
        taskId,
        tool: request.name,
        args: request.args,
        risk: request.risk,
        options: ["allow_once", "allow_session", "deny"],
      },
    });
    // Never hold a runner open waiting for a person.
    return "defer";
  }

  /** I3: over the line, producers stop; review and editorial keep going. */
  async #reconcileProductionHalt(): Promise<void> {
    const overflowing = this.tray.isOverflowing();
    const state = this.floorState.load();
    if (overflowing === state.productionHalted) return;
    this.floorState.patch({ productionHalted: overflowing });
    if (overflowing) {
      for (const staff of this.#roster) {
        if (!isProductionStaff(staff)) continue;
        this.#seatState.set(staff.id, "parked");
        const taskId = this.#seatTask.get(staff.id);
        if (taskId) this.#aborts.get(taskId)?.abort();
      }
      await appendOfficeEvent({
        clock: this.clock,
        event: "production.halted",
        summary: `Approval tray has ${this.tray.pendingCount()} items (limit ${APPROVAL_TRAY_HALT_THRESHOLD}). Production staff stopped.`,
        detail: {
          pending: this.tray.pendingCount(),
          halted: this.#roster.filter(isProductionStaff).map((s) => s.id),
        },
      });
      return;
    }
    for (const staff of this.#roster) {
      if (
        isProductionStaff(staff) &&
        this.#seatState.get(staff.id) === "parked"
      ) {
        this.#seatState.set(staff.id, "idle");
      }
    }
    await appendOfficeEvent({
      clock: this.clock,
      event: "production.resumed",
      summary: `Approval tray back to ${this.tray.pendingCount()} items. Production resumed.`,
    });
  }

  // ----------------------------------------------------------------- human input

  async resolveApproval(
    id: string,
    approved: boolean,
    decision: string,
  ): Promise<{ ok: boolean; pending: number }> {
    const item = this.tray.resolve(id, approved, decision);
    if (!item) {
      // The tray is shared with remote hosts, so an unknown id still means the
      // table may have moved since the last reconcile.
      await this.#reconcileProductionHalt();
      this.#emit();
      return { ok: false, pending: this.tray.pendingCount() };
    }
    await appendOfficeEvent({
      clock: this.clock,
      event: "approval.resolved",
      summary: `${approved ? "Approved" : "Rejected"}: ${item.headline}`,
      traceId: item.traceId,
      ...(item.taskId ? { taskId: item.taskId } : {}),
      staffId: item.staffId,
      detail: { approvalId: id, approved, decision },
    });
    if (approved && item.taskId) {
      const task = this.tasks.get(item.taskId);
      if (task) {
        if (item.kind === "outbound") {
          const tool = /run ([\w.]+)$/.exec(item.headline)?.[1];
          if (tool) {
            const channelId = this.#channelOfTrace(task.traceId);
            // "Allow for this channel" used to be a one-shot grant on the task
            // id, so the next turn asked again. Persist by channel + tool.
            if (decision === "allow_session") {
              allowAlways(channelId, tool);
            } else {
              this.#grants.add(`${task.id}:${tool}`);
            }
          }
        }
        this.tasks.setState(task.id, "queued");
        await this.bus.publish({
          fromHuman: true,
          message: {
            id: `msg-${randomUUID()}`,
            traceId: task.traceId,
            depth: 0,
            channelId: this.#channelOfTrace(task.traceId),
            type: "REQUEST",
            from: INTAKE_ID,
            to: task.staffId,
            needs: [{ kind: "task", id: task.id, label: task.title }],
            dueBy: this.clock.now() + 30 * MINUTE,
            instruction: `${task.instruction}\n\nThe human approved: ${decision}`,
            origin: "system",
          },
        });
      }
    }
    await this.#reconcileProductionHalt();
    this.#emit();
    void this.pump();
    return { ok: true, pending: this.tray.pendingCount() };
  }

  /**
   * Directives arrive from the existing chat box. STEER attaches to the trace,
   * so the whole lineage inherits it from the next checkpoint onward.
   */
  async applyDirective(input: {
    kind: DirectiveKind;
    body: string;
    traceId?: string;
  }): Promise<
    | { ok: true; appliesFrom: number; etaMinutes: number }
    | { ok: false; reason: string }
  > {
    const now = this.clock.now();
    if (input.kind === "ABORT") {
      const traceId = input.traceId;
      if (!traceId) return { ok: false, reason: "ABORT needs a trace" };
      for (const task of this.tasks.list()) {
        if (task.traceId !== traceId) continue;
        this.#aborts.get(task.id)?.abort();
        if (task.state === "running" || task.state === "queued") {
          // Partial output is preserved rather than discarded.
          this.tasks.saveCheckpoint(task.id, {
            at: now,
            iterations: task.checkpoint?.iterations ?? 0,
            partialText: task.result ?? task.checkpoint?.partialText ?? "",
            reason: "abort",
          });
          this.tasks.setState(task.id, "aborted");
        }
      }
      this.queue.killTrace(traceId);
      this.traces.setState(traceId, "aborted");
      this.directives.add({
        id: `dir-${randomUUID()}`,
        kind: "ABORT",
        traceId,
        body: input.body,
        appliesFrom: now,
      });
      await appendOfficeEvent({
        clock: this.clock,
        event: "directive.applied",
        summary: `ABORT on ${traceId}: ${input.body}`,
        traceId,
        detail: { kind: "ABORT" },
      });
      this.#emit();
      return { ok: true, appliesFrom: now, etaMinutes: 0 };
    }

    const appliesFrom = now + CHECKPOINT_INTERVAL_MS;
    this.directives.add({
      id: `dir-${randomUUID()}`,
      kind: input.kind,
      ...(input.traceId ? { traceId: input.traceId } : {}),
      body: input.body,
      appliesFrom: input.kind === "PIN" ? now : appliesFrom,
    });
    if (input.kind === "STEER" && input.traceId) {
      this.traces.setSteer(input.traceId, input.body);
    }
    await appendOfficeEvent({
      clock: this.clock,
      event: "directive.applied",
      summary: `${input.kind}: ${input.body}`,
      ...(input.traceId ? { traceId: input.traceId } : {}),
      detail: {
        kind: input.kind,
        appliesFrom: input.kind === "PIN" ? now : appliesFrom,
      },
    });
    this.#emit();
    return {
      ok: true,
      appliesFrom: input.kind === "PIN" ? now : appliesFrom,
      etaMinutes:
        input.kind === "PIN" ? 0 : Math.round(CHECKPOINT_INTERVAL_MS / MINUTE),
    };
  }

  // ---------------------------------------------------------------------- brief

  async #maybePublishBrief(): Promise<void> {
    const now = this.clock.now();
    const { hour, minute } = clockOf(now, this.policy.timezoneOffsetMinutes);
    const isBriefTime =
      hour === this.policy.briefHour && minute >= this.policy.briefMinute;
    if (!isBriefTime) return;
    if (now - this.#lastBriefAt < 12 * 60 * MINUTE) return;
    this.#lastBriefAt = now;
    await this.generateBrief();
  }

  async generateBrief(): Promise<DailyBrief> {
    const brief = await buildDailyBrief({
      db: this.db,
      tasks: this.tasks,
      tray: this.tray,
      meter: this.meter,
      floorState: this.floorState,
      policy: this.policy,
      clock: this.clock,
    });
    this.#lastBrief = brief;
    this.#lastBriefAt = brief.generatedAt;
    await appendOfficeEvent({
      clock: this.clock,
      event: "brief.published",
      summary: `DailyBrief: ${brief.shipped.length} shipped, ${brief.approvals.length} awaiting approval, ${brief.blocked.length} blocked`,
      detail: {
        shipped: brief.shipped.length,
        approvals: brief.approvals.length,
        blocked: brief.blocked.length,
        handoff: brief.handoff.summary,
      },
    });
    this.#emit();
    return brief;
  }

  lastBrief(): DailyBrief | null {
    return this.#lastBrief;
  }

  renderBrief(brief: DailyBrief): string {
    return renderDailyBrief(brief);
  }

  // ------------------------------------------------------------------- snapshot

  /**
   * The office channel. Bus messages carry the conversation and the audit log
   * carries the things nobody said out loud - an approval coming back, a gate
   * refusing a delivery. Both are merged by time, because to a reader they are
   * one thread.
   *
   * The audit log is one office-wide file, so it is read from the moment this
   * channel was opened rather than from the top. A channel created just now has
   * no history, and showing it this morning's crashes reads as a broken office
   * rather than as a fresh room.
   */
  async channel(
    channelId = DEFAULT_CHANNEL_ID,
    sinceCreatedAt = 0,
  ): Promise<ChannelPost[]> {
    const posts = this.queue
      .listSince(sinceCreatedAt, CHANNEL_LIMIT, channelId)
      .map((row) => messagePost(row));
    const openedAt = this.channels.get(channelId)?.createdAt ?? 0;
    const since = Math.max(sinceCreatedAt, openedAt);
    const events = await readAudit({
      ...(since > 0 ? { sinceEventTime: since } : {}),
      limit: CHANNEL_LIMIT,
    });
    const tracesHere = new Set(this.queue.traceIdsInChannel(channelId));
    for (const event of events) {
      const post = systemPost(event, channelId, tracesHere);
      if (post) posts.push(post);
    }
    // Ties keep the order they were added in, which for messages is the order
    // they were said. Breaking a tie by id sorted on a random UUID instead, so a
    // follow-up typed into a running turn - written in the same millisecond as
    // the answer it is about - could be shown above the line it came after.
    posts.sort((a, b) => a.createdAt - b.createdAt);
    return posts.slice(-CHANNEL_LIMIT);
  }

  async snapshot(): Promise<FloorSnapshot> {
    const now = this.clock.now();
    const state = this.floorState.load();
    const hiredById = new Map(
      this.hiredStaff.list().map((staff) => [staff.id, staff]),
    );
    const events = await readAudit({
      sinceEventTime: now - 12 * 60 * MINUTE,
      limit: 400,
    });

    // One backward pass instead of copying and reversing the window per seat.
    const lastMessageByStaff = new Map<string, AuditEntry>();
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i];
      if (!event || event.event !== "message.accepted") continue;
      const staffId = event.staffMemberId;
      if (!staffId || lastMessageByStaff.has(staffId)) continue;
      lastMessageByStaff.set(staffId, event);
    }

    const seats: SeatView[] = this.#roster.map((staff) => {
      const taskId = this.#seatTask.get(staff.id) ?? null;
      const task = taskId ? this.tasks.get(taskId) : null;
      const lastMessage = lastMessageByStaff.get(staff.id);
      return {
        staffId: staff.id,
        role: staff.role,
        layer: staff.layer,
        host: staff.host,
        state: this.#seatState.get(staff.id) ?? "idle",
        taskId,
        taskTitle: task?.title ?? null,
        traceId: task?.traceId ?? null,
        lastMessageType: lastMessage
          ? ((detailOf(lastMessage)["type"] as string | undefined) ?? null)
          : null,
        tokensToday: this.#tokensToday(staff.id),
        personality: hiredById.get(staff.id)?.personality ?? staff.scope,
        custom: Boolean(staff.custom),
        typing: this.#typing.has(staff.id),
      };
    });

    const meetings: MeetingView[] = this.meetings.list().map((meeting) => ({
      id: meeting.id,
      topic: meeting.topic,
      round: meeting.round,
      maxRounds: MEETING_MAX_ROUNDS,
      state: meeting.state,
      participants: meeting.participants,
      outcome: meeting.outcome,
    }));

    const agenda: AgendaItem[] = [
      ...this.tasks
        .list()
        .filter((task) => task.state === "queued" || task.state === "running")
        .map((task) => ({
          id: task.id,
          label: task.title,
          staffId: task.staffId,
          kind: "scheduled" as const,
        })),
      ...this.tasks.listByState("blocked").map((task) => ({
        id: task.id,
        label: `${task.title} (unresolved)`,
        staffId: task.staffId,
        kind: "carried-block" as const,
      })),
    ];

    const daySpend = this.meter.daySpend();
    const gates = gateStats(this.db, now - 24 * 60 * MINUTE);

    return {
      now,
      paused: state.paused,
      productionHalted: state.productionHalted,
      channels: this.channels.list(),
      seats,
      meetings,
      agenda,
      tray: {
        pending: this.tray.pendingCount(),
        threshold: APPROVAL_TRAY_HALT_THRESHOLD,
        overflowing: this.tray.isOverflowing(),
        items: this.tray.pending().map((item) => ({
          id: item.id,
          channelId:
            this.queue.channelIdForTrace(item.traceId) ?? DEFAULT_CHANNEL_ID,
          headline: item.headline,
          kind: item.kind,
          evidence: item.evidence.map(
            (ref) =>
              `${ref.kind}:${ref.id}${ref.locator ? `#${ref.locator}` : ""}`,
          ),
          dissent: item.dissent,
          options: item.options,
          createdAt: item.createdAt,
        })),
      },
      meter: {
        tokens: daySpend.tokens,
        budget: daySpend.budget,
        ratio: daySpend.ratio,
        lightsOut: daySpend.ratio >= 1,
      },
      wall: {
        costMicros: this.meter.costMicros(),
        gatePassRate: gates.passRate,
        reworkRate: gates.reworkRate,
      },
      queue: {
        pending: this.queue.pendingCount(),
        inFlight: this.queue.inFlightCount(),
        done: this.queue.doneCount(),
      },
      directives: this.directives.list().map((directive) => ({
        id: directive.id,
        kind: directive.kind,
        body: directive.body,
        appliesFrom: directive.appliesFrom,
      })),
      interruptions: state.interruptions,
    };
  }

  #tokensToday(staffId: string): number {
    const row = this.db
      .prepare(
        "SELECT SUM(tokens) AS tokens FROM budget_ledger WHERE staff_id = ?",
      )
      .get(staffId) as Record<string, unknown> | undefined;
    const value = row?.["tokens"];
    return typeof value === "number" ? value : 0;
  }

  /**
   * Coalesce broadcasts. A running Task fires several state changes back to
   * back, and rebuilding a full snapshot for each one is what makes the board
   * feel heavy. While one rebuild is in flight, later changes collapse into a
   * single follow-up so the renderer still ends on current state.
   */
  #emit(): void {
    if (!this.#options.onChange) return;
    if (this.#emitting) {
      this.#emitPending = true;
      return;
    }
    this.#emitting = true;
    void this.snapshot()
      .then((snapshot) => this.#options.onChange?.(snapshot))
      .catch(() => undefined)
      .finally(() => {
        this.#emitting = false;
        if (!this.#emitPending) return;
        this.#emitPending = false;
        this.#emit();
      });
  }

  /** Workflow definitions become Task templates rather than a second format. */
  addWorkflowTemplates(
    workflows: Parameters<typeof templatesFromWorkflow>[0][],
  ): number {
    let added = 0;
    for (const workflow of workflows) {
      for (const template of templatesFromWorkflow(workflow)) {
        if (findTemplate(this.templates, template.id)) continue;
        this.templates.push(template);
        added += 1;
      }
    }
    return added;
  }
}

/**
 * Anything that leaves this machine or cannot be undone needs a person. Local
 * drafting inside the StaffSpec's own folders does not.
 */
export function requiresHumanApproval(toolName: string): boolean {
  if (toolGroupOf(toolName) === "group:network") return true;
  if (APPROVAL_REQUIRED_TOOLS.has(toolName)) return true;
  return toolName === "shell.exec";
}

/** Numbers and quoted spans a reviewer must be able to find in the source. */
export function extractClaimedValues(claim: string): string[] {
  const values = new Set<string>();
  for (const match of claim.matchAll(/\$?\d+(?:[.,]\d+)*%?/g)) {
    if (match[0].length >= 2) values.add(match[0]);
  }
  for (const match of claim.matchAll(/"([^"]{2,60})"/g)) {
    if (match[1]) values.add(match[1]);
  }
  return [...values];
}

export type { FloorMessage, DailyBrief, Channel, HiredStaff };
