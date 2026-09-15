/**
 * In-process MCP bridge for Office's tool registry.
 *
 * The engine refuses `tools.register` from outside its own process, but it
 * accepts an MCP server at runtime, per project directory (spec section 3). This
 * is the smallest honest bridge: a plain `node:http` server speaking JSON-RPC 2.0
 * on POST, no MCP SDK and no npm dependency. The engine's MCP client tries
 * Streamable HTTP first, so:
 *
 *   - a request (`id` present)  -> 200 + application/json + JSON-RPC result
 *   - a notification (no `id`)  -> 202 with an empty body
 *   - GET                       -> 405 ("no server-initiated stream")
 *
 * Methods: `initialize`, `tools/list`, `tools/call`, `ping`. Tool results are
 * `{ content: [{ type: "text", text }] }`; a failure adds `isError: true`.
 *
 * The tool surface and every call still go through Office's own registry, policy
 * gate, and approval flow: the bridge holds no policy of its own. It is given a
 * `listTools` and a `callTool` by whoever starts it (the chat service), so the
 * ChatStreamEvent IPC surface, approval waiters, and observation shaping stay
 * exactly where they already live. Tool names reach the model as
 * `<server>_<tool>`, e.g. `redrob-office_fs_write`.
 */
import { createServer, type Server } from "node:http";

/** Protocol version the engine's MCP client negotiates. */
export const MCP_PROTOCOL_VERSION = "2025-06-18";

/** MCP server name; the engine prefixes tool names with `<name>_`. */
export const BRIDGE_SERVER_NAME = "redrob-office";

export interface BridgeTool {
  /** Bare tool name, e.g. `fs.write`. The engine dots become underscores. */
  name: string;
  description: string;
  /** JSON Schema for the arguments object. */
  inputSchema: Record<string, unknown>;
}

export interface BridgeToolResult {
  text: string;
  isError?: boolean;
}

export interface McpBridgeInput {
  /** The tools this bridge advertises. Read per `tools/list`, so it stays live. */
  listTools: () => BridgeTool[];
  /** Run one tool by its bare registry name; returns the model-facing text. */
  callTool: (name: string, args: Record<string, unknown>) => Promise<BridgeToolResult>;
}

export interface McpBridgeHandle {
  /** Loopback URL the engine registers, e.g. `http://127.0.0.1:<port>/mcp`. */
  url: string;
  port: number;
  /**
   * Resolves once the engine's MCP client has fetched the tool list at least
   * once. The engine caches those defs at connect and only merges them into a
   * turn's tool list afterward, so a caller can wait on this before the first
   * prompt to be sure the tools are live.
   */
  waitForToolsListed: (timeoutMs?: number) => Promise<boolean>;
  stop: () => Promise<void>;
}

type JsonRpcId = string | number | null;

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
}

/**
 * MCP represents a call error two ways: a transport/protocol failure is a
 * JSON-RPC `error`, while a tool that ran and failed is a normal result carrying
 * `isError: true`. A tool this bridge exposes always "runs" (the registry
 * reports refusals as results), so tool failures ride the result path and only a
 * genuinely unknown method is a JSON-RPC error.
 */
async function handleMessage(
  message: JsonRpcMessage,
  input: McpBridgeInput,
  onToolsListed: () => void,
): Promise<{ result?: unknown; error?: { code: number; message: string } }> {
  switch (message.method) {
    case "initialize":
      return {
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: BRIDGE_SERVER_NAME, version: "1.0.0" },
        },
      };
    case "tools/list":
      onToolsListed();
      return {
        result: {
          tools: input.listTools().map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        },
      };
    case "tools/call": {
      const name = typeof message.params?.name === "string" ? message.params.name : "";
      const args =
        message.params?.arguments && typeof message.params.arguments === "object"
          ? (message.params.arguments as Record<string, unknown>)
          : {};
      try {
        const outcome = await input.callTool(name, args);
        return {
          result: {
            content: [{ type: "text", text: outcome.text }],
            ...(outcome.isError ? { isError: true } : {}),
          },
        };
      } catch (caught) {
        const text = caught instanceof Error ? caught.message : String(caught);
        return { result: { content: [{ type: "text", text }], isError: true } };
      }
    }
    case "ping":
      return { result: {} };
    default:
      return { error: { code: -32601, message: `no method ${message.method ?? "(none)"}` } };
  }
}

/** Start the bridge on an ephemeral loopback port. */
export async function startMcpBridge(input: McpBridgeInput): Promise<McpBridgeHandle> {
  let toolsListed = false;
  const listeners = new Set<() => void>();
  const onToolsListed = () => {
    if (toolsListed) return;
    toolsListed = true;
    for (const notify of listeners) notify();
    listeners.clear();
  };

  const server: Server = createServer((request, response) => {
    if (request.method === "GET") {
      // No server-initiated stream; the engine treats 405 as "POST only".
      response.writeHead(405).end();
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(405).end();
      return;
    }
    let body = "";
    request.on("data", (piece) => {
      body += String(piece);
    });
    request.on("end", () => {
      let message: JsonRpcMessage;
      try {
        message = JSON.parse(body || "{}") as JsonRpcMessage;
      } catch {
        response.writeHead(400).end();
        return;
      }
      // A notification (no id) is acknowledged with 202 and no body.
      if (message.id === undefined || message.id === null) {
        response.writeHead(202).end();
        return;
      }
      void handleMessage(message, input, onToolsListed).then((outcome) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify(
            outcome.error
              ? { jsonrpc: "2.0", id: message.id, error: outcome.error }
              : { jsonrpc: "2.0", id: message.id, result: outcome.result },
          ),
        );
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("MCP bridge could not bind a port");
  }
  const { port } = address;

  return {
    url: `http://127.0.0.1:${port}/mcp`,
    port,
    waitForToolsListed: (timeoutMs = 20_000) =>
      new Promise<boolean>((resolve) => {
        if (toolsListed) {
          resolve(true);
          return;
        }
        const timer = setTimeout(() => {
          listeners.delete(notify);
          resolve(false);
        }, timeoutMs);
        const notify = () => {
          clearTimeout(timer);
          resolve(true);
        };
        listeners.add(notify);
      }),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
