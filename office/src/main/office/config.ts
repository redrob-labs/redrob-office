import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultArtifactsDir } from "@redrob/kernel";
import {
  defaultExecAllowlist,
  profileFromPreset,
  setElevatedEnabled,
  type StaffProfilePreset,
  type ExecAskMode,
  type ExecSecurityMode,
  type GlobalPolicy,
  type SandboxMode,
  type SecurityPolicyBundle,
} from "../security/index.js";
import { assertAllowedPathEntry } from "../tools/path-policy.js";

export interface ComputerUseConfig {
  allowedPaths: string[];
  /**
   * Tracks product default migrations (e.g. allowlist → full shell).
   * Missing or older than current POLICY_REVISION gets upgraded on load.
   */
  policyRevision?: number;
  /** Default: full (CLI-agent GUI). Narrower presets remain available in Settings. */
  profile: StaffProfilePreset;
  execSecurity: ExecSecurityMode;
  execAsk: ExecAskMode;
  execAllowlist: string[];
  sandboxMode: SandboxMode;
  elevatedEnabled: boolean;
  /** Summarize untrusted reads in a tool-less reader session. */
  readerPass: boolean;
  /**
   * Whether the agent may drive this machine: the pointer, the keyboard and
   * the screen. Off until someone turns it on, because it is the one
   * capability that reaches outside the app's own window.
   */
  desktopControl: boolean;
  /**
   * Keep the agent out of the foreground while somebody else is using the
   * machine. Windows the agent opens come up without taking focus either way;
   * this also refuses the tools that yank the pointer and the active window,
   * so a run works the page through `browser.*` and `screen.capture` instead
   * of typing into whatever happens to be in front.
   *
   * Off by default because a native (non-web) app can only be driven from the
   * foreground: turning this on trades that away for not being interrupted.
   */
  backgroundControl: boolean;
  /**
   * Where `browser.open` sends a page by default.
   *
   * `app` is the agent's own window, which it can read and drive element by
   * element. `system` hands the URL to the browser the person already has
   * open, which is what they want when they asked to *see* something — the
   * agent cannot read that page, so it says so rather than pretending.
   */
  browserTarget: BrowserTarget;
}

export type BrowserTarget = "app" | "system";

let configPath: string | null = null;
let defaultWorkspace: string | null = null;
let cached: ComputerUseConfig | null = null;

/** Bumped when default shell posture changes; migrates older computer-use.json. */
const POLICY_REVISION = 2;

const DEFAULTS: Omit<ComputerUseConfig, "allowedPaths"> = {
  // Redrob is a GUI for CLI agents (Claude Code / Cowork style): shell is on by
  // default, any binary is allowed, and exec does not sit behind an allowlist.
  profile: "full",
  execSecurity: "full",
  execAsk: "off",
  execAllowlist: defaultExecAllowlist(),
  sandboxMode: "workspace",
  elevatedEnabled: false,
  readerPass: false,
  desktopControl: false,
  backgroundControl: false,
  browserTarget: "system",
};

/**
 * The folder a task may work in by default is the one the documents live in:
 * the redrob folder, beside the models. It used to be a workspace of its own
 * under the app's settings directory, which on Linux is `~/.config` — a place
 * the file tools refuse to touch, so the default workspace was one no tool
 * could write to.
 */
export function configureComputerUse(userDataPath: string): string {
  defaultWorkspace = defaultArtifactsDir();
  configPath = join(userDataPath, "computer-use.json");
  cached = null;
  return defaultWorkspace;
}

async function ensureDefaultWorkspace(): Promise<string> {
  if (!defaultWorkspace) throw new Error("Computer use is not configured");
  await mkdir(defaultWorkspace, { recursive: true });
  return defaultWorkspace;
}

function normalizeConfig(
  parsed: Partial<ComputerUseConfig>,
  workspace: string,
): ComputerUseConfig {
  const paths = Array.isArray(parsed.allowedPaths)
    ? parsed.allowedPaths.filter((p) => typeof p === "string" && p.trim())
    : [];
  const needsShellMigration =
    typeof parsed.policyRevision !== "number" ||
    parsed.policyRevision < POLICY_REVISION;

  let profile: StaffProfilePreset =
    parsed.profile === "full" ||
    parsed.profile === "author" ||
    parsed.profile === "minimal" ||
    parsed.profile === "readonly"
      ? parsed.profile
      : DEFAULTS.profile;
  let execSecurity: ExecSecurityMode =
    parsed.execSecurity === "deny" ||
    parsed.execSecurity === "allowlist" ||
    parsed.execSecurity === "full"
      ? parsed.execSecurity
      : DEFAULTS.execSecurity;
  let execAsk: ExecAskMode =
    parsed.execAsk === "always" || parsed.execAsk === "once" || parsed.execAsk === "off"
      ? parsed.execAsk
      : DEFAULTS.execAsk;

  // v2: drop the old default allowlist posture so existing installs can run any
  // shell binary (ipconfig, curl, etc.) like Claude Code / Cowork. After this
  // revision sticks, an explicit Settings choice of allowlist/deny is kept.
  if (needsShellMigration) {
    if (execSecurity === "allowlist") execSecurity = "full";
    if (execAsk === "always") execAsk = "off";
    if (profile === "author") profile = "full";
  }

  const sandboxMode: SandboxMode =
    parsed.sandboxMode === "off" ||
    parsed.sandboxMode === "workspace" ||
    parsed.sandboxMode === "strict"
      ? parsed.sandboxMode
      : "workspace";

  // full is the only profile that may set sandbox off; otherwise force workspace.
  const safeSandbox =
    profile === "full" ? sandboxMode : sandboxMode === "off" ? "workspace" : sandboxMode;

  return {
    allowedPaths: paths.length > 0 ? paths : [workspace],
    policyRevision: POLICY_REVISION,
    profile,
    execSecurity,
    execAsk,
    execAllowlist:
      Array.isArray(parsed.execAllowlist) && parsed.execAllowlist.length > 0
        ? parsed.execAllowlist.filter((x) => typeof x === "string" && x.trim())
        : defaultExecAllowlist(),
    sandboxMode: safeSandbox,
    elevatedEnabled: Boolean(parsed.elevatedEnabled),
    readerPass: Boolean(parsed.readerPass),
    // Only ever true because someone wrote it, never because a field was
    // missing: this is the switch that hands over the pointer.
    desktopControl: parsed.desktopControl === true,
    backgroundControl: parsed.backgroundControl === true,
    browserTarget: parsed.browserTarget === "app" ? "app" : "system",
  };
}

async function readConfig(): Promise<ComputerUseConfig> {
  if (cached) return cached;
  const workspace = await ensureDefaultWorkspace();
  if (!configPath) {
    cached = normalizeConfig({}, workspace);
    setElevatedEnabled(cached.elevatedEnabled);
    return cached;
  }
  let parsed: Partial<ComputerUseConfig> = {};
  let hadFile = false;
  try {
    const raw = await readFile(configPath, "utf8");
    parsed = JSON.parse(raw) as Partial<ComputerUseConfig>;
    hadFile = true;
  } catch {
    parsed = {};
  }
  cached = normalizeConfig(parsed, workspace);
  setElevatedEnabled(cached.elevatedEnabled);
  const staleRevision =
    typeof parsed.policyRevision !== "number" ||
    parsed.policyRevision < POLICY_REVISION;
  if (hadFile && staleRevision) {
    await writeConfig(cached);
  }
  return cached;
}

async function writeConfig(config: ComputerUseConfig): Promise<void> {
  if (!configPath) throw new Error("Computer use is not configured");
  cached = config;
  setElevatedEnabled(config.elevatedEnabled);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function getComputerUseConfig(): Promise<ComputerUseConfig> {
  return readConfig();
}

export async function updateComputerUseConfig(
  patch: Partial<ComputerUseConfig>,
): Promise<ComputerUseConfig> {
  const workspace = await ensureDefaultWorkspace();
  const current = await readConfig();
  const next = normalizeConfig({ ...current, ...patch }, workspace);
  // Explicit full switch only — ignore accidental sandbox off on readonly.
  if (patch.profile === "full") {
    next.profile = "full";
  } else if (
    patch.profile === "author" ||
    patch.profile === "readonly" ||
    patch.profile === "minimal"
  ) {
    next.profile = patch.profile;
  }
  await writeConfig(next);
  return next;
}

export async function getAllowedPaths(): Promise<string[]> {
  return (await readConfig()).allowedPaths;
}

export async function addAllowedPath(path: string): Promise<string[]> {
  const absolute = assertAllowedPathEntry(path);
  await mkdir(absolute, { recursive: true });
  const config = await readConfig();
  if (!config.allowedPaths.includes(absolute)) {
    config.allowedPaths.push(absolute);
    await writeConfig(config);
  }
  return config.allowedPaths;
}

export async function removeAllowedPath(path: string): Promise<string[]> {
  const absolute = assertAllowedPathEntry(path);
  const config = await readConfig();
  const workspace = await ensureDefaultWorkspace();
  config.allowedPaths = config.allowedPaths.filter((p) => p !== absolute);
  if (config.allowedPaths.length === 0) {
    config.allowedPaths = [workspace];
  }
  await writeConfig(config);
  return config.allowedPaths;
}

export async function getDefaultWorkspacePath(): Promise<string> {
  return ensureDefaultWorkspace();
}

export async function buildSecurityBundle(): Promise<SecurityPolicyBundle> {
  const config = await readConfig();
  const profile = profileFromPreset(config.profile);
  const global: GlobalPolicy = {
    deniedGroups: [],
    deniedTools: [],
    execSecurity: config.execSecurity,
    execAsk: config.execAsk,
    execAllowlist: config.execAllowlist,
    elevatedEnabled: config.elevatedEnabled,
  };
  return {
    global,
    profile,
    sandbox: {
      mode: config.sandboxMode,
      workspaceRoots: config.allowedPaths,
      readonly: !profile.writeAllowed,
    },
  };
}
