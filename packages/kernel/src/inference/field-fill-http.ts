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
 * Field-fill over llama-server /completion.
 *
 * Shape is unchanged from the in-process implementation this replaces: one
 * grammar-constrained decode per field, a bleed scanner that cuts a following
 * field's label out of the current value, and a mid-decode break the moment the
 * value is terminated. Only the transport differs.
 *
 * Prefix reuse works differently and is worth stating plainly. The in-process
 * version fed the server deltas and relied on a resident sequence holding KV.
 * Here every request carries the whole prompt — preamble, committed lines, and
 * the current label — and `cache_prompt` makes the server reuse the longest
 * cached prefix. That is why aborting mid-decode is safe: the next request
 * re-states the trimmed value, and the slot re-decodes only from the point where
 * the prompts diverge.
 *
 * Reasoning is structurally impossible on this path. /completion never applies a
 * chat template, and the preamble already carries the closed `<think></think>`
 * block, so the reasoning toggle cannot reach a grammar-constrained decode.
 */

import {
  assertFieldsBudgetInvariant,
  fieldValueToGbnf,
  fillLabel,
  getAbsentToken,
  IncrementalLabelStopScanner,
  isMaxCharsSaturated,
  maxTokensForField,
  parseFieldValue,
  stringCharBound,
  type FillableField,
} from "../field-fill-grammar.js";
import { confidenceFromLogprobs, type TokenLogprob } from "../confidence.js";
import { CACHED_GRAMMAR_STOP_TRIGGERS } from "./grammar-cache.js";
import { llamaServerAuthHeaders, requireLlamaServerBaseUrl } from "./llama-server.js";
import { truncateDocumentForContext } from "./prompt-assembly.js";
import {
  buildPreamble,
  completedLinesText,
  leafKey,
  probabilityToLogprob,
  sanitizeValueRaw,
  type FieldFillResultItem,
  type FieldFillSessionOptions,
  type GenerateFieldFillOptions,
  type GenerateFieldFillResult,
} from "./field-fill-prompt.js";

/** Server-side probability payload; older builds send `prob`, newer `logprob`. */
interface CompletionProbability {
  token?: string;
  prob?: number;
  logprob?: number;
}

interface CompletionChunk {
  content?: string;
  stop?: boolean;
  completion_probabilities?: CompletionProbability[];
  error?: { message?: string } | string;
}

function logprobOf(entry: CompletionProbability): number {
  if (typeof entry.logprob === "number" && Number.isFinite(entry.logprob)) {
    return entry.logprob;
  }
  if (typeof entry.prob === "number") return probabilityToLogprob(entry.prob);
  return -50;
}

function errorText(payload: CompletionChunk["error"]): string {
  if (typeof payload === "string") return payload;
  return payload?.message ?? "unknown server error";
}

/**
 * Read an SSE `/completion` stream, feeding each token to `onToken`.
 * `onToken` returning true aborts the request mid-decode.
 */
async function streamCompletion(
  baseUrl: string,
  body: Record<string, unknown>,
  onToken: (text: string, probabilities: CompletionProbability[]) => boolean,
): Promise<{ aborted: boolean; stopped: boolean }> {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/completion`, {
    method: "POST",
    headers: { "content-type": "application/json", ...llamaServerAuthHeaders() },
    body: JSON.stringify({ ...body, stream: true }),
    signal: controller.signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`llama-server /completion HTTP ${response.status}: ${detail.slice(0, 500)}`);
  }
  if (!response.body) throw new Error("llama-server /completion returned no body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let aborted = false;
  let stopped = false;

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

          let chunk: CompletionChunk;
          try {
            chunk = JSON.parse(payload) as CompletionChunk;
          } catch {
            continue;
          }
          if (chunk.error) throw new Error(`llama-server: ${errorText(chunk.error)}`);

          const text = chunk.content ?? "";
          if (text.length > 0 || chunk.completion_probabilities?.length) {
            if (onToken(text, chunk.completion_probabilities ?? [])) {
              aborted = true;
              controller.abort();
              return { aborted, stopped };
            }
          }
          if (chunk.stop) stopped = true;
        }
      }
    }
  } catch (error) {
    // An abort we requested is the success path, not a failure.
    if (!aborted) throw error;
  } finally {
    if (!aborted) {
      await reader.cancel().catch(() => undefined);
    }
  }

  return { aborted, stopped };
}

/**
 * Interactive field-fill against the running llama-server. Public surface matches
 * the in-process session it replaces so call sites are unchanged.
 */
export class HttpFieldFillSession {
  private readonly baseUrl: string;
  private readonly modelPath: string;
  private readonly backendLabel: string;
  private readonly preamble: string;
  private readonly knownLabels: string[];
  private readonly maxTokensPerField: number | undefined;
  private readonly onField: ((field: FieldFillResultItem) => void) | undefined;
  private completed: FieldFillResultItem[] = [];
  private injected = "";
  private disposed = false;
  private rebuildCount = 0;
  private bleedTrimmedCount = 0;
  private grammarFailCount = 0;
  private errorCount = 0;
  readonly documentTruncated: boolean;
  readonly truncationNotice: string | null;

  private constructor(
    baseUrl: string,
    options: FieldFillSessionOptions,
    documentTruncated: boolean,
    truncationNotice: string | null,
    backendLabel: string,
  ) {
    this.baseUrl = baseUrl;
    this.modelPath = options.modelPath;
    this.backendLabel = backendLabel;
    this.preamble = buildPreamble(options.document, options.fields, options.systemPrompt);
    this.knownLabels = options.fields.map((field) => fillLabel(field));
    this.maxTokensPerField = options.maxTokensPerField;
    this.onField = options.onField;
    this.documentTruncated = documentTruncated;
    this.truncationNotice = truncationNotice;
  }

  static async open(options: FieldFillSessionOptions): Promise<HttpFieldFillSession> {
    if (options.fields.length === 0) {
      throw new Error("FieldFillSession requires at least one declared field");
    }
    assertFieldsBudgetInvariant(options.fields);

    const baseUrl = requireLlamaServerBaseUrl();
    const contextSize = await serverContextSize(baseUrl);
    const truncated = truncateDocumentForContext(options.document, contextSize, 768);
    if (truncated.truncated && truncated.notice) {
      console.info(`[inference] ${truncated.notice}`);
    }

    console.info(`field-fill-session server=${baseUrl} model=${options.modelPath}`);
    return new HttpFieldFillSession(
      baseUrl,
      { ...options, document: truncated.document },
      truncated.truncated,
      truncated.notice,
      baseUrl,
    );
  }

  get completedFields(): readonly FieldFillResultItem[] {
    return this.completed;
  }

  get rebuilds(): number {
    return this.rebuildCount;
  }

  get bleedTrimmed(): number {
    return this.bleedTrimmedCount;
  }

  get grammarFails(): number {
    return this.grammarFailCount;
  }

  get errors(): number {
    return this.errorCount;
  }

  private fieldLogMeta(): string {
    const base = this.modelPath.replace(/\\/g, "/").split("/").pop() ?? this.modelPath;
    return `model=${base} backend=${this.backendLabel}`;
  }

  /** Full prompt for the next decode; the server reuses the cached prefix of it. */
  private promptFor(label: string): string {
    return `${this.preamble}${this.injected}${completedLinesText(this.completed)}${label}: `;
  }

  /**
   * Prompt-side reset. There is no client-held KV to clear: the next request
   * re-sends the prompt and the server reuses whatever prefix still matches.
   */
  async rebuild(): Promise<void> {
    this.rebuildCount += 1;
  }

  /** Write arbitrary text into the prompt without a field label (hints only). */
  async injectRaw(text: string): Promise<void> {
    this.injected += text;
  }

  /** Commit `label: value` without a model decode (skip / isolation). */
  async writeDeterministic(field: FillableField, rawText: string): Promise<FieldFillResultItem> {
    const label = fillLabel(field);
    const text = rawText.trim() || getAbsentToken();
    const absent = text === getAbsentToken();
    const item: FieldFillResultItem = {
      path: field.path,
      label,
      value: absent ? null : text,
      absent,
      confidence: confidenceFromLogprobs([-50]),
      rawText: text,
    };
    this.completed.push(item);
    this.onField?.(item);
    return item;
  }

  async fill(field: FillableField): Promise<FieldFillResultItem> {
    const label = fillLabel(field);
    if (!this.knownLabels.includes(label)) {
      this.knownLabels.push(label);
    }
    const fieldStarted = performance.now();
    const tokenLogprobs: TokenLogprob[] = [];
    let raw = "";
    let bleedTrimmed = false;
    let sawTerminator = false;
    let firstTokenWasNewline = false;

    try {
      const tokenBudget = maxTokensForField(field, this.maxTokensPerField);
      const stopScanner = new IncrementalLabelStopScanner(label, this.knownLabels);

      const result = await streamCompletion(
        this.baseUrl,
        {
          prompt: this.promptFor(label),
          grammar: fieldValueToGbnf(field),
          cache_prompt: true,
          temperature: 0,
          n_predict: tokenBudget,
          n_probs: 1,
          // Server-side terminators; the label-bleed cut still happens here.
          stop: [...CACHED_GRAMMAR_STOP_TRIGGERS],
        },
        (text, probabilities) => {
          if (text.includes("\n") || text.includes("\r")) {
            sawTerminator = true;
            if (tokenLogprobs.length === 0 && raw.length === 0) firstTokenWasNewline = true;
            return true;
          }
          for (const entry of probabilities) {
            tokenLogprobs.push({ token: entry.token ?? text, logprob: logprobOf(entry) });
          }
          if (probabilities.length === 0 && text.length > 0) {
            tokenLogprobs.push({ token: text, logprob: -50 });
          }

          const hit = stopScanner.push(text);
          if (hit) {
            raw = stopScanner.buffer.slice(0, hit.index);
            if (hit.isTab) {
              sawTerminator = true;
              return true;
            }
            this.bleedTrimmedCount += 1;
            bleedTrimmed = true;
            sawTerminator = true;
            return true;
          }
          raw = stopScanner.buffer;
          return tokenLogprobs.length >= tokenBudget;
        },
      );

      // A server-side stop on one of the grammar terminators counts as terminated.
      if (result.stopped) sawTerminator = true;

      if (bleedTrimmed && raw.length === 0) {
        throw new Error("grammar_fail: no value tokens before following label");
      }
      if (!sawTerminator) {
        throw new Error(
          raw.length === 0
            ? "grammar_fail: no value tokens before end"
            : "grammar_fail: value missing terminating newline",
        );
      }

      const cleaned = sanitizeValueRaw(raw, label, this.knownLabels);
      if (isMaxCharsSaturated(field, cleaned) || isMaxCharsSaturated(field, raw.trim())) {
        throw new Error(
          `grammar_fail: maxChars reached without early stop (bound=${stringCharBound(field)})`,
        );
      }
      const parsed = parseFieldValue(field, cleaned);
      const confidence =
        tokenLogprobs.length > 0
          ? confidenceFromLogprobs(tokenLogprobs.map((entry) => entry.logprob))
          : confidenceFromLogprobs([-50]);
      const item: FieldFillResultItem = {
        path: field.path,
        label,
        value: parsed.value,
        absent: parsed.absent,
        confidence,
        rawText: cleaned.length > 0 ? cleaned : raw,
        ...(bleedTrimmed ? { bleedTrimmed: true } : {}),
      };
      this.completed.push(item);
      this.onField?.(item);

      const ms = Math.round(performance.now() - fieldStarted);
      const kind = bleedTrimmed
        ? "bleed_trimmed"
        : firstTokenWasNewline || (raw.length === 0 && tokenLogprobs.length === 0)
          ? "empty_immediate_nl"
          : raw === getAbsentToken() || cleaned === getAbsentToken()
            ? "absent_token"
            : parsed.absent
              ? "absent_other"
              : "value";
      console.log(
        `field-fill-field ${this.fieldLogMeta()} path=${field.path} ms=${ms} tokens=${tokenLogprobs.length} kind=${kind} raw=${JSON.stringify(item.rawText)}`,
      );
      return item;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const grammarFail = message.startsWith("grammar_fail:");
      if (grammarFail) this.grammarFailCount += 1;
      else this.errorCount += 1;
      const item: FieldFillResultItem = {
        path: field.path,
        label,
        value: null,
        absent: true,
        confidence: confidenceFromLogprobs([-50]),
        rawText: "",
        error: message,
      };
      this.completed.push(item);
      this.onField?.(item);
      const ms = Math.round(performance.now() - fieldStarted);
      console.log(
        `field-fill-field ${this.fieldLogMeta()} path=${field.path} ms=${ms} tokens=${tokenLogprobs.length} kind=${grammarFail ? "grammar_fail" : "error"} raw=${JSON.stringify(raw)} err=${JSON.stringify(message)}`,
      );
      await this.rebuild();
      return item;
    }
  }

  async close(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    console.info(
      `field-fill: ${this.completed.length} fields, ${this.rebuildCount} rebuilds, ` +
        `bleed_trimmed=${this.bleedTrimmedCount}, gfail=${this.grammarFailCount}, error=${this.errorCount}`,
    );
  }
}

let cachedContextSize: { baseUrl: string; value: number } | null = null;

/** Context window the server actually loaded, for document truncation. */
async function serverContextSize(baseUrl: string): Promise<number> {
  if (cachedContextSize?.baseUrl === baseUrl) return cachedContextSize.value;
  try {
    const response = await fetch(`${baseUrl}/props`, { headers: llamaServerAuthHeaders() });
    if (response.ok) {
      const body = (await response.json()) as {
        default_generation_settings?: { n_ctx?: number };
        n_ctx?: number;
      };
      const value = body.default_generation_settings?.n_ctx ?? body.n_ctx;
      if (typeof value === "number" && value > 0) {
        cachedContextSize = { baseUrl, value };
        return value;
      }
    }
  } catch {
    /* fall through to the conservative default below */
  }
  return 8192;
}

export function resetFieldFillHttpCaches(): void {
  cachedContextSize = null;
}

export async function generateFieldFillHttp(
  options: GenerateFieldFillOptions,
): Promise<GenerateFieldFillResult> {
  const session = await HttpFieldFillSession.open({
    modelPath: options.modelPath,
    document: options.document,
    fields: options.fields,
    ...(options.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
    ...(options.maxTokensPerField !== undefined
      ? { maxTokensPerField: options.maxTokensPerField }
      : {}),
    ...(options.onField ? { onField: options.onField } : {}),
  });
  try {
    for (const field of options.fields) {
      await session.fill(field);
    }
  } finally {
    await session.close();
  }

  const raw: Record<string, unknown> = {};
  for (const item of session.completedFields) {
    raw[leafKey(item.path)] = item.absent ? null : item.value;
  }
  return {
    fields: [...session.completedFields],
    raw,
    rebuilds: session.rebuilds,
    bleedTrimmed: session.bleedTrimmed,
    grammarFails: session.grammarFails,
    errors: session.errors,
    ...(session.documentTruncated
      ? {
          documentTruncated: true,
          ...(session.truncationNotice ? { truncationNotice: session.truncationNotice } : {}),
        }
      : {}),
  };
}
