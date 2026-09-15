import { z } from "zod";

/**
 * The Floor has exactly five message types. Free-text chatter between
 * StaffMembers is not representable here, which is the point: the bus is the
 * only channel and it only carries typed intent.
 */
export const MESSAGE_TYPES = [
  "REQUEST",
  "DELIVER",
  "CHALLENGE",
  "ESCALATE",
  "BLOCK",
] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];

export const artifactRefSchema = z.object({
  kind: z.enum(["artifact", "file", "log", "url", "task", "message"]),
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  /** Content hash when the reference must be verifiable (ReproVerifier). */
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  /**
   * Library id, filled in by the Floor once a delivered file has been filed.
   * StaffMembers never set this: they point at a path, the Floor files it.
   */
  artifactId: z.string().min(1).optional(),
});

export type ArtifactRef = z.infer<typeof artifactRefSchema>;

export const evidenceRefSchema = artifactRefSchema.extend({
  /** Byte or line span inside the referenced artifact. */
  locator: z.string().min(1).optional(),
});

export type EvidenceRef = z.infer<typeof evidenceRefSchema>;

const envelopeSchema = z.object({
  id: z.string().min(1),
  traceId: z.string().min(1),
  depth: z.number().int().min(0),
  from: z.string().min(1),
  /** StaffMember id, or the reserved room/tray sinks. */
  to: z.string().min(1),
  /** Which channel this was said in. Every message belongs to exactly one. */
  channelId: z.string().min(1),
  createdAt: z.number().int(),
  /** Earliest domain time the queue may deliver this. Pacing lives here. */
  notBefore: z.number().int(),
  /** Meeting room id when the message belongs to a discussion. */
  meetingId: z.string().min(1).optional(),
  /**
   * Who put this on the bus. Intake carries both the goal a person typed and
   * the notes the Floor writes to itself, and the channel has to tell them
   * apart. Absent means staff.
   */
  origin: z.enum(["human", "staff", "system"]).optional(),
});

export const requestSchema = envelopeSchema.extend({
  type: z.literal("REQUEST"),
  needs: z.array(artifactRefSchema).min(1),
  dueBy: z.number().int(),
  instruction: z.string().min(1),
  /**
   * What a person actually typed, when this REQUEST carries a human goal.
   *
   * `instruction` is the model's prompt: it wraps the goal in the intake
   * template's standing orders. Rendering that in the sender's own bubble
   * shows them boilerplate they never wrote, so the channel reads this field
   * instead and the model keeps reading `instruction`.
   */
  saidAs: z.string().min(1).optional(),
});

export const deliverSchema = envelopeSchema.extend({
  type: z.literal("DELIVER"),
  artifactRef: artifactRefSchema,
  claim: z.string().min(1),
});

export const challengeSchema = envelopeSchema.extend({
  type: z.literal("CHALLENGE"),
  targetClaim: z.string().min(1),
  /** I5: a CHALLENGE without evidence is refused by the bus. */
  evidenceRef: z.array(evidenceRefSchema).min(1),
  alternative: z.string().min(1),
});

export const escalateSchema = envelopeSchema.extend({
  type: z.literal("ESCALATE"),
  reason: z.string().min(1),
  /** At least two options, so the human is choosing rather than rubber-stamping. */
  options: z.array(z.string().min(1)).min(2),
  evidenceRef: z.array(evidenceRefSchema).default([]),
});

export const blockSchema = envelopeSchema.extend({
  type: z.literal("BLOCK"),
  reason: z.string().min(1),
  unblockCondition: z.string().min(1),
});

export const messageSchema = z.discriminatedUnion("type", [
  requestSchema,
  deliverSchema,
  challengeSchema,
  escalateSchema,
  blockSchema,
]);

export type FloorMessage = z.infer<typeof messageSchema>;
export type RequestMessage = z.infer<typeof requestSchema>;
export type DeliverMessage = z.infer<typeof deliverSchema>;
export type ChallengeMessage = z.infer<typeof challengeSchema>;
export type EscalateMessage = z.infer<typeof escalateSchema>;
export type BlockMessage = z.infer<typeof blockSchema>;

/** Reserved sinks. StaffMembers may not address a human directly (I7). */
export const SINK_APPROVAL_TRAY = "approval-tray";

/** The `from` on anything the intake desk publishes, human goal or not. */
export const INTAKE_ID = "floor-intake";

export const HUMAN_RESERVED_IDS: ReadonlySet<string> = new Set([
  "human",
  "user",
  "owner",
  "operator",
]);

export interface BusRejection {
  ok: false;
  reason: string;
  code:
    | "schema"
    | "evidence-required"
    | "human-direct"
    | "trace-budget"
    | "depth-budget"
    | "cycle"
    | "meeting-rounds"
    | "production-halted"
    | "trace-aborted";
}

export interface BusAcceptance {
  ok: true;
  message: FloorMessage;
  /** Set when the governor merged this into an earlier burst. */
  debouncedInto?: string;
}

export type BusResult = BusAcceptance | BusRejection;
