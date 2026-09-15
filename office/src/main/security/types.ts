/** Shared security / permission types for computer-use tools. */

export type ToolGroup =
  | "group:fs"
  | "group:runtime"
  | "group:ui"
  | "group:automation"
  | "group:doc"
  /**
   * Reading public pages. Separate from `group:network`, which is for putting
   * data somewhere and always needs a person: a search sends a query and gets
   * text back, so approving each one would mean a card before every fact.
   */
  | "group:web"
  | "group:network";

/**
 * `author` is the one a working office needs: a seat that cannot write has no
 * deliverable to hand over, and under `readonly` every file tool is refused
 * outright rather than queued for approval, so the whole floor produces nothing.
 */
export type StaffProfilePreset = "full" | "author" | "readonly" | "minimal";

export type ExecSecurityMode = "deny" | "allowlist" | "full";
export type ExecAskMode = "always" | "once" | "off";

export type SandboxMode = "off" | "workspace" | "strict";

export interface GlobalPolicy {
  /** Groups denied for every task. */
  deniedGroups: ToolGroup[];
  /** Tool names denied for every task. */
  deniedTools: string[];
  /** Default exec gate. */
  execSecurity: ExecSecurityMode;
  execAsk: ExecAskMode;
  /** Basename allowlist when execSecurity === "allowlist". */
  execAllowlist: string[];
  /** Whether elevated entrypoint may be used (still requires per-call approval). */
  elevatedEnabled: boolean;
}

export interface StaffProfile {
  preset: StaffProfilePreset;
  allowedGroups: ToolGroup[];
  deniedTools: string[];
  writeAllowed: boolean;
  editAllowed: boolean;
  execAllowed: boolean;
}

export interface SandboxPolicy {
  mode: SandboxMode;
  /** Effective workspace roots (usually allowlisted folders). */
  workspaceRoots: string[];
  readonly: boolean;
}

export interface SecurityPolicyBundle {
  global: GlobalPolicy;
  profile: StaffProfile;
  sandbox: SandboxPolicy;
}

/**
 * The time axis, passed explicitly to every policy evaluation.
 *
 * `at` is the domain instant the call is judged at, read from the caller's
 * TimeSource. Passing it rather than reading a clock inside the gate means a
 * call cannot be judged against a different moment than the one it ran in.
 */
export interface PolicyScope {
  at: number;
}

export interface CanonicalExecPlan {
  command: string[];
  cwd: string;
  envKeys: string[];
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
  /** Layer that rejected: global | profile | sandbox */
  layer?: "global" | "profile" | "sandbox";
  requiresApproval: boolean;
  /** Force per-call approval even if session-allow would skip (interpreter eval etc.). */
  forceAsk: boolean;
}
