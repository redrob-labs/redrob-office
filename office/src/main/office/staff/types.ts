/**
 * Layers are not decoration. Gates run on deliveries into `review`, a BLOCK
 * is routed to `lead`, and `production` is what stops first when the approval
 * tray overflows. Adding a layer means deciding which of those it joins.
 */
export type StaffLayer = "lead" | "research" | "review" | "editorial" | "production";

export type StaffHost = "local" | "remote";

export interface StaffBudget {
  /** Per-task token ceiling. The trace ceiling still applies on top. */
  perTaskTokens: number;
  /** Per-day token ceiling for this StaffMember. */
  perDayTokens: number;
}

/**
 * A StaffMember is a role, a tool subset and a budget. It never gets its own
 * tool implementations: `tools` is a subset reference into the existing
 * computer-use registry.
 */
export interface StaffSpec {
  id: string;
  /** Shown on the desk nameplate. Roles, not people. */
  role: string;
  layer: StaffLayer;
  host: StaffHost;
  /** Subset of registered tool names. Validated against the registry at boot. */
  tools: string[];
  /** Extra instructions folded into the Task prompt. */
  scope: string;
  budget: StaffBudget;
  /** Only these StaffMembers may be addressed directly on the bus. */
  peers: string[];
  maxIterations: number;
  /**
   * Set on a seat a person invited rather than one the office ships with.
   * Only these can be edited or dismissed from the UI.
   */
  custom?: boolean;
}

export type StaffState = "idle" | "working" | "blocked" | "waiting-approval" | "parked";

export interface SeatView {
  staffId: string;
  role: string;
  layer: StaffLayer;
  host: StaffHost;
  state: StaffState;
  taskId: string | null;
  taskTitle: string | null;
  /**
   * The work this seat is on, so it can be stopped from where it is shown.
   * Aborting used to mean typing `/abort trace-abc123`, which needs an id
   * nothing in the UI ever tells you.
   */
  traceId: string | null;
  lastMessageType: string | null;
  tokensToday: number;
  /** The instructions this seat works to. Shown when editing a hired seat. */
  personality: string;
  /** True for a seat a person hired, so the UI knows what it may change. */
  custom: boolean;
  /** True while a model call for this seat is actually in flight. */
  typing: boolean;
}
