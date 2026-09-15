/**
 * Redrob Code, the only agent engine in Redrob Office.
 *
 * Office runs its engine as a loopback HTTP sidecar: spawn it, poll for
 * readiness, then drive one turn per HTTP call. This class is that lifecycle
 * against Redrob Code: `ensureStarted(...)` then `runTurn(...)`. There is no
 * engine-selection flag and no fallback loop; a missing sidecar fails visibly.
 *
 * Office's tools reach the engine through an in-process MCP bridge. The engine
 * refuses HTTP tool registration into its own process, but it accepts a remote
 * MCP server at runtime per project directory, and the V1 session API merges
 * those tools into the model's tool list. So the engine drives V1 `/session` and
 * a `startMcpBridge` server, registered with `POST /mcp`, carries Office's fs /
 * app / doc / sheet / slide / screen tools, its policy gate, and its approval
 * flow. The bridge holds no policy of its own: the caller supplies `listTools`
 * and `callTool`, which run through Office's registry exactly as before.
 *
 * Model routing lines up: the engine only routes through the Redrob Console
 * provider, and Office is already fixed to `https://console.redrob.ai/api/backend/v1`
 * with a single Console key, so the same key drives both.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { nowMs } from "../app-time.js";
import {
  BRIDGE_SERVER_NAME,
  startMcpBridge,
  type BridgeTool,
  type BridgeToolResult,
  type McpBridgeHandle,
} from "./mcp-bridge.js";
import { DEFAULT_MODEL, runRedrobCodeTurn, type RunTurnResult } from "./session.js";
import {
  getMcpServers,
  hasConfiguredRedrobCode,
  registerMcpServer,
  resolveRedrobCodeCommand,
  startRedrobCode,
  type RedrobCodeHandle,
} from "./sidecar.js";

/**
 * True when a Redrob Code sidecar is locatable (bundled binary via
 * `REDROB_CODE_BIN` or a source checkout via `REDROB_CODE_DEV_ROOT`). The engine
 * is the only runtime, so this is the availability the app gates onboarding on;
 * when it is false, a turn fails loudly with an install/connect message rather
 * than falling back to anything.
 */
export function redrobCodeEngineAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return hasConfiguredRedrobCode(env);
}

export interface RedrobCodeStartInput {
  /** Redrob-owned dir for the engine's config, state, and project workspace. */
  userData: string;
  apiKey: string;
  /** The Office tools to expose to the engine through the MCP bridge. */
  bridge: {
    listTools: () => BridgeTool[];
    callTool: (name: string, args: Record<string, unknown>) => Promise<BridgeToolResult>;
  };
  log?: (line: string) => void;
}

export interface RedrobCodeTurnInput {
  chatId: string;
  message: string;
  system?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onTextChunk?: (chunk: string) => void;
  onToolEvent?: (event: {
    phase: "started" | "finished";
    name: string;
    ok?: boolean;
    args?: Record<string, unknown>;
  }) => void;
}

export interface RedrobCodeTurnResult {
  text: string;
  /** Tools that ran, counted from the engine's bus tool parts. */
  toolsRan: number;
  stopReason?: string;
  error: RunTurnResult["error"];
}

/**
 * One engine per Office process, one session per chat, so the engine keeps the
 * conversation instead of Office replaying it.
 */
export class RedrobCodeEngine {
  private handle: RedrobCodeHandle | null = null;
  private bridge: McpBridgeHandle | null = null;
  private starting: Promise<void> | null = null;
  private workspace = "";
  private readonly sessions = new Map<string, string>();

  async ensureStarted(input: RedrobCodeStartInput): Promise<void> {
    if (this.handle !== null) return;
    if (this.starting !== null) {
      await this.starting;
      return;
    }
    this.starting = this.start(input);
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async start(input: RedrobCodeStartInput): Promise<void> {
    // The engine opens a project directory; give it a stable one under Office's
    // own userData rather than letting it adopt the app's cwd.
    this.workspace = join(input.userData, "redrob-code", "workspace");
    mkdirSync(this.workspace, { recursive: true });
    mkdirSync(join(input.userData, "redrob-code", "config"), { recursive: true });

    const command = resolveRedrobCodeCommand();
    const handle = await startRedrobCode({
      userData: input.userData,
      apiKey: input.apiKey,
      command,
      ...(input.log ? { log: input.log } : {}),
    });

    // Bring up the tool bridge, register it, and confirm it connected before a
    // turn depends on its tools. A bridge that never connects means the engine
    // would run with built-ins only, so a failure to connect is fatal here.
    const bridge = await startMcpBridge({
      listTools: input.bridge.listTools,
      callTool: input.bridge.callTool,
    });
    try {
      await registerMcpServer({
        baseUrl: handle.baseUrl,
        directory: this.workspace,
        name: BRIDGE_SERVER_NAME,
        url: bridge.url,
      });
      await this.confirmBridgeConnected(handle.baseUrl);
      // The engine caches the server's tool defs from a `tools/list` at connect
      // and only merges them into a turn afterward. Wait for that list to have
      // been served, so the first prompt already carries the Office tools rather
      // than the engine's built-ins alone.
      const listed = await bridge.waitForToolsListed(20_000);
      if (!listed) {
        throw new Error(
          "Redrob Code connected the Office tool bridge but never requested its tool list.",
        );
      }
    } catch (error) {
      await bridge.stop().catch(() => undefined);
      await handle.stop().catch(() => undefined);
      throw error;
    }

    this.handle = handle;
    this.bridge = bridge;
    input.log?.(
      `[redrob-code] engine ready at ${handle.baseUrl} (version ${handle.version}, resolved via ${command.source}); ` +
        `Office tools bridged as ${BRIDGE_SERVER_NAME}_* at ${bridge.url}`,
    );
  }

  /**
   * Poll the engine's MCP state until the bridge reports connected (or failed).
   * Connection status flips before the tool defs are cached, so the caller also
   * waits on the bridge's own `tools/list` signal before the first turn.
   */
  private async confirmBridgeConnected(baseUrl: string): Promise<void> {
    const deadline = nowMs() + 20_000;
    let last = "unknown";
    while (nowMs() < deadline) {
      const servers = await getMcpServers({ baseUrl, directory: this.workspace }).catch(
        () => ({}) as Record<string, { status?: string }>,
      );
      last = servers[BRIDGE_SERVER_NAME]?.status ?? "unknown";
      if (last === "connected") return;
      if (last === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(
      `Redrob Code did not connect the Office tool bridge (status: ${last}). ` +
        `Without it the engine would run with its own tools only.`,
    );
  }

  async runTurn(input: RedrobCodeTurnInput): Promise<RedrobCodeTurnResult> {
    const handle = this.handle;
    if (handle === null) throw new Error("RedrobCodeEngine.runTurn before ensureStarted");

    const result = await runRedrobCodeTurn({
      baseUrl: handle.baseUrl,
      directory: this.workspace,
      prompt: input.message,
      ...(input.system ? { system: input.system } : {}),
      ...(this.sessions.get(input.chatId) === undefined
        ? {}
        : { sessionID: this.sessions.get(input.chatId) as string }),
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
      ...(input.onTextChunk ? { onTextChunk: input.onTextChunk } : {}),
      ...(input.onToolEvent ? { onToolEvent: input.onToolEvent } : {}),
    });
    this.sessions.set(input.chatId, result.sessionID);

    return {
      text: result.text,
      toolsRan: result.toolsRan,
      ...(result.stopReason === undefined ? {} : { stopReason: result.stopReason }),
      error: result.error,
    };
  }

  /** The project directory the engine opens, for tests and diagnostics. */
  projectDirectory(): string {
    return this.workspace;
  }

  async stop(): Promise<void> {
    const handle = this.handle;
    const bridge = this.bridge;
    this.handle = null;
    this.bridge = null;
    this.sessions.clear();
    await handle?.stop();
    await bridge?.stop();
  }
}

let shared: RedrobCodeEngine | null = null;

export function getRedrobCodeEngine(): RedrobCodeEngine {
  shared ??= new RedrobCodeEngine();
  return shared;
}

export async function stopRedrobCodeEngine(): Promise<void> {
  const current = shared;
  shared = null;
  await current?.stop();
}

export { DEFAULT_MODEL };
