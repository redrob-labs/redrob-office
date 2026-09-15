import { confidenceFromLogprobs } from "../confidence.js";
import {
  fillLabel,
  getAbsentToken,
  parseFieldValue,
  type FillableField,
} from "../field-fill-grammar.js";
import type {
  FieldFillResultItem,
  GenerateFieldFillResult,
} from "../inference/field-fill-prompt.js";
import { generateCloudChatWithFallback } from "./chat.js";
import type { CloudProviderId, LlmProviderSecrets } from "./types.js";
import { LlmProviderError } from "./types.js";

/** Forced-low confidence: cloud vendors do not return usable token logprobs. */
const DEGRADED = confidenceFromLogprobs([-20]);

function leafKey(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return (segments[segments.length - 1] ?? path).replaceAll("~1", "/").replaceAll("~0", "~");
}

/**
 * Words a model writes to mean "nothing here" instead of returning null.
 *
 * A Korean draft in particular comes back with "없음" in an optional slot, and
 * without this it lands verbatim in the JD as "우대 사항: 없음". Treating these
 * as absent leaves the section out, which is what an empty slot should do.
 */
const BLANK_TOKENS = new Set([
  "없음",
  "해당없음",
  "해당사항없음",
  "미정",
  "none",
  "n/a",
  "na",
  "nil",
  "null",
  "tbd",
  "unknown",
  "notspecified",
  "notprovided",
  "notapplicable",
  "-",
  "--",
]);

export function isBlankToken(text: string): boolean {
  const compact = text.trim().toLowerCase().replace(/[.\s]/g, "");
  return compact.length === 0 || BLANK_TOKENS.has(compact);
}

function extractJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new LlmProviderError("Cloud field-fill response was not a JSON object");
  }
  const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new LlmProviderError("Cloud field-fill JSON must be an object");
  }
  return parsed as Record<string, unknown>;
}

export interface GenerateFieldFillCloudOptions {
  provider: CloudProviderId;
  model: string;
  providers: LlmProviderSecrets;
  document: string;
  fields: readonly FillableField[];
  systemPrompt?: string;
  /**
   * "extract" (default) reads values out of the document and forbids
   * invention — right for intake/verify. "generate" composes each field as
   * new copy (a JD, an email), expanding brief notes — right for drafting,
   * where "extract" semantics make the cloud echo the facts back verbatim.
   */
  mode?: "extract" | "generate";
  onField?: (field: FieldFillResultItem) => void;
}

/**
 * Unconstrained JSON field fill over a third-party cloud.
 * Every field gets degraded confidence so Desk sends them to review.
 */
export async function generateFieldFillCloud(
  options: GenerateFieldFillCloudOptions,
): Promise<GenerateFieldFillResult> {
  const absent = getAbsentToken();
  const doc = options.document.slice(0, 24_000);
  const fieldLines = options.fields.map((field) => {
    const key = leafKey(field.path);
    const label = fillLabel(field);
    return `- "${key}" (${field.type}${field.required ? ", required" : ""}): ${label}${
      field.description ? ` — ${field.description}` : ""
    }`;
  });

  const generate = options.mode === "generate";
  const system = [
    options.systemPrompt?.trim(),
    generate
      ? "Compose each listed field as polished copy for the document being written. Expand brief notes into complete, concrete text — do not paste the notes back unchanged."
      : "Extract the listed fields from the document.",
    `Reply with a single JSON object only. Use null when a field has no value — never the words "${absent}", "none", or "없음" as a value.`,
    "For string/text fields, return a plain string (use \\n between list items). Never return nested objects for text fields.",
    generate
      ? "Stay faithful to the facts given: do not invent unrelated stacks, years, or degrees. Leave a field null only when there is genuinely nothing to write."
      : "Do not invent facts that are not in the document.",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [generate ? "Fields to write:" : "Fields:", ...fieldLines, "", "Document:", doc].join("\n");

  const cloud = await generateCloudChatWithFallback({
    provider: options.provider,
    model: options.model,
    thinking: false,
    providers: options.providers,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: Math.min(4096, 256 + options.fields.length * 64),
    temperature: 0.1,
  });

  const rawObj = extractJsonObject(cloud.text);
  const completed: FieldFillResultItem[] = [];
  const raw: Record<string, unknown> = {};

  for (const field of options.fields) {
    const key = leafKey(field.path);
    const label = fillLabel(field);
    const rawValue = rawObj[key];
    let absentField = rawValue === null || rawValue === undefined || rawValue === absent;
    let value: unknown = null;
    let error: string | undefined;

    if (!absentField && typeof rawValue === "string" && isBlankToken(rawValue)) {
      // Model wrote "없음"/"none"/"-" instead of returning null.
      absentField = true;
    }

    if (!absentField) {
      try {
        const asText =
          typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue);
        // parseFieldValue returns { value, absent } — unwrap it. Assigning the
        // wrapper object here is the bug that stored "/name" as
        // {"value":"Kim Minjun","absent":false}, so downstream saw an object
        // (email said "Hi Candidate", verify rendered "[object Object]").
        const parsed = parseFieldValue(field, asText);
        value = parsed.value;
        if (
          parsed.absent ||
          value === absent ||
          value === null ||
          value === undefined ||
          (typeof value === "string" && isBlankToken(value))
        ) {
          absentField = true;
          value = null;
        }
      } catch (err) {
        absentField = true;
        value = null;
        error = err instanceof Error ? err.message : String(err);
      }
    }

    const item: FieldFillResultItem = {
      path: field.path,
      label,
      value: absentField ? null : value,
      absent: absentField,
      confidence: DEGRADED,
      rawText:
        rawValue === null || rawValue === undefined
          ? ""
          : typeof rawValue === "string"
            ? rawValue
            : JSON.stringify(rawValue),
      ...(error ? { error } : {}),
    };
    completed.push(item);
    raw[key] = absentField ? null : item.value;
    options.onField?.(item);
  }

  return { fields: completed, raw, rebuilds: 0, bleedTrimmed: 0, grammarFails: 0, errors: 0 };
}
