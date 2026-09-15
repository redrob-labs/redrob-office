import { basename } from "node:path";
import type { CanonicalExecPlan, ExecAskMode, ExecSecurityMode } from "./types.js";

const INTERPRETERS = new Set([
  "python",
  "python3",
  "python2",
  "node",
  "nodejs",
  "ruby",
  "rb",
  "sh",
  "bash",
  "zsh",
  "dash",
  "osascript",
  "powershell",
  "pwsh",
  "cmd",
]);

/** Inline eval / script flags that must always get individual approval. */
const EVAL_FLAGS = new Set([
  "-c",
  "-e",
  "-E",
  "--eval",
  "-Command",
  "-EncodedCommand",
  "/c",
  "/C",
]);

const DEFAULT_ALLOWLIST = [
  "git",
  "rg",
  "npm",
  "pnpm",
  "node",
  "python",
  "python3",
  // Read-only diagnostics the person often asks for directly.
  "ipconfig",
  "ifconfig",
  "ip",
  "ping",
  "hostname",
  "whoami",
  "systeminfo",
  "netstat",
  "tracert",
  "traceroute",
  "arp",
  "route",
  "nslookup",
  "dir",
  "ls",
  "pwd",
  "echo",
  "cat",
  "type",
  "where",
  "which",
];

export function defaultExecAllowlist(): string[] {
  return [...DEFAULT_ALLOWLIST];
}

function exeBase(command: string): string {
  const base = basename(command).toLowerCase();
  return base.replace(/\.exe$/i, "").replace(/\.cmd$/i, "").replace(/\.bat$/i, "");
}

export function isInterpreter(command: string): boolean {
  return INTERPRETERS.has(exeBase(command));
}

/** True when argv includes inline-eval flags or a heredoc marker. */
export function hasInlineEvalOrHeredoc(args: string[]): boolean {
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] ?? "";
    if (EVAL_FLAGS.has(a)) return true;
    // node -e / python -c style with glued form: -c"code"
    if (/^-[ceE]/.test(a) && a.length > 2) return true;
    if (/^--eval=/.test(a)) return true;
    // heredoc markers in any arg
    if (/<<[-~]?['"]?\w+['"]?/.test(a) || a === "<<" || a.startsWith("<<")) return true;
  }
  return false;
}

export function buildCanonicalExecPlan(input: {
  command: string;
  args?: string[];
  cwd: string;
  env?: Record<string, string>;
}): CanonicalExecPlan {
  const argv = [input.command, ...(input.args ?? [])];
  const envKeys = Object.keys(input.env ?? {}).sort();
  return {
    command: argv,
    cwd: input.cwd,
    envKeys,
  };
}

export function canonicalPlansEqual(a: CanonicalExecPlan, b: CanonicalExecPlan): boolean {
  if (a.cwd !== b.cwd) return false;
  if (a.command.length !== b.command.length) return false;
  for (let i = 0; i < a.command.length; i += 1) {
    if (a.command[i] !== b.command[i]) return false;
  }
  if (a.envKeys.length !== b.envKeys.length) return false;
  for (let i = 0; i < a.envKeys.length; i += 1) {
    if (a.envKeys[i] !== b.envKeys[i]) return false;
  }
  return true;
}

export interface ExecGateResult {
  allowed: boolean;
  reason?: string;
  /** Always prompt (interpreter eval / heredoc), ignore session allow. */
  forceAsk: boolean;
  /** Prompt according to ask mode. */
  requiresAsk: boolean;
  plan: CanonicalExecPlan;
}

/**
 * Gate shell.exec against security + ask modes.
 * security='allowlist' | 'full' | 'deny'; ask='always' | 'once' | 'off'.
 */
export function gateShellExec(input: {
  command: string;
  args?: string[];
  cwd: string;
  env?: Record<string, string>;
  security: ExecSecurityMode;
  ask: ExecAskMode;
  allowlist: string[];
}): ExecGateResult {
  const plan = buildCanonicalExecPlan(input);
  const base = exeBase(input.command);
  const inline = hasInlineEvalOrHeredoc(input.args ?? []);
  const interpreter = isInterpreter(input.command);

  if (input.security === "deny") {
    return {
      allowed: false,
      reason: "Exec security mode is deny",
      forceAsk: false,
      requiresAsk: false,
      plan,
    };
  }

  if (input.security === "allowlist") {
    const allowed =
      input.allowlist.map((x) => x.toLowerCase()).includes(base) ||
      input.allowlist.some((x) => exeBase(x) === base);
    if (!allowed) {
      return {
        allowed: false,
        reason: `Executable "${base}" is not on the exec allowlist`,
        forceAsk: false,
        requiresAsk: false,
        plan,
      };
    }
  }

  // Interpreters with inline eval / heredoc: always individual approval.
  if (interpreter && inline) {
    return {
      allowed: true,
      forceAsk: true,
      requiresAsk: true,
      plan,
      reason: "Interpreter inline eval / heredoc requires individual approval",
    };
  }

  const requiresAsk = input.ask === "always" || input.ask === "once";
  return {
    allowed: true,
    forceAsk: false,
    requiresAsk,
    plan,
  };
}

/** In-memory approved plans for ask='once' (process lifetime). */
const approvedPlans = new Map<string, CanonicalExecPlan>();

export function planKey(plan: CanonicalExecPlan): string {
  return JSON.stringify(plan);
}

export function rememberApprovedPlan(plan: CanonicalExecPlan): void {
  approvedPlans.set(planKey(plan), plan);
}

export function wasPlanApproved(plan: CanonicalExecPlan): boolean {
  const prev = approvedPlans.get(planKey(plan));
  return Boolean(prev && canonicalPlansEqual(prev, plan));
}

/** Pending approvals: callId → plan captured at approval time. */
const pendingPlans = new Map<string, CanonicalExecPlan>();

export function stashApprovalPlan(callId: string, plan: CanonicalExecPlan): void {
  pendingPlans.set(callId, plan);
}

export function takeApprovalPlan(callId: string): CanonicalExecPlan | undefined {
  const plan = pendingPlans.get(callId);
  pendingPlans.delete(callId);
  return plan;
}

export function assertPlanMatchesApproval(
  approved: CanonicalExecPlan,
  current: CanonicalExecPlan,
): void {
  if (!canonicalPlansEqual(approved, current)) {
    throw new Error(
      "Exec rejected: command/cwd/env changed after approval (canonical plan mismatch)",
    );
  }
}
