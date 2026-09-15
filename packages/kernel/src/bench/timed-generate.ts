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
 * Bench-only timed constrained generation over llama-server. Does not write
 * product telemetry.
 *
 * Phase numbers come from the server's own `timings` block rather than being
 * derived from wall clock on our side. Two former phases no longer exist as
 * separately observable steps and are reported as null instead of being
 * estimated: tokenization happens inside the server, and grammar construction is
 * part of task setup rather than a call we make.
 */

import type { TokenLogprob } from "../confidence.js";
import { applyExecutionPlan, clearModelCache, inferenceBaseUrl } from "../inference/runtime.js";
import { llamaServerAuthHeaders } from "../inference/llama-server.js";
import type { BenchPhaseTimings, InferenceEngineOptions } from "./types.js";

interface ServerTimings {
  prompt_n?: number;
  prompt_ms?: number;
  predicted_n?: number;
  predicted_ms?: number;
}

interface CompletionChunk {
  content?: string;
  stop?: boolean;
  timings?: ServerTimings;
  tokens_cached?: number;
  completion_probabilities?: { token?: string; prob?: number; logprob?: number }[];
  error?: { message?: string } | string;
}

function wrapPrompt(prompt: string): string {
  return [
    "<|im_start|>system",
    "You output only valid JSON that matches the provided grammar. No prose, no markdown fences, no thinking aloud.",
    "<|im_end|>",
    "<|im_start|>user",
    prompt,
    "<|im_end|>",
    "<|im_start|>assistant",
    "<think>\n\n</think>\n\n",
  ].join("\n");
}

export interface TimedGenerateResult {
  json: unknown;
  rawText: string;
  tokenLogprobs: TokenLogprob[];
  phases: BenchPhaseTimings;
  activeBackend: string | false | null;
}

export async function timedConstrainedGenerate(options: {
  modelPath: string;
  prompt: string;
  grammar: string;
  maxTokens?: number;
  engine: InferenceEngineOptions;
  /** Restart the server so the model load is cold. */
  forceColdLoad?: boolean;
}): Promise<TimedGenerateResult> {
  const totalStarted = performance.now();

  if (options.forceColdLoad) {
    await clearModelCache();
  }
  const loadStarted = performance.now();
  const plan = await applyExecutionPlan();
  const modelLoadMs = performance.now() - loadStarted;
  const baseUrl = inferenceBaseUrl();

  const wrapped = wrapPrompt(options.prompt);
  const maxTokens = options.maxTokens ?? 1024;
  const tokenLogprobs: TokenLogprob[] = [];

  const genStarted = performance.now();
  let firstTokenAt: number | null = null;
  let rawText = "";
  let timings: ServerTimings | null = null;
  let cacheHit = false;

  const response = await fetch(`${baseUrl}/completion`, {
    method: "POST",
    headers: { "content-type": "application/json", ...llamaServerAuthHeaders() },
    body: JSON.stringify({
      prompt: wrapped,
      grammar: options.grammar,
      n_predict: maxTokens,
      n_probs: 1,
      temperature: 0,
      cache_prompt: !options.forceColdLoad,
      stream: true,
    }),
  });
  if (!response.ok) {
    throw new Error(`/completion HTTP ${response.status}: ${await response.text()}`);
  }
  if (!response.body) throw new Error("/completion returned no body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let chunk: CompletionChunk;
          try {
            chunk = JSON.parse(payload) as CompletionChunk;
          } catch {
            continue;
          }
          if (chunk.error) {
            throw new Error(
              typeof chunk.error === "string" ? chunk.error : (chunk.error.message ?? "server error"),
            );
          }
          if (chunk.timings) timings = chunk.timings;
          if (typeof chunk.tokens_cached === "number" && chunk.tokens_cached > 0) cacheHit = true;
          const piece = chunk.content ?? "";
          if (piece) {
            if (firstTokenAt === null) firstTokenAt = performance.now();
            rawText += piece;
            for (const entry of chunk.completion_probabilities ?? []) {
              const logprob =
                typeof entry.logprob === "number"
                  ? entry.logprob
                  : typeof entry.prob === "number" && entry.prob > 0
                    ? Math.log(entry.prob)
                    : -50;
              tokenLogprobs.push({ token: entry.token ?? piece, logprob });
            }
          }
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  if (rawText.length === 0) {
    throw new Error("no tokens under GBNF");
  }

  const ttftMs = firstTokenAt === null ? 0 : firstTokenAt - genStarted;
  const promptTokens = timings?.prompt_n ?? 0;
  const outputTokens = timings?.predicted_n ?? tokenLogprobs.length;
  const prefillMs = timings?.prompt_ms ?? null;
  const decodeMs = timings?.predicted_ms ?? 0;

  const adapterStarted = performance.now();
  const json = JSON.parse(rawText.trim()) as unknown;
  const adapterMs = performance.now() - adapterStarted;
  const totalMs = performance.now() - totalStarted;

  return {
    json,
    rawText,
    tokenLogprobs,
    activeBackend: plan.backend,
    phases: {
      modelLoadMs,
      modelLoadCold: options.forceColdLoad === true,
      // Grammar setup and tokenization are internal to the server now.
      grammarMs: null,
      tokenizeMs: null,
      ttftMs,
      prefillMs,
      decodeMs,
      adapterMs,
      totalMs,
      promptTokens,
      outputTokens,
      prefillTokPerSec:
        prefillMs !== null && prefillMs > 0 ? (promptTokens / prefillMs) * 1000 : null,
      decodeTokPerSec: decodeMs > 0 ? (outputTokens / decodeMs) * 1000 : null,
      cacheHit,
    },
  };
}
