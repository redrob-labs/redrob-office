/**
 * Redrob Code session over the engine's V1 local HTTP server.
 *
 * The engine exposes two session surfaces. The V2 `/api/session` API cannot host
 * product tools: its tool list is the in-process `ToolRegistry` (shipped
 * built-ins only), so an MCP tool registered against it never reaches the model.
 * The V1 `/session` + `/event` surface merges `MCP.tools()` into the model's tool
 * list, so a turn there can call Office's tools through the MCP bridge. Every
 * Office turn therefore drives V1.
 *
 * Hand-written because `@redrob-code/client` is private, unpublished, and pulls
 * in Effect beta. Covers only what a chat turn needs, against the routes in
 * spec section 4.
 */
import { REDROB_DIRECTORY_HEADER } from "./sidecar.js";

export interface RedrobCodeModelRef {
  providerID: string;
  id: string;
}

/** Model the engine routes through: the Redrob Console `auto` route. */
export const DEFAULT_MODEL: RedrobCodeModelRef = { providerID: "redrob", id: "auto" };

/** One event off the V1 `/event` bus. */
export interface BusEvent {
  type: string;
  /** Properties payload; the bus wraps the event body under `properties`. */
  properties: Record<string, unknown>;
}

export class RedrobCodeRequestError extends Error {
  readonly status: number;

  constructor(operation: string, status: number, body: string) {
    super(`Redrob Code ${operation} failed with HTTP ${status}: ${body.slice(0, 500)}`);
    this.name = "RedrobCodeRequestError";
    this.status = status;
  }
}

export interface RedrobCodeClientInput {
  baseUrl: string;
  /** Absolute path of the project the session runs in. */
  directory: string;
}

export interface SessionInfo {
  id: string;
}

export interface AssistantReply {
  info: {
    id?: string;
    error?: { name?: string; data?: { message?: string } } | null;
  };
  parts: Array<Record<string, unknown>>;
}

export function createRedrobCodeClient(input: RedrobCodeClientInput) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    [REDROB_DIRECTORY_HEADER]: input.directory,
  };

  const request = async (operation: string, path: string, init: RequestInit = {}) => {
    const response = await fetch(`${input.baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...((init.headers as Record<string, string>) ?? {}) },
    });
    if (!response.ok) {
      throw new RedrobCodeRequestError(operation, response.status, await response.text());
    }
    return response;
  };

  return {
    /** `POST /session` -> Session.Info (`id: ses_...`). */
    async createSession(title?: string): Promise<SessionInfo> {
      const response = await request("session.create", "/session", {
        method: "POST",
        body: JSON.stringify(title ? { title } : {}),
      });
      const body = (await response.json()) as SessionInfo;
      return body;
    },

    /**
     * `POST /session/:id/message` resolves when the turn settles, returning the
     * assistant message and its parts. `info.error` carries a failed turn.
     */
    async sendMessage(
      sessionID: string,
      params: {
        model: RedrobCodeModelRef;
        text: string;
        system?: string;
        signal?: AbortSignal;
      },
    ): Promise<AssistantReply> {
      const response = await request(
        "session.message",
        `/session/${encodeURIComponent(sessionID)}/message`,
        {
          method: "POST",
          body: JSON.stringify({
            model: { providerID: params.model.providerID, modelID: params.model.id },
            parts: [{ type: "text", text: params.text }],
            ...(params.system ? { system: params.system } : {}),
          }),
          ...(params.signal ? { signal: params.signal } : {}),
        },
      );
      return (await response.json()) as AssistantReply;
    },

    async abort(sessionID: string): Promise<void> {
      await request("session.abort", `/session/${encodeURIComponent(sessionID)}/abort`, {
        method: "POST",
      });
    },

    /** Answer a permission ask on its reply route. */
    async respondPermission(
      sessionID: string,
      permissionID: string,
      response: "once" | "always" | "reject",
    ): Promise<void> {
      await request(
        "session.permission",
        `/session/${encodeURIComponent(sessionID)}/permissions/${encodeURIComponent(permissionID)}`,
        { method: "POST", body: JSON.stringify({ response }) },
      );
    },

    /**
     * Live progress bus for the whole engine instance. Filter by `sessionID`;
     * the bus is per instance, not per session.
     */
    async *events(options: { signal?: AbortSignal } = {}): AsyncGenerator<BusEvent> {
      const response = await request(
        "session.events",
        `/event?directory=${encodeURIComponent(input.directory)}`,
        options.signal ? { signal: options.signal } : {},
      );
      if (response.body === null) return;
      yield* readBusEvents(response.body);
    },
  };
}

/** Decode an SSE body into V1 bus events. */
export async function* readBusEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<BusEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const payload = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!payload || payload === "[DONE]") continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      const event = parsed as { type?: unknown; properties?: unknown };
      if (typeof event.type !== "string") continue;
      yield {
        type: event.type,
        properties: (event.properties ?? {}) as Record<string, unknown>,
      };
    }
  }
}

export interface RunTurnInput {
  baseUrl: string;
  directory: string;
  prompt: string;
  /** Session title. Naming it up front avoids an extra title-generation call. */
  title?: string | undefined;
  system?: string;
  sessionID?: string;
  model?: RedrobCodeModelRef;
  signal?: AbortSignal;
  timeoutMs?: number;
  onTextChunk?: (chunk: string) => void;
  /** Called as the engine starts and finishes each tool call. */
  onToolEvent?: (event: {
    phase: "started" | "finished";
    name: string;
    ok?: boolean;
    args?: Record<string, unknown>;
  }) => void;
}

export interface RunTurnResult {
  sessionID: string;
  text: string;
  /** Tools the engine executed, counted from the bus tool parts. */
  toolsRan: number;
  stopReason: string | undefined;
  error: { message: string; code?: string } | null;
}

const asString = (value: unknown) => (typeof value === "string" ? value : undefined);
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

/**
 * Filter a raw bus part payload to this session, and pull the text/tool state a
 * chat turn cares about.
 *
 * The V1 bus wraps a message part under `properties.part`, and the part carries
 * `sessionID`, `type` (`text` | `tool` | `step-start` | `step-finish`), and for
 * a tool part a `state.status` of `pending` | `running` | `completed` | `error`.
 */
function partOf(event: BusEvent): Record<string, unknown> | null {
  const part = asRecord(event.properties.part);
  return Object.keys(part).length > 0 ? part : null;
}

/**
 * Run one turn against the V1 session API and settle it.
 *
 * The message POST resolves when the turn settles and carries the final text and
 * `info.error`; the bus stream, filtered to this session, is what turns per-part
 * updates into the streamed text chunks and tool events the chat service
 * forwards to the renderer. The bus is a best-effort live feed: if it drops, the
 * settled reply is still authoritative.
 */
export async function runRedrobCodeTurn(input: RunTurnInput): Promise<RunTurnResult> {
  const client = createRedrobCodeClient({ baseUrl: input.baseUrl, directory: input.directory });
  const model = input.model ?? DEFAULT_MODEL;
  // Name the session. A session created without a title makes the engine ask the
  // model for one, and that request carries no tools: a caller that treated it as
  // the turn's first model call would conclude the tools were missing.
  const sessionID = input.sessionID ?? (await client.createSession(input.title ?? "Redrob Office chat")).id;

  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  input.signal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 300_000);

  let toolsRan = 0;
  const toolStates = new Map<string, string>();
  const seenText = new Map<string, string>();

  // Live bus consumer. Runs alongside the message POST and stops when the POST
  // settles. Errors on the bus never fail the turn: the reply is authoritative.
  const pump = (async () => {
    try {
      for await (const event of client.events({ signal: controller.signal })) {
        if (!event.type.startsWith("message.part")) continue;
        const part = partOf(event);
        if (!part) continue;
        if (asString(part.sessionID) !== sessionID) continue;

        const type = asString(part.type);
        if (type === "text") {
          const partID = asString(part.id) ?? "text";
          const full = asString(part.text) ?? "";
          const already = seenText.get(partID) ?? "";
          if (full.length > already.length) {
            input.onTextChunk?.(full.slice(already.length));
            seenText.set(partID, full);
          }
          continue;
        }
        if (type === "tool") {
          const partID = asString(part.id) ?? "";
          const state = asRecord(part.state);
          const status = asString(state.status) ?? "";
          const name = asString(part.tool) ?? "tool";
          const prev = toolStates.get(partID);
          if (prev === status) continue;
          toolStates.set(partID, status);
          if (status === "running" && prev !== "running") {
            input.onToolEvent?.({
              phase: "started",
              name,
              args: asRecord(state.input),
            });
          } else if (status === "completed" || status === "error") {
            const ok = status === "completed";
            if (ok) toolsRan += 1;
            input.onToolEvent?.({ phase: "finished", name, ok });
          }
        }
      }
    } catch {
      /* bus dropped; the settled reply is authoritative */
    }
  })();

  let text = "";
  let stopReason: string | undefined;
  let error: RunTurnResult["error"] = null;

  try {
    const reply = await client.sendMessage(sessionID, {
      model,
      text: input.prompt,
      ...(input.system ? { system: input.system } : {}),
      signal: controller.signal,
    });

    const replyError = reply.info.error;
    if (replyError) {
      const message =
        replyError.data?.message ?? replyError.name ?? "Redrob Code turn failed";
      error = { message, ...(replyError.name ? { code: replyError.name } : {}) };
      stopReason = "error";
    } else {
      // Authoritative text from the settled reply, in case the bus dropped chunks.
      text = reply.parts
        .filter((part) => part.type === "text")
        .map((part) => asString(part.text) ?? "")
        .join("");
      // If the bus already streamed the whole text, do not double count it: the
      // chat service uses `text` as the record and `onTextChunk` for the live
      // view, and a streamed part whose id we saw equals what we return here.
      stopReason = "stop";
    }
  } catch (caught) {
    if (controller.signal.aborted) {
      stopReason = "aborted";
    } else {
      error = { message: caught instanceof Error ? caught.message : String(caught) };
      stopReason = "error";
    }
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", forwardAbort);
    controller.abort();
    await pump;
  }

  if (input.signal?.aborted) await client.abort(sessionID).catch(() => undefined);

  return { sessionID, text, toolsRan, stopReason, error };
}
