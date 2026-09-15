import type {
  CloudChatMessage,
  CloudChatRequest,
  CloudChatResult,
  CloudProviderId,
  CloudToolCall,
} from "./types.js";
import { LlmProviderError } from "./types.js";

const DEFAULT_BASE: Record<Exclude<CloudProviderId, "anthropic">, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

function resolveBaseUrl(request: CloudChatRequest): string {
  if (request.provider === "anthropic") {
    throw new LlmProviderError("Use anthropicChat for Anthropic");
  }
  const override = request.credential.baseUrl?.trim().replace(/\/$/, "");
  if (override) return override;
  return DEFAULT_BASE[request.provider];
}

function authHeaders(request: CloudChatRequest): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${request.credential.apiKey.trim()}`,
  };
  if (request.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://redrob.app";
    headers["X-Title"] = "Redrob Office";
  }
  return headers;
}

function toOpenAiMessages(
  messages: CloudChatMessage[],
  rename: (name: string) => string = (name) => name,
): unknown[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool",
        tool_call_id: m.toolCallId,
        content: m.content,
      };
    }
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: rename(tc.name), arguments: tc.arguments },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

/**
 * Some providers refuse a tool name outside `^[a-zA-Z0-9_-]{1,128}$`.
 *
 * Claude always did. OpenAI's Responses path (and OpenRouter routes that use it
 * for gpt-5 / Luna) now does too — a second round that echoed `workflow.list`
 * back as `input[n].name` 400'd the whole turn after the tool had already run.
 * Underscores are safe everywhere the dots already work, so the wire form is
 * always plain and the registry names stay dotted on our side.
 */
export function needsPlainToolNames(_model: string): boolean {
  return true;
}

/** `screen.capture` ⇄ `screen_capture`, so a call can be routed back. */
export function toolNameCodec(
  tools: ReadonlyArray<{ name: string }> | undefined,
  active: boolean,
): { forward: (name: string) => string; back: (name: string) => string } {
  if (!active) {
    const same = (name: string): string => name;
    return { forward: same, back: same };
  }
  const back = new Map<string, string>();
  const forward = new Map<string, string>();
  for (const tool of tools ?? []) {
    let safe = plainToolName(tool.name);
    // Two originals cannot share one safe name, or the answer routes to the
    // wrong tool.
    for (let n = 2; back.has(safe) && back.get(safe) !== tool.name; n += 1) {
      safe = `${plainToolName(tool.name).slice(0, 125)}_${n}`;
    }
    back.set(safe, tool.name);
    forward.set(tool.name, safe);
  }
  return {
    forward: (name) => forward.get(name) ?? plainToolName(name),
    back: (name) => back.get(name) ?? name,
  };
}

function plainToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

/**
 * Models whose thinking is adaptive and whose sampling knobs are gone.
 *
 * From Claude 5 on, `temperature` / `top_p` / `top_k` and manual thinking
 * budgets return 400 rather than being ignored, and thinking is on unless it
 * is switched off outright. There is no effort dial to reach for.
 */
export function usesAdaptiveThinking(model: string): boolean {
  return /(?:^|\/)claude-(?:sonnet|opus|haiku|fable|mythos)-(?:[5-9]|\d\d)\b/i.test(
    model,
  );
}

/**
 * Room for the answer once thinking has taken its share.
 *
 * `max_tokens` caps thinking plus response together, and the Claude 5
 * tokenizer spends about 30% more on the same words. Sized too tightly, a
 * reply comes back as thinking followed by a truncated sentence.
 */
function adaptiveMaxTokens(
  requested: number,
  adaptive: boolean,
  thinking: boolean,
): number {
  if (!adaptive) return requested;
  const forTokenizer = Math.ceil(requested * 1.3);
  return thinking ? Math.max(forTokenizer, 16_000) : forTokenizer;
}

/**
 * OpenAI Chat Completions (also OpenRouter).
 * Streams whenever a chunk sink is given, including tool rounds: SSE deltas carry
 * tool_call fragments that are reassembled by index before the result is returned.
 */
export async function openaiCompatibleChat(
  request: CloudChatRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<CloudChatResult> {
  if (request.provider === "anthropic") {
    throw new LlmProviderError("openaiCompatibleChat does not support anthropic");
  }
  const startedAt = performance.now();
  const base = resolveBaseUrl(request);
  const hasTools = Boolean(request.tools && request.tools.length > 0);
  const hasMultimodal = request.messages.some(
    (m) => m.role === "user" && Array.isArray(m.content),
  );
  const stream = typeof request.onTextChunk === "function" && !hasMultimodal;

  const adaptive = usesAdaptiveThinking(request.model);
  const names = toolNameCodec(
    request.tools,
    needsPlainToolNames(request.model),
  );
  const body: Record<string, unknown> = {
    model: request.model,
    messages: toOpenAiMessages(request.messages, names.forward),
    max_tokens: adaptiveMaxTokens(
      request.maxTokens ?? 512,
      adaptive,
      Boolean(request.thinking),
    ),
    stream,
  };
  // Claude 5 rejects temperature, top_p and top_k outright rather than
  // clamping them, so sending the usual default 400s every call.
  if (!adaptive) body.temperature = request.temperature ?? 0.7;

  // Flash and Pro are one model with reasoning off or on for families that
  // think by default (DeepSeek). Gemini on OpenRouter already defaults Flash
  // to reasoning-off when the field is omitted — sending effort:"none" has
  // been observed to yield empty finish_reason=stop with no tool calls.
  if (request.provider === "openrouter") {
    if (adaptive) {
      // Adaptive thinking is the only mode, already at high effort. Asking for
      // an effort level makes the gateway translate it into a thinking budget,
      // which these models reject.
      if (!request.thinking) body.reasoning = { enabled: false };
    } else if (request.thinking) {
      body.reasoning = { enabled: true, effort: "high" };
      // High effort consumes most of max_tokens; leave room for the final answer.
      body.max_tokens = Math.max(request.maxTokens ?? 512, 4096);
    } else if (/^deepseek\//i.test(request.model)) {
      body.reasoning = { enabled: false, effort: "none" };
      body.thinking = { type: "disabled" };
    }
  }

  // OpenAI reasoning models cannot switch thinking off, so Flash buys its speed
  // with the lowest effort the model offers rather than with a second model.
  if (request.provider === "openai") {
    body.reasoning_effort = request.thinking ? "high" : "low";
    if (request.thinking) {
      body.max_tokens = Math.max(request.maxTokens ?? 512, 4096);
    }
  }

  // Local llama-server (loopback base URL) shares the chat template with
  // field-fill: reasoning is per-request via chat_template_kwargs, not a
  // server flag. Without this, Qwen3.5 spends the budget thinking.
  const baseHost = (() => {
    try {
      return new URL(base).hostname;
    } catch {
      return "";
    }
  })();
  const isLoopback = baseHost === "127.0.0.1" || baseHost === "localhost";
  if (isLoopback) {
    body.chat_template_kwargs = { enable_thinking: Boolean(request.thinking) };
    // llama-server takes a GBNF on the chat endpoint too, which is the only way
    // to make a shape a small model cannot miss. Hosted providers ignore the
    // field, so it is not worth sending them a grammar they cannot compile.
    if (request.grammar && !hasTools) body.grammar = request.grammar;
  } else if (request.jsonOnly && !hasTools) {
    // What a hosted provider offers instead of a grammar. Every OpenAI-compatible
    // API takes this, and it is the difference between a contract that holds in
    // the cloud and one that holds only on a desk with local weights.
    body.response_format = { type: "json_object" };
  }

  if (hasTools && request.tools) {
    body.tools = request.tools.map((tool) => ({
      type: "function",
      function: {
        name: names.forward(tool.name),
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
    body.tool_choice = request.toolChoice ?? "auto";
  }

  const response = await fetchImpl(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: authHeaders(request),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new LlmProviderError(
      `${request.provider} chat failed: HTTP ${response.status} ${response.statusText}${
        detail ? ` — ${detail.slice(0, 240)}` : ""
      }`,
    );
  }

  if (stream && response.body) {
    const streamed = await readOpenAiSse(
      response.body,
      request.onTextChunk!,
      request.onReasoningChunk,
      names.back,
    );
    return {
      text: streamed.text.trim(),
      timingMs: performance.now() - startedAt,
      modelId: `${request.provider}:${request.model}`,
      provider: request.provider,
      finishReason: streamed.toolCalls.length > 0 ? "tool_calls" : streamed.finishReason,
      ...(streamed.toolCalls.length > 0 ? { toolCalls: streamed.toolCalls } : {}),
      ...(streamed.reasoning.trim() ? { reasoning: streamed.reasoning.trim() } : {}),
    };
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      finish_reason?: string;
      native_finish_reason?: string | null;
      error?: { message?: string; code?: number | string };
      message?: {
        content?: string | null;
        refusal?: string | null;
        reasoning?: string | null;
        reasoning_content?: string | null;
        reasoning_details?: Array<{
          type?: string;
          text?: string;
          summary?: string;
          output_text?: string;
        }>;
        tool_calls?: Array<{
          id?: string;
          type?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
  };

  const choice = payload.choices?.[0];
  if (choice?.error?.message) {
    throw new LlmProviderError(
      `${request.provider} choice error: ${choice.error.message}`,
    );
  }
  const message = choice?.message;
  const toolCalls = parseOpenAiToolCalls(message?.tool_calls).map((call) => ({
    ...call,
    name: names.back(call.name),
  }));
  let text = coerceMessageText(message?.content);
  if (!text && typeof message?.refusal === "string") {
    text = message.refusal.trim();
  }
  const reasoning = extractReasoningText(message ?? {}).trim();
  // OpenRouter sometimes parks the only visible text in reasoning_details.
  if (!text && !toolCalls.length) {
    text = extractVisibleReasoningOutput(message?.reasoning_details);
  }
  const finishReason =
    choice?.finish_reason === "tool_calls" || toolCalls.length > 0
      ? "tool_calls"
      : choice?.finish_reason === "length"
        ? "length"
        : "stop";

  if (!text && toolCalls.length === 0) {
    // One nudge: models that returned empty stop with tools available often
    // succeed when forced to pick a tool (Gemini via OpenRouter).
    if (
      hasTools &&
      request.toolChoice !== "required" &&
      request.toolChoice !== "none"
    ) {
      const {
        onTextChunk: _dropStream,
        onReasoningChunk: _dropReason,
        ...rest
      } = request;
      return openaiCompatibleChat(
        { ...rest, toolChoice: "required" },
        fetchImpl,
      );
    }
    throw new LlmProviderError(
      emptyContentError(request.provider, {
        reasoningChars: reasoning.length,
        model: request.model,
        ...(choice?.finish_reason
          ? { finishReason: choice.finish_reason }
          : {}),
        ...(choice?.native_finish_reason
          ? { nativeFinishReason: String(choice.native_finish_reason) }
          : {}),
      }),
    );
  }

  return {
    text,
    timingMs: performance.now() - startedAt,
    modelId: `${request.provider}:${request.model}`,
    provider: request.provider,
    finishReason,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(reasoning ? { reasoning } : {}),
  };
}

/** Pull reasoning from OpenRouter (`reasoning`) or DeepSeek-native (`reasoning_content`) shapes. */
function extractReasoningText(source: {
  reasoning?: string | null;
  reasoning_content?: string | null;
  reasoning_details?: Array<{ type?: string; text?: string; summary?: string }>;
}): string {
  if (typeof source.reasoning === "string" && source.reasoning) return source.reasoning;
  if (typeof source.reasoning_content === "string" && source.reasoning_content) {
    return source.reasoning_content;
  }
  if (!Array.isArray(source.reasoning_details)) return "";
  let out = "";
  for (const detail of source.reasoning_details) {
    if (typeof detail.text === "string" && detail.text) out += detail.text;
    else if (typeof detail.summary === "string" && detail.summary) out += detail.summary;
  }
  return out;
}

function parseOpenAiToolCalls(
  raw:
    | Array<{
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>
    | undefined,
): CloudToolCall[] {
  if (!raw?.length) return [];
  const out: CloudToolCall[] = [];
  for (const item of raw) {
    const name = item.function?.name?.trim();
    if (!name) continue;
    // Gemini/OpenRouter sometimes omit id; the runtime still needs a stable key.
    const id = item.id?.trim() || `call_${out.length + 1}_${name}`;
    out.push({
      id,
      name,
      arguments:
        typeof item.function?.arguments === "string"
          ? item.function.arguments
          : "{}",
    });
  }
  return out;
}

/** Visible assistant text OpenRouter sometimes nests under reasoning_details. */
function extractVisibleReasoningOutput(
  details:
    | Array<{
        type?: string;
        text?: string;
        summary?: string;
        output_text?: string;
      }>
    | undefined,
): string {
  if (!Array.isArray(details)) return "";
  const parts: string[] = [];
  for (const detail of details) {
    const type = (detail.type ?? "").toLowerCase();
    if (
      type.includes("response") ||
      type.includes("output") ||
      type === "reasoning.output_text"
    ) {
      if (typeof detail.output_text === "string" && detail.output_text.trim()) {
        parts.push(detail.output_text.trim());
      } else if (typeof detail.text === "string" && detail.text.trim()) {
        parts.push(detail.text.trim());
      }
    }
  }
  return parts.join("\n").trim();
}

interface StreamedChoice {
  text: string;
  reasoning: string;
  toolCalls: CloudToolCall[];
  finishReason: "stop" | "tool_calls" | "length";
}

interface ToolCallAccumulator {
  id: string;
  name: string;
  arguments: string;
}

async function readOpenAiSse(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: string) => void,
  onReasoningChunk?: (chunk: string) => void,
  renameBack: (name: string) => string = (name) => name,
): Promise<StreamedChoice> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let reasoning = "";
  let finishReason: "stop" | "tool_calls" | "length" = "stop";
  const pendingTools = new Map<number, ToolCallAccumulator>();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{
            finish_reason?: string | null;
            delta?: {
              content?: string;
              reasoning?: string | null;
              reasoning_content?: string | null;
              reasoning_details?: Array<{ type?: string; text?: string; summary?: string }>;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
          }>;
        };
        const choice = parsed.choices?.[0];
        const reasonPiece = choice?.delta ? extractReasoningText(choice.delta) : "";
        if (reasonPiece) {
          reasoning += reasonPiece;
          onReasoningChunk?.(reasonPiece);
        }
        const piece = choice?.delta?.content;
        if (piece) {
          full += piece;
          onChunk(piece);
        }
        for (const call of choice?.delta?.tool_calls ?? []) {
          const index = typeof call.index === "number" ? call.index : 0;
          const entry = pendingTools.get(index) ?? { id: "", name: "", arguments: "" };
          if (call.id) entry.id = call.id;
          if (call.function?.name) entry.name = call.function.name;
          if (call.function?.arguments) entry.arguments += call.function.arguments;
          pendingTools.set(index, entry);
        }
        if (choice?.finish_reason === "tool_calls") finishReason = "tool_calls";
        else if (choice?.finish_reason === "length") finishReason = "length";
      } catch {
        // ignore malformed SSE chunks
      }
    }
  }
  const toolCalls: CloudToolCall[] = [...pendingTools.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, entry]) => entry)
    .filter((entry) => entry.id && entry.name)
    .map((entry) => ({
      id: entry.id,
      name: renameBack(entry.name),
      arguments: entry.arguments || "{}",
    }));
  if (!full.trim() && toolCalls.length === 0) {
    throw new LlmProviderError(
      emptyContentError("provider", {
        reasoningChars: reasoning.length,
        streamed: true,
        ...(finishReason === "length" ? { finishReason: "length" } : {}),
      }),
    );
  }
  return { text: full, reasoning, toolCalls, finishReason };
}

/** Some OpenAI-compatible APIs return content as a string; others as parts[]. */
export function coerceMessageText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      parts.push(part);
      continue;
    }
    if (!part || typeof part !== "object") continue;
    const record = part as Record<string, unknown>;
    if (typeof record.text === "string") parts.push(record.text);
  }
  return parts.join("").trim();
}

function emptyContentError(
  provider: string,
  detail: {
    reasoningChars: number;
    finishReason?: string;
    nativeFinishReason?: string;
    model?: string;
    streamed?: boolean;
  },
): string {
  const head = detail.streamed
    ? "Stream ended with empty content"
    : `${provider} returned empty content`;
  const bits: string[] = [];
  if (detail.model) bits.push(`model=${detail.model}`);
  if (detail.reasoningChars > 0) {
    bits.push(
      `model spent ${detail.reasoningChars} chars on reasoning with no answer or tool call`,
    );
  }
  if (detail.finishReason === "length") {
    bits.push("finish_reason=length (token budget exhausted)");
  } else if (detail.finishReason) {
    bits.push(`finish_reason=${detail.finishReason}`);
  }
  if (detail.nativeFinishReason) {
    bits.push(`native=${detail.nativeFinishReason}`);
  }
  return bits.length > 0 ? `${head} (${bits.join("; ")})` : head;
}
