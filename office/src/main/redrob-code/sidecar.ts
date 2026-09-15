/**
 * Redrob Code sidecar lifecycle.
 *
 * Redrob Code is the company agent engine. It is not consumable as a dependency:
 * every `@redrob-code/*` package is private and unpublished, and its in-process
 * host needs bun plus patched Effect beta and native modules. The supported
 * surface for a separate app is the local HTTP server that `redrob serve` opens.
 *
 * Architecturally this is the same shape Office has always run a sidecar in: spawn
 * a Node process, wait for readiness, talk to it over loopback HTTP. The
 * readiness handshake is the one Redrob Code pins on its own side in
 * `packages/redrob/test/server/redrob-work-engine-contract.test.ts`: a stdout line
 * beginning `redrob server listening`, then `GET /global/health`.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";

/** Prefix Redrob Code prints once its server is bound. */
export const SERVER_LISTENING_PREFIX = "redrob server listening";

/** Header Redrob Code reads to pick the project a request applies to. */
export const REDROB_DIRECTORY_HEADER = "x-redrob-directory";

export interface RedrobCodeCommand {
  command: string;
  args: string[];
  /** Where the command came from, for the log line and for error messages. */
  source: "REDROB_CODE_BIN" | "REDROB_CODE_DEV_ROOT" | "PATH";
}

/**
 * Locate the engine. `REDROB_CODE_BIN` is the packaged-binary override (the
 * bundled sidecar); `REDROB_CODE_DEV_ROOT` runs a source checkout through bun,
 * which is how the contract test gets a real engine without a release binary.
 */
export function resolveRedrobCodeCommand(
  env: NodeJS.ProcessEnv = process.env,
): RedrobCodeCommand {
  const bin = env.REDROB_CODE_BIN?.trim();
  if (bin) return { command: bin, args: [], source: "REDROB_CODE_BIN" };

  const devRoot = env.REDROB_CODE_DEV_ROOT?.trim();
  if (devRoot) {
    return {
      command: env.REDROB_CODE_BUN ?? "bun",
      args: ["run", `${devRoot}/packages/redrob/src/index.ts`],
      source: "REDROB_CODE_DEV_ROOT",
    };
  }

  return { command: "redrob", args: [], source: "PATH" };
}

/** True when an engine was explicitly configured, so callers can skip rather than guess. */
export function hasConfiguredRedrobCode(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.REDROB_CODE_BIN?.trim() || env.REDROB_CODE_DEV_ROOT?.trim());
}

/**
 * Read the base URL out of Redrob Code's readiness line, or null when the line is
 * something else. `--port 0` means the OS assigns, so the bound port only exists
 * in this line.
 */
export function parseListeningLine(line: string): string | null {
  if (!line.startsWith(SERVER_LISTENING_PREFIX)) return null;
  return line.match(/on\s+(https?:\/\/[^\s]+)/)?.[1] ?? null;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("could not find a free port")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

export interface StartRedrobCodeInput {
  /** Redrob-owned dir holding the engine's config, data, cache, and state. */
  userData: string;
  /** Console API key the engine authenticates with. */
  apiKey?: string;
  command?: RedrobCodeCommand;
  port?: number;
  startupTimeoutMs?: number;
  env?: Record<string, string>;
  log?: (line: string) => void;
}

export interface RedrobCodeHandle {
  baseUrl: string;
  version: string;
  stop: () => Promise<void>;
}

/**
 * Spawn the engine, wait for readiness, confirm health. Rejects with the captured
 * engine output so a missing or wrong binary is diagnosable instead of a bare
 * timeout.
 */
export async function startRedrobCode(
  input: StartRedrobCodeInput,
): Promise<RedrobCodeHandle> {
  const command = input.command ?? resolveRedrobCodeCommand();
  const port = input.port ?? (await freePort());
  const startupTimeoutMs = input.startupTimeoutMs ?? 120_000;

  const child = spawn(
    command.command,
    [...command.args, "serve", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: input.userData,
      env: {
        ...process.env,
        REDROB_CONFIG_DIR: `${input.userData}/redrob-code/config`,
        XDG_DATA_HOME: `${input.userData}/redrob-code/data`,
        XDG_CACHE_HOME: `${input.userData}/redrob-code/cache`,
        XDG_STATE_HOME: `${input.userData}/redrob-code/state`,
        REDROB_DISABLE_AUTOUPDATE: "1",
        // The engine's model catalog is assembled by plugins in one batch, and its
        // models.dev plugin awaits a network fetch inside that batch. On a machine
        // that cannot reach models.dev the batch never completes and the catalog
        // stays empty, which surfaces as a session whose model is "unavailable" and
        // a turn that produces no events at all. Office is fixed to the Redrob
        // Console models anyway, so the fetch buys nothing and costs offline start.
        REDROB_DISABLE_MODELS_FETCH: "1",
        ...(input.apiKey ? { REDROB_API_KEY: input.apiKey } : {}),
        ...input.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let output = "";
  const record = (chunk: Buffer) => {
    const text = String(chunk);
    output += text;
    if (input.log) for (const line of text.split("\n")) if (line) input.log(line);
  };
  child.stderr?.on("data", record);

  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 2_000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  };

  const baseUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      void stop();
      reject(
        new Error(
          `Redrob Code did not print "${SERVER_LISTENING_PREFIX}" within ${startupTimeoutMs}ms ` +
            `(resolved via ${command.source}: ${command.command})\n${output}`,
        ),
      );
    }, startupTimeoutMs);

    child.once("error", (error) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Redrob Code could not be started (resolved via ${command.source}: ${command.command}): ${error.message}`,
        ),
      );
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Redrob Code exited with code ${code} before becoming ready\n${output}`));
    });

    let buffer = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      record(chunk);
      buffer += String(chunk);
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const url = parseListeningLine(line.trim());
        if (url === null) continue;
        clearTimeout(timer);
        resolve(url);
        return;
      }
    });
  });

  const health = (await fetch(`${baseUrl}/global/health`).then((response) =>
    response.json(),
  )) as { healthy?: boolean; version?: string };
  if (health.healthy !== true) {
    await stop();
    throw new Error(`Redrob Code reported unhealthy at ${baseUrl}: ${JSON.stringify(health)}`);
  }

  return { baseUrl, version: health.version ?? "unknown", stop };
}

/**
 * Register a remote MCP server with the engine, at runtime, for one project
 * directory. This is how Office's tool bridge reaches a turn: the engine merges
 * the bridge's tools into the V1 model tool list. Registering over HTTP avoids
 * touching the user's config file (the V1 parser rejects a V2 `mcp.servers`
 * shape), so the config shape here is the flat V1 one: `{type, url}`.
 *
 * `x-redrob-directory` scopes the registration to the same project the session
 * runs in; the engine advertises the tools as `<name>_<tool>`.
 */
export async function registerMcpServer(input: {
  baseUrl: string;
  directory: string;
  name: string;
  url: string;
}): Promise<void> {
  const response = await fetch(`${input.baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [REDROB_DIRECTORY_HEADER]: input.directory,
    },
    body: JSON.stringify({
      name: input.name,
      config: { type: "remote", url: input.url },
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Redrob Code refused MCP registration for "${input.name}": HTTP ${response.status} ${await response
        .text()
        .then((text) => text.slice(0, 300))
        .catch(() => "")}`,
    );
  }
}

/**
 * Read the engine's MCP connection state for a project. Used to confirm the
 * bridge came up connected before a turn depends on its tools.
 */
export async function getMcpServers(input: {
  baseUrl: string;
  directory: string;
}): Promise<Record<string, { status?: string }>> {
  const response = await fetch(`${input.baseUrl}/mcp`, {
    headers: { [REDROB_DIRECTORY_HEADER]: input.directory },
  });
  if (!response.ok) {
    throw new Error(`Redrob Code MCP status unavailable: HTTP ${response.status}`);
  }
  return (await response.json()) as Record<string, { status?: string }>;
}
