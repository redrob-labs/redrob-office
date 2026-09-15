import { appendOfficeEvent } from "../../audit/tool-audit.js";
import type { TimeSource } from "../time/index.js";
import type { FloorQueue } from "../queue/queue.js";
import type { TraceStore } from "../traces/index.js";
import type { MeetingRoom } from "../meetings/index.js";
import type { OfficePolicy } from "../policy.js";
import { Governor, type GovernorConfig } from "./governor.js";
import {
  HUMAN_RESERVED_IDS,
  messageSchema,
  type BusResult,
  type FloorMessage,
  type MessageType,
} from "./types.js";

export interface BusDeps {
  queue: FloorQueue;
  traces: TraceStore;
  meetings: MeetingRoom;
  policy: OfficePolicy;
  clock: TimeSource;
  governorConfig?: GovernorConfig;
  /** True while the tray is overflowing; producers are refused (I3). */
  isProductionHalted: () => boolean;
  /** Layer of a StaffMember, for the production halt check. */
  isProducer: (staffId: string) => boolean;
}

/** Omit across each union member, so discriminated fields survive. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type MessageDraft = DistributiveOmit<FloorMessage, "createdAt" | "notBefore"> & {
  createdAt?: number;
  notBefore?: number;
};

export interface PublishInput {
  message: MessageDraft;
  /** Zero delay for anything the human initiated. */
  fromHuman?: boolean;
  projectedTokens?: number;
}

/**
 * Deterministic jitter inside the paced window. Same message id, same delay:
 * a replay of the audit log lines up with what happened.
 */
function pacedDelay(id: string, minMs: number, maxMs: number): number {
  if (maxMs <= minMs) return minMs;
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return minMs + (hash % (maxMs - minMs + 1));
}

/** The prose a reader will see, which is what makes a message long or short. */
function proseLength(message: MessageDraft): number {
  switch (message.type) {
    case "REQUEST":
      return message.instruction.length;
    case "DELIVER":
      return message.claim.length;
    case "CHALLENGE":
      return message.targetClaim.length + message.alternative.length;
    case "ESCALATE":
      return message.reason.length + message.options.join("").length;
    case "BLOCK":
      return message.reason.length + message.unblockCondition.length;
    default:
      return 0;
  }
}

/**
 * The only channel on the Floor. Everything below is a refusal the caller
 * cannot argue with: the bus rejects, writes the rejection to the audit log
 * and returns a reason.
 */
export class MessageBus {
  readonly #deps: BusDeps;
  readonly #governor: Governor;

  constructor(deps: BusDeps) {
    this.#deps = deps;
    this.#governor = new Governor(deps.traces, deps.clock, deps.governorConfig);
  }

  get governor(): Governor {
    return this.#governor;
  }

  #delayFor(message: MessageDraft, fromHuman: boolean): number {
    if (fromHuman) return this.#deps.policy.pace.humanToStaffMs;
    // BLOCK, budget and security traffic is exempt: it moves immediately.
    if (Governor.isUrgent(message.type)) return 0;
    const pace = this.#deps.policy.pace;
    const gap =
      message.type === "CHALLENGE"
        ? pacedDelay(message.id, pace.challengeMinMs, pace.challengeMaxMs)
        : pacedDelay(message.id, pace.staffToStaffMinMs, pace.staffToStaffMaxMs);
    // The model answers in one burst, which reads as everyone replying at once.
    // Charging the sender for the length of what they wrote puts the turns back
    // in order: a long draft lands after the short note that asked for it.
    const compose = Math.min(
      pace.composeMaxMs,
      pace.composeMinMs + proseLength(message) * pace.composeMsPerChar,
    );
    return gap + compose;
  }

  async publish(input: PublishInput): Promise<BusResult> {
    const now = this.#deps.clock.now();
    const draft = {
      ...input.message,
      createdAt: input.message.createdAt ?? now,
      notBefore:
        input.message.notBefore ?? now + this.#delayFor(input.message, Boolean(input.fromHuman)),
    };

    const parsed = messageSchema.safeParse(draft);
    if (!parsed.success) {
      const evidenceIssue = parsed.error.issues.some((issue) =>
        issue.path.join(".").startsWith("evidenceRef"),
      );
      const reason =
        draft.type === "CHALLENGE" && evidenceIssue
          ? "CHALLENGE rejected: evidenceRef is required and must not be empty"
          : `Message rejected by schema: ${parsed.error.issues
              .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
              .join("; ")}`;
      await appendOfficeEvent({
        clock: this.#deps.clock,
        event: "message.rejected",
        summary: reason,
        traceId: String(draft.traceId ?? ""),
        messageId: String(draft.id ?? ""),
        staffId: String(draft.from ?? ""),
        detail: { type: draft.type, code: evidenceIssue ? "evidence-required" : "schema" },
      });
      return {
        ok: false,
        reason,
        code: evidenceIssue ? "evidence-required" : "schema",
      };
    }

    const message = parsed.data;

    if (HUMAN_RESERVED_IDS.has(message.to.toLowerCase())) {
      const reason =
        "StaffMembers cannot address a person directly. Route through the approval tray or the daily brief.";
      await appendOfficeEvent({
        clock: this.#deps.clock,
        event: "message.rejected",
        summary: reason,
        traceId: message.traceId,
        messageId: message.id,
        staffId: message.from,
        detail: { code: "human-direct", to: message.to },
      });
      return { ok: false, reason, code: "human-direct" };
    }

    // ABORT is immediate, so a turn that was already mid-flight when the person
    // pulled the plug must not be able to put anything new on the queue.
    const traceState = this.#deps.traces.get(message.traceId)?.state;
    if (traceState === "aborted") {
      const reason = `Trace ${message.traceId} was aborted; no further messages are accepted.`;
      await appendOfficeEvent({
        clock: this.#deps.clock,
        event: "message.rejected",
        summary: reason,
        traceId: message.traceId,
        messageId: message.id,
        staffId: message.from,
        detail: { code: "trace-aborted" },
      });
      return { ok: false, reason, code: "trace-aborted" };
    }

    if (this.#deps.isProductionHalted() && this.#deps.isProducer(message.from)) {
      const reason = `Production is halted: the approval tray is over its limit, so ${message.from} cannot send new work.`;
      await appendOfficeEvent({
        clock: this.#deps.clock,
        event: "message.rejected",
        summary: reason,
        traceId: message.traceId,
        messageId: message.id,
        staffId: message.from,
        detail: { code: "production-halted" },
      });
      return { ok: false, reason, code: "production-halted" };
    }

    if (message.meetingId && this.#deps.meetings.isLocked(message.meetingId)) {
      const reason = `Meeting ${message.meetingId} is closed; no further rounds are accepted.`;
      await appendOfficeEvent({
        clock: this.#deps.clock,
        event: "message.rejected",
        summary: reason,
        traceId: message.traceId,
        messageId: message.id,
        staffId: message.from,
        detail: { code: "meeting-rounds", meetingId: message.meetingId },
      });
      return { ok: false, reason, code: "meeting-rounds" };
    }

    const verdict = this.#governor.inspect(message, input.projectedTokens ?? 0);
    if (verdict.action === "escalate") {
      await appendOfficeEvent({
        clock: this.#deps.clock,
        event: "trace.budget.exceeded",
        summary: verdict.reason,
        traceId: message.traceId,
        messageId: message.id,
        staffId: message.from,
        detail: { kind: verdict.kind },
      });
      this.#deps.traces.setState(message.traceId, "escalated");
      return {
        ok: false,
        reason: verdict.reason,
        code: verdict.kind === "depth" ? "depth-budget" : "trace-budget",
      };
    }
    if (verdict.action === "kill") {
      const dropped = this.#deps.queue.killTrace(message.traceId);
      this.#governor.forgetTrace(message.traceId);
      this.#deps.traces.setState(message.traceId, "aborted");
      await appendOfficeEvent({
        clock: this.#deps.clock,
        event: "governor.killed",
        summary: `${verdict.reason}. Dropped ${dropped} pending messages.`,
        traceId: message.traceId,
        messageId: message.id,
        staffId: message.from,
        detail: { dropped },
      });
      return { ok: false, reason: verdict.reason, code: "cycle" };
    }
    if (verdict.action === "debounce") {
      await appendOfficeEvent({
        clock: this.#deps.clock,
        event: "governor.debounced",
        summary: `Burst from ${message.from} merged into ${verdict.intoId}`,
        traceId: message.traceId,
        messageId: message.id,
        staffId: message.from,
        detail: { intoId: verdict.intoId, size: this.#governor.burstSizeOf(verdict.intoId) },
      });
      return { ok: true, message, debouncedInto: verdict.intoId };
    }

    this.#deps.traces.recordDepth(message.traceId, message.depth);
    this.#deps.queue.enqueue(message);
    await appendOfficeEvent({
      clock: this.#deps.clock,
      event: "message.accepted",
      summary: `${message.type} ${message.from} → ${message.to}`,
      traceId: message.traceId,
      messageId: message.id,
      staffId: message.from,
      detail: {
        type: message.type,
        depth: message.depth,
        delayMs: message.notBefore - message.createdAt,
        ...(message.meetingId ? { meetingId: message.meetingId } : {}),
      },
    });
    return { ok: true, message };
  }
}

export * from "./types.js";
export { Governor, DEFAULT_GOVERNOR } from "./governor.js";
