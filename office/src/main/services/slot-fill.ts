import {
  applyExecutionPlan,
  draftSlotCompileHints,
  draftSlotToSpec,
  generateFieldFillCloud,
  readInferenceRouteFromEnv,
  readLlmProvidersFromEnv,
  redrobAvailableFromEnv,
  resolveInferenceRoute,
  slotFieldsToFillable,
  type GenerateFieldFillResult,
  type SlotFieldSpec,
} from "@redrob/kernel";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { hostFieldFill } from "./inference-host.js";

/** @deprecated Prefer SlotFieldSpec — kept as alias for call sites mid-migration. */
export interface SlotDef {
  id: string;
  description: string;
  maxChars: number;
  required: boolean;
}

export interface FillSlotsInput {
  /** Facts the model may use (already assembled text). */
  document: string;
  slots: readonly SlotDef[] | readonly SlotFieldSpec[];
  /** Optional compile hints keyed by slot id (enumValues, maxDigits, …). */
  hints?: Record<string, import("@redrob/kernel").SlotFieldCompileHints>;
  systemPrompt?: string;
  onField?: (field: {
    path: string;
    value: unknown;
    streamTarget?: string;
  }) => void;
}

export interface FillSlotsResult {
  values: Record<string, string>;
  unfilled: string[];
  modelPath: string;
  documentTruncated?: boolean;
  truncationNotice?: string;
  rebuilds: number;
  bleedTrimmed: number;
  grammarFails: number;
  errors: number;
}

function isSlotDef(slot: SlotDef | SlotFieldSpec): slot is SlotDef {
  return !("type" in slot);
}

/**
 * Field-fill (esp. cloud JSON) may return strings, arrays, or small objects.
 * Never use bare String(obj) — that becomes "[object Object]" in the JD.
 */
export function slotValueToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => slotValueToText(item))
      .filter(Boolean)
      .join("\n");
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text.trim();
    if (typeof obj.value === "string") return obj.value.trim();
    if (typeof obj.content === "string") return obj.content.trim();
    if (Array.isArray(obj.items)) return slotValueToText(obj.items);
    if (Array.isArray(obj.lines)) return slotValueToText(obj.lines);
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
}

async function localModelPath(): Promise<string | null> {
  try {
    const plan = await applyExecutionPlan({ skipBackendProbe: true });
    await access(plan.modelPath, constants.R_OK);
    return plan.modelPath;
  } catch {
    return null;
  }
}

/**
 * Shared slot-fill for draftJd / draftFromTemplate.
 * Honors Settings inference route (local / cloud / auto mix).
 */
export async function fillSlots(input: FillSlotsInput): Promise<FillSlotsResult> {
  const modelPath = await localModelPath();
  const route = resolveInferenceRoute({
    mode: readInferenceRouteFromEnv(),
    providers: readLlmProvidersFromEnv(),
    localAvailable: Boolean(modelPath),
    redrobAvailable: redrobAvailableFromEnv(),
    workload: { kind: "draft", text: input.document },
  });

  const specs: SlotFieldSpec[] = input.slots.map((slot) =>
    isSlotDef(slot) ? draftSlotToSpec(slot) : slot,
  );
  const hints = {
    ...Object.fromEntries(
      input.slots.map((slot) => {
        if (isSlotDef(slot)) return [slot.id, draftSlotCompileHints(slot)] as const;
        return [slot.id, { description: slot.label }] as const;
      }),
    ),
    ...input.hints,
  };
  const fields = slotFieldsToFillable(specs, hints);
  const streamByPath = new Map(specs.map((s) => [s.id.startsWith("/") ? s.id : `/${s.id}`, s]));

  const onField =
    input.onField &&
    ((field: { path: string; value: unknown }) => {
      const spec = streamByPath.get(field.path);
      input.onField?.({
        path: field.path,
        value: field.value,
        streamTarget: spec?.streamTarget ?? spec?.id ?? field.path,
      });
    });

  let filled: GenerateFieldFillResult;
  if (route.provider === "local") {
    if (!modelPath) throw new Error("Local model is not available for slot fill");
    filled = (await hostFieldFill({
      modelPath,
      document: input.document,
      fields,
      ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
      ...(onField ? { onField } : {}),
    })) as GenerateFieldFillResult;
  } else if (route.provider === "redrob_remote") {
    throw new Error("Remote slot fill is not wired; use local or cloud.");
  } else {
    filled = await generateFieldFillCloud({
      provider: route.provider,
      model: route.model,
      providers: readLlmProvidersFromEnv(),
      document: input.document,
      fields,
      // Slot-fill drives drafting (JD, template copy); the cloud must compose,
      // not extract, or it echoes the facts and leaves optional slots blank.
      mode: "generate",
      ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
      ...(onField ? { onField } : {}),
    });
  }

  const values: Record<string, string> = {};
  const unfilled: string[] = [];
  for (const spec of specs) {
    const path = spec.id.startsWith("/") ? spec.id : `/${spec.id}`;
    const item = filled.fields.find((f) => f.path === path);
    const text =
      item && !item.absent && item.value !== null && item.value !== undefined
        ? slotValueToText(item.value)
        : "";
    if (text) values[spec.id.replace(/^\//, "")] = text;
    else if (spec.required) unfilled.push(spec.id.replace(/^\//, ""));
  }

  return {
    values,
    unfilled,
    modelPath: modelPath ?? route.model,
    ...(filled.documentTruncated ? { documentTruncated: true } : {}),
    ...(filled.truncationNotice ? { truncationNotice: filled.truncationNotice } : {}),
    rebuilds: filled.rebuilds ?? 0,
    bleedTrimmed: filled.bleedTrimmed ?? 0,
    grammarFails: filled.grammarFails ?? 0,
    errors: filled.errors ?? 0,
  };
}
