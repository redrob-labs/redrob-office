import { confidenceFromLogprobs } from "../confidence.js";
import {
  fieldValueToGbnf,
  fillLabel,
  getAbsentToken,
  isMaxCharsSaturated,
  parseFieldValue,
  type FillableField,
} from "../field-fill-grammar.js";
import {
  assertRemoteConfig,
  remoteGenerateConstrainedJson,
  type RedrobRemoteConfig,
} from "../remote.js";
import type {
  FieldFillResultItem,
  GenerateFieldFillResult,
} from "./field-fill-prompt.js";

export interface GenerateFieldFillRemoteOptions {
  document: string;
  fields: readonly FillableField[];
  schemaOrRubricId: string;
  onField?: (field: FieldFillResultItem) => void;
  config?: RedrobRemoteConfig | null;
}

function remoteConfigFromEnv(): RedrobRemoteConfig | null {
  const baseUrl = process.env.REDROB_REMOTE_BASE_URL?.trim() ?? "";
  const apiKey = process.env.REDROB_REMOTE_API_KEY?.trim() ?? "";
  const consentedAt = process.env.REDROB_REMOTE_CONSENTED_AT?.trim() ?? "";
  if (!baseUrl && !apiKey && !consentedAt) return null;
  return { baseUrl, apiKey, consentedAt };
}

function leafKey(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return (segments[segments.length - 1] ?? path).replaceAll("~1", "/").replaceAll("~0", "~");
}

/**
 * Per-field constrained fill over Redrob Remote (same confidence rules as local).
 */
export async function generateFieldFillRemote(
  options: GenerateFieldFillRemoteOptions,
): Promise<GenerateFieldFillResult> {
  const config = options.config ?? remoteConfigFromEnv();
  assertRemoteConfig(config);

  const completed: FieldFillResultItem[] = [];
  const doc = options.document.slice(0, 24_000);

  for (const field of options.fields) {
    const label = fillLabel(field);
    const grammar = fieldValueToGbnf(field);
    const prompt = [
      "Extract one field from the document. Reply with only the field value.",
      `If missing, reply exactly: ${getAbsentToken()}`,
      `Field: ${label}`,
      field.description ? `Hint: ${field.description}` : "",
      "",
      "Document:",
      doc,
    ]
      .filter(Boolean)
      .join("\n");

    const remote = await remoteGenerateConstrainedJson(config, {
      prompt,
      grammar,
      schemaOrRubricId: options.schemaOrRubricId,
    });

    const rawText = remote.rawText.trim() || getAbsentToken();
    const absentToken = rawText === getAbsentToken();
    const confidence = confidenceFromLogprobs(remote.tokenLogprobs.map((t) => t.logprob));
    let value: unknown = null;
    let absent = absentToken;
    let error: string | undefined;
    if (!absentToken) {
      try {
        if (isMaxCharsSaturated(field, rawText)) {
          throw new Error("grammar_fail: maxChars reached without early stop");
        }
        const parsed = parseFieldValue(field, rawText);
        value = parsed.value;
        absent = parsed.absent;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.startsWith("grammar_fail:") || message.startsWith("invalid ")) {
          value = null;
          absent = true;
          error = message;
        } else {
          value = rawText;
          absent = false;
        }
      }
    }

    const item: FieldFillResultItem = {
      path: field.path,
      label,
      value: absent ? null : value,
      absent,
      confidence,
      rawText,
      ...(error ? { error } : {}),
    };
    completed.push(item);
    options.onField?.(item);
  }

  const raw: Record<string, unknown> = {};
  for (const item of completed) {
    raw[leafKey(item.path)] = item.absent ? null : item.value;
  }
  return { fields: completed, raw, rebuilds: 0, bleedTrimmed: 0, grammarFails: 0, errors: 0 };
}
