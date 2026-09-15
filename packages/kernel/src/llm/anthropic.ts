import type {
  CloudChatMessage,
  CloudChatRequest,
  CloudChatResult,
  CloudToolCall,
} from "./types.js";
import { LlmProviderError } from "./types.js";
import { toolNameCodec, usesAdaptiveThinking } from "./openai-compatible.js";

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_BASE = "https://api.anthropic.com";

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source:
        | { type: "base64"; media_type: string; data: string }
        | { type: "url"; url: string };
    }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

/**
 * Anthropic Messages API with optional tools.
 * Streams whenever a chunk sink is given: tool_use blocks are reassembled from
 * content_block_start / input_json_delta events so tool rounds stream too.
 */
export async function anthropicChat(
  request: CloudChatRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<CloudChatResult> {
  if (request.provider !== "anthropic") {
    throw new LlmProviderError("anthropicChat requires provider anthropic");
  }
  const startedAt = performance.now();
  const base = (request.credential.baseUrl?.trim() || DEFAULT_BASE).replace(/\/$/, "");
  const hasTools = Boolean(request.tools && request.tools.length > 0);
  const stream = typeof request.onTextChunk === "function";

  const system = request.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  // Claude refuses a tool name outside ^[a-zA-Z0-9_-]{1,128}$, and every tool
  // here is named `screen.capture` style.
  const names = toolNameCodec(request.tools, true);
  const messages = toAnthropicMessages(request.messages, names.forward);

  if (messages.length === 0) {
    throw new LlmProviderError("At least one user/assistant message is required");
  }

  const adaptive = usesAdaptiveThinking(request.model);
  const body: Record<string, unknown> = {
    model: request.model,
    max_tokens: request.maxTokens ?? 512,
    messages,
    stream,
  };
  // From Claude 5 on, a non-default temperature is a 400 rather than a hint.
  if (!adaptive) body.temperature = request.temperature ?? 0.7;
  if (system) body.system = system;
  if (hasTools && request.tools) {
    body.tools = request.tools.map((tool) => ({
      name: names.forward(tool.name),
      description: tool.description,
      input_schema: tool.parameters,
    }));
    if (request.toolChoice === "required") {
      body.tool_choice = { type: "any" };
    } else if (request.toolChoice === "none") {
      body.tool_choice = { type: "none" };
    } else {
      body.tool_choice = { type: "auto" };
    }
  }
  if (adaptive) {
    // Thinking is adaptive and always available here: a manual budget is a
    // 400, and max_tokens caps thinking plus answer together while the newer
    // tokenizer spends about 30% more on the same words.
    if (!request.thinking) body.thinking = { type: "disabled" };
    body.max_tokens = request.thinking
      ? Math.max(Math.ceil((request.maxTokens ?? 512) * 1.3), 16_000)
      : Math.ceil((request.maxTokens ?? 512) * 1.3);
  } else if (request.thinking) {
    body.thinking = { type: "enabled", budget_tokens: 2048 };
    body.temperature = 1;
    body.max_tokens = Math.max(request.maxTokens ?? 512, 4096);
  }

  const response = await fetchImpl(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": request.credential.apiKey.trim(),
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new LlmProviderError(
      `anthropic chat failed: HTTP ${response.status} ${response.statusText}${
        detail ? ` — ${detail.slice(0, 240)}` : ""
      }`,
    );
  }

  if (stream && response.body) {
    const streamed = await readAnthropicSse(
      response.body,
      request.onTextChunk!,
      request.onReasoningChunk,
      names.back,
    );
    return {
      text: streamed.text.trim(),
      timingMs: performance.now() - startedAt,
      modelId: `anthropic:${request.model}`,
      provider: "anthropic",
      finishReason: streamed.toolCalls.length > 0 ? "tool_calls" : streamed.finishReason,
      ...(streamed.toolCalls.length > 0 ? { toolCalls: streamed.toolCalls } : {}),
      ...(streamed.reasoning.trim() ? { reasoning: streamed.reasoning.trim() } : {}),
    };
  }

  const payload = (await response.json()) as {
    stop_reason?: string;
    content?: Array<{
      type?: string;
      text?: string;
      thinking?: string;
      id?: string;
      name?: string;
      input?: unknown;
    }>;
  };

  const text = (payload.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text!)
    .join("")
    .trim();

  const reasoning = (payload.content ?? [])
    .filter((block) => block.type === "thinking" && typeof block.thinking === "string")
    .map((block) => block.thinking!)
    .join("")
    .trim();

  const toolCalls: CloudToolCall[] = [];
  for (const block of payload.content ?? []) {
    if (block.type !== "tool_use" || !block.id || !block.name) continue;
    toolCalls.push({
      id: block.id,
      name: names.back(block.name),
      arguments: JSON.stringify(block.input ?? {}),
    });
  }

  const finishReason =
    payload.stop_reason === "tool_use" || toolCalls.length > 0
      ? "tool_calls"
      : payload.stop_reason === "max_tokens"
        ? "length"
        : "stop";

  if (!text && toolCalls.length === 0) {
    throw new LlmProviderError("anthropic returned empty content");
  }

  return {
    text,
    timingMs: performance.now() - startedAt,
    modelId: `anthropic:${request.model}`,
    provider: "anthropic",
    finishReason,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(reasoning ? { reasoning } : {}),
  };
}

function toAnthropicUserContent(
  content: string | import("./types.js").CloudChatContentPart[],
): string | AnthropicContentBlock[] {
  if (typeof content === "string") return content;
  return content.map((part) => {
    if (part.type === "text") return { type: "text" as const, text: part.text };
    const url = part.image_url.url;
    const dataUrl = /^data:([^;]+);base64,(.+)$/s.exec(url);
    if (dataUrl) {
      return {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: dataUrl[1]!,
          data: dataUrl[2]!,
        },
      };
    }
    return {
      type: "image" as const,
      source: { type: "url" as const, url },
    };
  });
}

function toAnthropicMessages(
  messages: CloudChatMessage[],
  rename: (name: string) => string = (name) => name,
): Array<{ role: "user" | "assistant"; content: string | AnthropicContentBlock[] }> {
  const out: Array<{ role: "user" | "assistant"; content: string | AnthropicContentBlock[] }> =
    [];
  let pendingToolResults: AnthropicContentBlock[] = [];

  const flushTools = (): void => {
    if (pendingToolResults.length === 0) return;
    out.push({ role: "user", content: pendingToolResults });
    pendingToolResults = [];
  };

  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      pendingToolResults.push({
        type: "tool_result",
        tool_use_id: m.toolCallId,
        content: m.content,
      });
      continue;
    }
    flushTools();
    if (m.role === "user") {
      out.push({ role: "user", content: toAnthropicUserContent(m.content) });
      continue;
    }
    // assistant
    if (m.toolCalls && m.toolCalls.length > 0) {
      const blocks: AnthropicContentBlock[] = [];
      if (m.content.trim()) blocks.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls) {
        let input: unknown = {};
        try {
          input = JSON.parse(tc.arguments || "{}");
        } catch {
          input = { raw: tc.arguments };
        }
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: rename(tc.name),
          input,
        });
      }
      out.push({ role: "assistant", content: blocks });
    } else {
      out.push({ role: "assistant", content: m.content });
    }
  }
  flushTools();
  return out;
}

interface StreamedMessage {
  text: string;
  reasoning: string;
  toolCalls: CloudToolCall[];
  finishReason: "stop" | "tool_calls" | "length";
}

async function readAnthropicSse(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: string) => void,
  onReasoningChunk?: (chunk: string) => void,
  renameBack: (name: string) => string = (name) => name,
): Promise<StreamedMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let reasoning = "";
  let finishReason: "stop" | "tool_calls" | "length" = "stop";
  const pendingTools = new Map<number, { id: string; name: string; json: string }>();
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
      if (!data || data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data) as {
          type?: string;
          index?: number;
          content_block?: { type?: string; id?: string; name?: string };
          delta?: {
            type?: string;
            text?: string;
            thinking?: string;
            partial_json?: string;
            stop_reason?: string;
          };
        };
        if (
          parsed.type === "content_block_start" &&
          parsed.content_block?.type === "tool_use" &&
          parsed.content_block.id &&
          parsed.content_block.name
        ) {
          pendingTools.set(parsed.index ?? 0, {
            id: parsed.content_block.id,
            name: parsed.content_block.name,
            json: "",
          });
          continue;
        }
        if (parsed.type === "content_block_delta") {
          if (parsed.delta?.type === "thinking_delta" && parsed.delta.thinking) {
            reasoning += parsed.delta.thinking;
            onReasoningChunk?.(parsed.delta.thinking);
            continue;
          }
          if (parsed.delta?.type === "text_delta" && parsed.delta.text) {
            full += parsed.delta.text;
            onChunk(parsed.delta.text);
            continue;
          }
          if (parsed.delta?.type === "input_json_delta" && parsed.delta.partial_json) {
            const entry = pendingTools.get(parsed.index ?? 0);
            if (entry) entry.json += parsed.delta.partial_json;
          }
          continue;
        }
        if (parsed.type === "message_delta") {
          if (parsed.delta?.stop_reason === "tool_use") finishReason = "tool_calls";
          else if (parsed.delta?.stop_reason === "max_tokens") finishReason = "length";
        }
      } catch {
        // ignore
      }
    }
  }
  const toolCalls: CloudToolCall[] = [...pendingTools.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, entry]) => ({
      id: entry.id,
      name: renameBack(entry.name),
      arguments: entry.json || "{}",
    }));
  if (!full.trim() && toolCalls.length === 0) {
    throw new LlmProviderError("Anthropic stream ended with empty content");
  }
  return { text: full, reasoning, toolCalls, finishReason };
}
