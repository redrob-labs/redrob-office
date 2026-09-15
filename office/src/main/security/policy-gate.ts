import { DOC_WRITE_TOOLS, toolGroupOf } from "./tool-groups.js";
import type { PolicyDecision, PolicyScope, SecurityPolicyBundle } from "./types.js";

const WRITE_TOOLS = new Set([
  "fs.write",
  "apply_patch",
  "fs.patch.undo",
  ...DOC_WRITE_TOOLS,
]);
const EXEC_TOOLS = new Set(["shell.exec"]);
const EDIT_TOOLS = new Set([
  "apply_patch",
  "fs.patch.undo",
  "fs.write",
  ...DOC_WRITE_TOOLS,
]);

/**
 * Evaluate global → staff profile → sandbox. All three must allow.
 *
 * `scope` carries the instant the call is being judged at. Passing it
 * explicitly means a caller cannot accidentally be judged against a different
 * moment than the one it is running in.
 */
export function evaluateToolPolicy(
  toolName: string,
  bundle: SecurityPolicyBundle,
  _args?: Record<string, unknown>,
  _scope?: PolicyScope,
): PolicyDecision {
  const group = toolGroupOf(toolName);
  const { global, profile, sandbox } = bundle;

  if (global.deniedGroups.includes(group)) {
    return {
      allowed: false,
      reason: `Denied by global policy (group ${group})`,
      layer: "global",
      requiresApproval: false,
      forceAsk: false,
    };
  }
  if (global.deniedTools.includes(toolName)) {
    return {
      allowed: false,
      reason: `Denied by global policy (tool ${toolName})`,
      layer: "global",
      requiresApproval: false,
      forceAsk: false,
    };
  }

  if (!profile.allowedGroups.includes(group)) {
    return {
      allowed: false,
      reason: `Denied by staff profile "${profile.preset}" (group ${group})`,
      layer: "profile",
      requiresApproval: false,
      forceAsk: false,
    };
  }
  if (profile.deniedTools.includes(toolName)) {
    return {
      allowed: false,
      reason: `Denied by staff profile "${profile.preset}" (tool ${toolName})`,
      layer: "profile",
      requiresApproval: false,
      forceAsk: false,
    };
  }
  if (WRITE_TOOLS.has(toolName) && !profile.writeAllowed) {
    return {
      allowed: false,
      reason: `Profile "${profile.preset}" denies writes`,
      layer: "profile",
      requiresApproval: false,
      forceAsk: false,
    };
  }
  if (EDIT_TOOLS.has(toolName) && !profile.editAllowed) {
    return {
      allowed: false,
      reason: `Profile "${profile.preset}" denies edits`,
      layer: "profile",
      requiresApproval: false,
      forceAsk: false,
    };
  }
  if (EXEC_TOOLS.has(toolName) && !profile.execAllowed) {
    return {
      allowed: false,
      reason: `Profile "${profile.preset}" denies exec`,
      layer: "profile",
      requiresApproval: false,
      forceAsk: false,
    };
  }

  if (sandbox.mode === "off" && profile.preset !== "full") {
    return {
      allowed: false,
      reason: "Sandbox mode off is only valid with profile full",
      layer: "sandbox",
      requiresApproval: false,
      forceAsk: false,
    };
  }
  if (sandbox.readonly && (WRITE_TOOLS.has(toolName) || EDIT_TOOLS.has(toolName))) {
    return {
      allowed: false,
      reason: "Sandbox is readonly",
      layer: "sandbox",
      requiresApproval: false,
      forceAsk: false,
    };
  }
  if (sandbox.mode !== "off" && EXEC_TOOLS.has(toolName) && sandbox.readonly) {
    return {
      allowed: false,
      reason: "Sandbox readonly denies exec",
      layer: "sandbox",
      requiresApproval: false,
      forceAsk: false,
    };
  }

  const requiresApproval =
    WRITE_TOOLS.has(toolName) ||
    EXEC_TOOLS.has(toolName) ||
    // Anything that leaves the machine, or drives the desktop, is an approval.
    group === "group:network" ||
    group === "group:ui" ||
    toolName.startsWith("input.") ||
    toolName.startsWith("app.");
  // Browser click/type act inside the agent's own web view (not the desktop),
  // so they run without a prompt — only genuinely risky tools ask.

  return {
    allowed: true,
    requiresApproval,
    forceAsk: false,
  };
}
