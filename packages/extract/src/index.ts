import {
  DEFAULT_LOCAL_PACK_TIER,
  applyExecutionPlan,
  detectDeviceProfile,
  generateFieldFill,
  generateFieldFillCloud,
  generateFieldFillRemote,
  partitionNeedsReview,
  prepareImageForModel,
  readInferenceRouteFromEnv,
  readLlmProvidersFromEnv,
  redrobAvailableFromEnv,
  resolveInferenceRoute,
  schemaFieldsToFillable,
  schemaFieldsToSlotSpecs,
  slotFieldsToFillable,
  type Tier,
} from "@redrob/kernel";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { loadSchema } from "@redrob/registry";
import { decodeSourceFile } from "./decode-source.js";

export { runBatch, type BatchResult, type BatchRunState } from "./batch.js";
export { INTAKE_EXTENSIONS, decodeSourceFile, isIntakeExtension } from "./decode-source.js";

export interface ExtractInput {
  source:
    | { kind: "file"; path: string }
    | { kind: "image"; buffer: Buffer }
    | { kind: "text"; content: string };
  schemaId: string;
  tierOverride?: Tier;
  /** Fired once per completed field during field-fill. */
  onField?: (field: ExtractedField) => void;
  signal?: AbortSignal;
}

export interface ExtractedField {
  path: string;
  value: unknown;
  confidence: import("@redrob/kernel").FieldConfidence;
  provenance: {
    page?: number;
    bbox?: [number, number, number, number];
  };
}

export interface ExtractResult {
  schemaId: string;
  fields: ExtractedField[];
  needsReview: ExtractedField[];
  raw: unknown;
  timing: {
    encodeMs_unreliable: number;
    generateMs_unreliable: number;
    totalMs: number;
  };
  tierUsed: Tier;
  /** Field-fill history rebuilds for this extract (0 on happy path). */
  rebuilds: number;
  bleedTrimmed: number;
  grammarFails: number;
  errors: number;
}

function modelsDirectory(): string | null {
  const configured = process.env.REDROB_MODELS_DIR?.trim();
  return configured || null;
}

async function sourceText(source: ExtractInput["source"]): Promise<string> {
  if (source.kind === "text") return source.content;
  if (source.kind === "image") {
    // Shared gate with PDF page renders / uploads once VLM path is live.
    await prepareImageForModel(source.buffer);
    throw new Error("image provenance bbox path not wired; refusing silent extract.");
  }
  return decodeSourceFile(source.path);
}

async function probeLocalModel(tier: Tier): Promise<{ modelPath: string } | null> {
  const modelsDir = modelsDirectory();
  if (!modelsDir) return null;
  try {
    process.env.REDROB_MODELS_DIR = modelsDir;
    await detectDeviceProfile().catch(() => undefined);
    const plan = await applyExecutionPlan({ memTier: tier, skipBackendProbe: true });
    await access(plan.modelPath, constants.R_OK);
    return { modelPath: plan.modelPath };
  } catch {
    return null;
  }
}

export async function extract(input: ExtractInput): Promise<ExtractResult> {
  const startedAt = performance.now();
  if (input.signal?.aborted) {
    throw new Error("Extract cancelled");
  }
  const schema = loadSchema(input.schemaId);
  const specs = schemaFieldsToSlotSpecs(schema.fields);
  const fillable = slotFieldsToFillable(specs);
  if (fillable.length === 0) {
    throw new Error(`Schema ${schema.id} has no fillable fields`);
  }

  const packTier = (process.env.REDROB_PACK_TIER as Tier | undefined) ?? DEFAULT_LOCAL_PACK_TIER;
  const tier = input.tierOverride ?? packTier;
  const text = await sourceText(input.source);
  const local = await probeLocalModel(tier);
  const route = resolveInferenceRoute({
    mode: readInferenceRouteFromEnv(),
    providers: readLlmProvidersFromEnv(),
    localAvailable: Boolean(local),
    redrobAvailable: redrobAvailableFromEnv(),
    workload: { kind: "fieldFill", text },
  });

  const onField =
    input.onField &&
    ((field: { path: string; value: unknown; confidence: ExtractedField["confidence"] }) => {
      input.onField?.({
        path: field.path,
        value: field.value,
        confidence: field.confidence,
        provenance: {},
      });
    });

  let filled: Awaited<ReturnType<typeof generateFieldFill>>;
  if (route.provider === "local") {
    if (!local) throw new Error("Local model is not available for extract");
    filled = await generateFieldFill({
      modelPath: local.modelPath,
      document: text,
      fields: fillable,
      ...(onField ? { onField } : {}),
    });
  } else if (route.provider === "redrob_remote") {
    filled = await generateFieldFillRemote({
      document: text,
      fields: fillable,
      schemaOrRubricId: schema.id,
      ...(onField ? { onField } : {}),
    });
  } else {
    filled = await generateFieldFillCloud({
      provider: route.provider,
      model: route.model,
      providers: readLlmProvidersFromEnv(),
      document: text,
      fields: fillable,
      ...(onField ? { onField } : {}),
    });
  }

  const fields: ExtractedField[] = filled.fields.map((field) => ({
    path: field.path,
    value: field.value,
    confidence: field.confidence,
    provenance: {},
  }));

  const thresholds = Object.fromEntries(
    schema.fields.flatMap((field) =>
      field.threshold === undefined ? [] : [[field.path, field.threshold]],
    ),
  );
  const { needsReview } = partitionNeedsReview(fields, schema.confidenceThreshold, thresholds);
  const totalMs = performance.now() - startedAt;
  return {
    schemaId: schema.id,
    fields,
    needsReview,
    raw: filled.raw,
    timing: {
      encodeMs_unreliable: 0,
      generateMs_unreliable: totalMs,
      totalMs,
    },
    tierUsed: tier,
    rebuilds: filled.rebuilds ?? 0,
    bleedTrimmed: filled.bleedTrimmed ?? 0,
    grammarFails: filled.grammarFails ?? 0,
    errors: filled.errors ?? 0,
  };
}
