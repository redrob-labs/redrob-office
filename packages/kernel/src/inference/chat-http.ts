/*
 * Copyright 2026 Redrob
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Chat and assess over llama-server /v1/chat/completions.
 *
 * Reasoning is a per-request property, not a server flag, because field-fill and
 * chat share one process. The server runs with `--reasoning auto` and each
 * request states its own `enable_thinking`.
 *
 * With reasoning on, Qwen3.5 will spend the whole token budget thinking and
 * return an empty `content` alongside a populated `reasoning_content`. Measured
 * on the pinned build: at max_tokens 24 the model produced 88 characters of
 * reasoning and no content, finish_reason `length`. That is not an error to
 * surface — it means the budget was too small — so the request is retried once
 * with a larger budget, and only a second empty result is reported to the user.
 */

import { llamaServerAuthHeaders, requireLlamaServerBaseUrl } from "./llama-server.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatHttpOptions {
  messages: readonly ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Off by default. Field-fill never sets this. */
  reasoning?: boolean;
  onTextChunk?: (chunk: string) => void;
  /** Streamed thinking, so the UI can fill a collapsed area as it arrives. */
  onReasoningChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}

export interface ChatHttpResult {
  text: string;
  /** Empty when reasoning was off. Rendered collapsed and hidden by default. */
  reasoning: string;
  timingMs: number;
  finishReason: string;
  /** True when a first attempt returned only reasoning and was retried. */
  retriedForEmptyContent: boolean;
  /** Budget actually used, after any retry. */
  maxTokensUsed: number;
  reasoningEnabled: boolean;
}

const DEFAULT_MAX_TOKENS = 1024;
/** Headroom for a retry after thinking consumed the whole first budget. */
const REASONING_RETRY_MULTIPLIER = 4;
const REASONING_RETRY_CEILING = 8192;

interface ChatDelta {
  content?: string | null;
  reasoning_content?: string | null;
}

interface ChatStreamChunk {
  choices?: { delta?: ChatDelta; finish_reason?: string | null }[];
  error?: { message?: string } | string;
}

function errorText(payload: ChatStreamChunk["error"]): string {
  if (typeof payload === "string") return payload;
  return payload?.message ?? "unknown server error";
}

async function streamChat(
  baseUrl: string,
  body: Record<string, unknown>,
  options: ChatHttpOptions,
): Promise<{ text: string; reasoning: string; finishReason: string }> {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...llamaServerAuthHeaders() },
    body: JSON.stringify({ ...body, stream: true }),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `llama-server /v1/chat/completions HTTP ${response.status}: ${detail.slice(0, 500)}`,
    );
  }
  if (!response.body) throw new Error("llama-server chat returned no body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let reasoning = "";
  let finishReason = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        for (const line of rawEvent.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          let chunk: ChatStreamChunk;
          try {
            chunk = JSON.parse(payload) as ChatStreamChunk;
          } catch {
            continue;
          }
          if (chunk.error) throw new Error(`llama-server: ${errorText(chunk.error)}`);

          const choice = chunk.choices?.[0];
          if (!choice) continue;
          if (choice.finish_reason) finishReason = choice.finish_reason;

          const deltaContent = choice.delta?.content;
          if (deltaContent) {
            text += deltaContent;
            options.onTextChunk?.(deltaContent);
          }
          // Kept strictly separate from content so the UI can hide it by default.
          const deltaReasoning = choice.delta?.reasoning_content;
          if (deltaReasoning) {
            reasoning += deltaReasoning;
            options.onReasoningChunk?.(deltaReasoning);
          }
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return { text, reasoning, finishReason };
}

export async function generateChatHttp(options: ChatHttpOptions): Promise<ChatHttpResult> {
  const baseUrl = requireLlamaServerBaseUrl();
  const reasoningEnabled = options.reasoning === true;
  const startedAt = performance.now();
  let maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  const requestBody = (budget: number) => ({
    messages: options.messages,
    max_tokens: budget,
    temperature: options.temperature ?? 0.7,
    chat_template_kwargs: { enable_thinking: reasoningEnabled },
  });

  let attempt = await streamChat(baseUrl, requestBody(maxTokens), options);
  let retried = false;

  // Only reachable with reasoning on: an empty content plus a length stop means
  // thinking ate the budget. Retrying is the documented recovery, not a fallback
  // that hides a failure — a second empty result is still returned as empty.
  if (
    reasoningEnabled &&
    attempt.text.trim().length === 0 &&
    attempt.reasoning.trim().length > 0 &&
    maxTokens < REASONING_RETRY_CEILING
  ) {
    retried = true;
    maxTokens = Math.min(REASONING_RETRY_CEILING, maxTokens * REASONING_RETRY_MULTIPLIER);
    console.info(
      `[chat] reasoning consumed the budget (content empty, reasoning=${attempt.reasoning.length} chars); ` +
        `retrying at max_tokens=${maxTokens}`,
    );
    attempt = await streamChat(baseUrl, requestBody(maxTokens), options);
  }

  return {
    text: attempt.text,
    reasoning: attempt.reasoning,
    timingMs: performance.now() - startedAt,
    finishReason: attempt.finishReason,
    retriedForEmptyContent: retried,
    maxTokensUsed: maxTokens,
    reasoningEnabled,
  };
}

/** Single-shot generation. Reasoning defaults off, as everywhere else. */
export async function generateTextHttp(options: {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  reasoning?: boolean;
  onTextChunk?: (chunk: string) => void;
}): Promise<ChatHttpResult> {
  const messages: ChatMessage[] = [];
  if (options.systemPrompt) messages.push({ role: "system", content: options.systemPrompt });
  messages.push({ role: "user", content: options.prompt });
  return generateChatHttp({
    messages,
    ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    reasoning: options.reasoning === true,
    ...(options.onTextChunk ? { onTextChunk: options.onTextChunk } : {}),
  });
}
