import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { extract, runBatch, type ExtractResult, isIntakeExtension } from "@redrob/extract";
import { TIERS, type Tier } from "@redrob/kernel";
import {
  appendAudit,
  createRun,
  updateRun,
  upsertDocument,
  upsertField,
  type Store,
} from "@redrob/store";
import { nowIso } from "../app-time.js";

export interface IntakeItemResult {
  path: string;
  ok: boolean;
  documentId?: string;
  fieldCount?: number;
  needsReviewCount?: number;
  error?: string;
}

export interface IntakeBatchResult {
  runId: string;
  schemaId: string;
  queued: number;
  processed: number;
  errors: number;
  items: IntakeItemResult[];
}

export interface IntakeProgressUpdate {
  processed: number;
  errors: number;
  path: string;
  queued: number;
  field?: {
    path: string;
    value: unknown;
    confidenceScore: number;
  };
}

function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function documentIdFor(path: string, hash: string): string {
  return createHash("sha256").update(`${path}\0${hash}`).digest("hex").slice(0, 32);
}

function fieldIdFor(documentId: string, pointer: string): string {
  return createHash("sha256").update(`${documentId}\0${pointer}`).digest("hex").slice(0, 32);
}

function serializeValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

export async function listTextFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.isFile() && isIntakeExtension(extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return files.sort();
}

function persistExtract(
  store: Store,
  path: string,
  text: string,
  result: ExtractResult,
): { documentId: string; fieldCount: number; needsReviewCount: number } {
  const hash = contentHash(text);
  const documentId = documentIdFor(path, hash);
  upsertDocument(store, {
    id: documentId,
    path,
    contentHash: hash,
    schemaId: result.schemaId,
    extractedAt: nowIso(),
    tierUsed: result.tierUsed,
  });

  for (const field of result.fields) {
    if (!field.confidence) {
      throw new Error(`Extracted field ${field.path} is missing confidence; refusing to persist.`);
    }
    upsertField(store, {
      id: fieldIdFor(documentId, field.path),
      documentId,
      pointer: field.path,
      value: serializeValue(field.value),
      confidenceScore: field.confidence.score,
      confidenceJson: JSON.stringify(field.confidence),
      reviewed: false,
    });
  }

  return {
    documentId,
    fieldCount: result.fields.length,
    needsReviewCount: result.needsReview.length,
  };
}

export async function runIntakeBatch(options: {
  store: Store;
  workspaceId: string;
  schemaId: string;
  filePaths: string[];
  tier?: Tier;
  /** Directory for resumable batch state (defaults to os temp under run id). */
  stateDirectory?: string;
  onProgress?: (update: IntakeProgressUpdate) => void;
  signal?: AbortSignal;
}): Promise<IntakeBatchResult> {
  const { store, workspaceId, schemaId, filePaths, tier } = options;
  const runId = randomUUID();
  const startedAt = nowIso();
  const tierStart = tier ?? "T4";
  const queued = filePaths.length;

  createRun(store, {
    id: runId,
    workspaceId,
    engine: "extract",
    startedAt,
    finishedAt: null,
    itemCount: filePaths.length,
    timingJson: null,
    tierStart,
    tierEnd: null,
    tierChanged: false,
  });

  const stateDirectory = options.stateDirectory ?? join(process.cwd(), ".redrob-intake");
  await mkdir(stateDirectory, { recursive: true });
  const runStatePath = join(stateDirectory, `${runId}.json`);

  let processed = 0;
  let errors = 0;
  let lastTier: Tier = tierStart;
  const itemsByPath = new Map<string, IntakeItemResult>();

  const batch = await runBatch(filePaths, tierStart, runStatePath, async (path) => {
    if (options.signal?.aborted) {
      throw new Error("Intake cancelled");
    }
    const result = await extract({
      source: { kind: "file", path },
      schemaId,
      ...(tier ? { tierOverride: tier } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.onProgress
        ? {
            onField: (field: {
              path: string;
              value: unknown;
              confidence: { score: number };
            }) => {
              options.onProgress?.({
                processed,
                errors,
                path,
                queued,
                field: {
                  path: field.path,
                  value: field.value,
                  confidenceScore: field.confidence.score,
                },
              });
            },
          }
        : {}),
    });
    lastTier = result.tierUsed;
    const textForHash = JSON.stringify(result.raw);
    const saved = persistExtract(store, path, textForHash, result);
    const item: IntakeItemResult = {
      path,
      ok: true,
      documentId: saved.documentId,
      fieldCount: saved.fieldCount,
      needsReviewCount: saved.needsReviewCount,
    };
    itemsByPath.set(path, item);
    processed += 1;
    options.onProgress?.({ processed, errors, path, queued });
    return result;
  });

  for (const [path, error] of batch.errors) {
    itemsByPath.set(path, {
      path,
      ok: false,
      error: error.message,
    });
  }

  processed = batch.results.size;
  errors = batch.errors.size;
  options.onProgress?.({
    processed,
    errors,
    path: filePaths[filePaths.length - 1] ?? "",
    queued,
  });

  const items = filePaths.map(
    (path) =>
      itemsByPath.get(path) ?? {
        path,
        ok: false,
        error: "Item was not processed",
      },
  );

  updateRun(store, {
    id: runId,
    workspaceId,
    engine: "extract",
    startedAt,
    finishedAt: nowIso(),
    itemCount: filePaths.length,
    timingJson: JSON.stringify({ processed, errors }),
    tierStart,
    tierEnd: lastTier,
    tierChanged: lastTier !== tierStart,
  });

  appendAudit(store, {
    id: randomUUID(),
    at: nowIso(),
    action: "intake.batch",
    payloadJson: JSON.stringify({
      runId,
      schemaId,
      queued: filePaths.length,
      processed,
      errors,
    }),
  });

  return {
    runId,
    schemaId,
    queued: filePaths.length,
    processed,
    errors,
    items,
  };
}

export function resolveTextModelId(tier: Tier): string {
  return TIERS[tier].text;
}
