/**
 * Test fixture: a real Redrob Code engine against a stub Redrob Console gateway.
 *
 * Redrob Code routes models through the Console provider only, but its config
 * plugin lets config refine that provider's endpoint. The V1 session path (which
 * every product turn drives) reads the flat `provider` override, NOT the V2
 * `providers` shape, so the contract config points `provider.redrob.options` at
 * a local OpenAI-compatible stub (spec section 5). Everything else, the session
 * runtime, the tool loop, the MCP merge, the permissions, is the real engine.
 */
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type GatewayTurn =
  | { kind: "tool"; id: string; name: string; args: Record<string, unknown> }
  | { kind: "text"; text: string }
  | { kind: "http-error"; status: number; message?: string };

export interface GatewayRequest {
  model: string | undefined;
  tools: string[];
  messages: unknown[];
}

export interface StubGateway {
  url: string;
  requests: GatewayRequest[];
  close: () => Promise<void>;
}

const chunk = (delta: Record<string, unknown>, finish?: string) =>
  `data: ${JSON.stringify({
    id: "chatcmpl-stub",
    object: "chat.completion.chunk",
    choices: [{ index: 0, delta, ...(finish === undefined ? {} : { finish_reason: finish }) }],
  })}\n\n`;

function framesFor(turn: Extract<GatewayTurn, { kind: "tool" | "text" }>): string {
  if (turn.kind === "text") {
    return [
      chunk({ role: "assistant" }),
      chunk({ content: turn.text }),
      chunk({}, "stop"),
      "data: [DONE]\n\n",
    ].join("");
  }
  return [
    chunk({ role: "assistant" }),
    chunk({
      tool_calls: [
        { index: 0, id: turn.id, type: "function", function: { name: turn.name, arguments: "" } },
      ],
    }),
    chunk({ tool_calls: [{ index: 0, function: { arguments: JSON.stringify(turn.args) } }] }),
    chunk({}, "tool_calls"),
    "data: [DONE]\n\n",
  ].join("");
}

export async function startStubGateway(turns: GatewayTurn[]): Promise<StubGateway> {
  const requests: GatewayRequest[] = [];
  let served = 0;
  const server: Server = createServer((request, response) => {
    let body = "";
    request.on("data", (piece) => {
      body += String(piece);
    });
    request.on("end", () => {
      if (!request.url?.includes("chat/completions")) {
        response.writeHead(404, { "content-type": "application/json" }).end("{}");
        return;
      }
      const parsed = JSON.parse(body || "{}") as {
        model?: string;
        tools?: Array<{ function?: { name?: string } }>;
        messages?: unknown[];
      };
      const messages = (parsed.messages ?? []) as Array<{ role?: string; content?: unknown }>;
      requests.push({
        model: parsed.model,
        tools: (parsed.tools ?? []).flatMap((tool) =>
          tool.function?.name ? [tool.function.name] : [],
        ),
        messages,
      });
      const turn = turns[Math.min(served, turns.length - 1)];
      served += 1;
      if (turn?.kind === "http-error") {
        response.writeHead(turn.status, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            error: { message: turn.message ?? "stubbed gateway failure", type: "stub_error" },
          }),
        );
        return;
      }
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      response.end(turn === undefined ? "data: [DONE]\n\n" : framesFor(turn));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("stub gateway has no port");

  return {
    url: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export interface EngineEnvironment {
  gateway: StubGateway;
  /** Stands in for Office's app userData dir. */
  userData: string;
  /** The engine's project directory, seeded and git-initialised. */
  workspace: string;
  close: () => Promise<void>;
}

/**
 * Build the userData layout `RedrobCodeEngine.ensureStarted` expects, with the
 * stubbed Console gateway installed in the config dir the engine will read.
 */
export async function prepareEngineEnvironment(options: {
  turns: GatewayTurn[];
  files?: Record<string, string>;
}): Promise<EngineEnvironment> {
  const gateway = await startStubGateway(options.turns);

  const userData = mkdtempSync(join(tmpdir(), "redrob-office-engine-"));
  const workspace = join(userData, "redrob-code", "workspace");
  const config = join(userData, "redrob-code", "config");
  mkdirSync(workspace, { recursive: true });
  mkdirSync(config, { recursive: true });

  for (const [path, content] of Object.entries(options.files ?? {})) {
    writeFileSync(join(workspace, path), content);
  }
  // A git worktree makes the workspace its own project rather than falling back
  // to the engine's global project.
  execFileSync("git", ["init", "-q"], { cwd: workspace });

  // V1 provider override: the session path reads `provider.redrob.options`, so
  // this is what steers the real turn at the stub. (The V2 `providers` shape
  // only steers `/api/*` and is rejected as V1 by the config parser.)
  writeFileSync(
    join(config, "redrob.json"),
    JSON.stringify(
      {
        provider: {
          redrob: { options: { baseURL: gateway.url, apiKey: "rrk_contract_test" } },
        },
      },
      null,
      2,
    ),
  );

  return { gateway, userData, workspace, close: () => gateway.close() };
}
