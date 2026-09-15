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
 * Prompt construction and value parsing for field-fill, shared by every backend.
 *
 * Field-fill deliberately bypasses the chat endpoint. It builds the Qwen3.5
 * prompt itself, byte-identical to what the GGUF jinja template produces with
 * enable_thinking=false, and decodes through /completion under a GBNF grammar.
 * That is what keeps thinking tokens out of a constrained decode no matter how
 * the user has set the reasoning toggle.
 */

import type { FieldConfidence } from "../confidence.js";
import {
  describeFillField,
  fillLabel,
  getAbsentToken,
  type FillableField,
} from "../field-fill-grammar.js";
import { assembleInferencePrompt } from "./prompt-assembly.js";

export interface FieldFillResultItem {
  path: string;
  label: string;
  value: unknown;
  absent: boolean;
  confidence: FieldConfidence;
  rawText: string;
  error?: string;
  /** Value accepted after cutting a following-field label bleed; not a rebuild. */
  bleedTrimmed?: boolean;
}

export interface GenerateFieldFillOptions {
  modelPath: string;
  document: string;
  fields: readonly FillableField[];
  /** System/instruction override (defaults to extract wording). */
  systemPrompt?: string;
  maxTokensPerField?: number;
  onField?: (field: FieldFillResultItem) => void;
}

export interface GenerateFieldFillResult {
  fields: FieldFillResultItem[];
  raw: Record<string, unknown>;
  /** Set when the document was cut to fit the server context. */
  documentTruncated?: boolean;
  truncationNotice?: string;
  rebuilds: number;
  bleedTrimmed: number;
  grammarFails: number;
  errors: number;
}

export interface FieldFillSessionOptions {
  modelPath: string;
  document: string;
  /** Declared in the preamble so the model knows the upcoming labels. */
  fields: readonly FillableField[];
  systemPrompt?: string;
  maxTokensPerField?: number;
  onField?: (field: FieldFillResultItem) => void;
}

/** Exact bytes from GGUF `tokenizer.chat_template` when enable_thinking is false. */
export const QWEN35_JINJA_NON_THINK_ASSISTANT_SUFFIX =
  "<|im_start|>assistant\n<think>\n\n</think>\n\n";

export function assertQwen35AssistantSuffix(preamble: string): void {
  const idx = preamble.lastIndexOf("<|im_start|>assistant");
  if (idx < 0) {
    throw new Error("Qwen3.5 preamble missing <|im_start|>assistant");
  }
  const actual = preamble.slice(idx);
  if (actual !== QWEN35_JINJA_NON_THINK_ASSISTANT_SUFFIX) {
    throw new Error(
      [
        "Qwen3.5 assistant suffix !== GGUF jinja enable_thinking=false",
        `expected=${JSON.stringify(QWEN35_JINJA_NON_THINK_ASSISTANT_SUFFIX)}`,
        `actual=${JSON.stringify(actual)}`,
      ].join("\n"),
    );
  }
}

export function probabilityToLogprob(probability: number): number {
  if (!(probability > 0)) return -50;
  return Math.log(probability);
}

export function leafKey(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return (segments[segments.length - 1] ?? path).replaceAll("~1", "/").replaceAll("~0", "~");
}

export function sanitizeValueRaw(
  raw: string,
  currentLabel: string,
  labels: readonly string[],
): string {
  let cleaned = raw
    .replace(/<\/?think>/gi, "")
    .replace(/\r/g, "")
    .replace(/\uFFFD+/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/g, "");
  const newline = cleaned.indexOf("\n");
  if (newline !== -1) cleaned = cleaned.slice(0, newline);
  for (const label of labels) {
    if (label === currentLabel) continue;
    const needle = `${label}:`;
    const idx = cleaned.indexOf(needle);
    if (idx !== -1) cleaned = cleaned.slice(0, idx);
  }
  return cleaned.trim();
}

export function buildPreamble(
  document: string,
  fields: readonly FillableField[],
  systemPrompt?: string,
): string {
  const fieldLines = fields
    .map(
      (field) =>
        `- ${fillLabel(field)} (${field.type}${field.required ? ", required" : ""}): ${describeFillField(field)}`,
    )
    .join("\n");
  const system =
    systemPrompt?.trim() ||
    [
      "Read the document. After each label, write only the value then a newline.",
      `If unknown or not present, write exactly ${getAbsentToken()}.`,
      "Do not write JSON, keys, or explanations.",
    ].join(" ");
  const schema = ["Fields (label → value on the following lines):", fieldLines].join("\n");
  // Fixed order via assembleInferencePrompt — do not reorder blocks here.
  const body = assembleInferencePrompt({ system, schema, document });

  const preamble = `<|im_start|>user\n${body}\n<|im_end|>\n${QWEN35_JINJA_NON_THINK_ASSISTANT_SUFFIX}`;
  assertQwen35AssistantSuffix(preamble);
  return preamble;
}

export function completedLinesText(completed: readonly FieldFillResultItem[]): string {
  return completed
    .map((item) => {
      const raw = item.error ? getAbsentToken() : item.rawText.trim() || getAbsentToken();
      return `${item.label}: ${raw}\n`;
    })
    .join("");
}
