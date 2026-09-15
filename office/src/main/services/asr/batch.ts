import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { nowIso } from "../../app-time.js";
import { hostTranscribeAsr, type AsrTranscription } from "./asr-host.js";
import type { TranscriptDocument } from "./types.js";

export type AsrBatchItemState = "queued" | "running" | "done" | "error";

export interface AsrBatchItem {
  id: string;
  state: AsrBatchItemState;
  createdAt: string;
  updatedAt: string;
  sourcePath: string;
  language: string;
  modelTier: "small" | "turbo";
  consentId?: string;
  /** v1 uses one conceptual chunk until duration probing is introduced. */
  chunks: Array<{ index: number; startMs: number; endMs?: number }>;
  transcript?: TranscriptDocument;
  error?: string;
}

export type AsrTranscriber = (input: {
  path: string;
  language: string;
  modelTier: "small" | "turbo";
  trimVad?: boolean;
}) => Promise<AsrTranscription>;

export function asrBatchDir(userData: string): string {
  return join(userData, "asr-batch");
}

function itemPath(userData: string, id: string): string {
  return join(asrBatchDir(userData), `${id}.json`);
}

async function persistItem(userData: string, item: AsrBatchItem): Promise<AsrBatchItem> {
  await mkdir(asrBatchDir(userData), { recursive: true });
  await writeFile(itemPath(userData, item.id), `${JSON.stringify(item, null, 2)}\n`, "utf8");
  return item;
}

export async function createBatchItem(
  userData: string,
  input: {
    sourcePath: string;
    language: string;
    modelTier: "small" | "turbo";
    consentId?: string;
  },
): Promise<AsrBatchItem> {
  const now = nowIso();
  return persistItem(userData, {
    id: randomUUID(),
    state: "queued",
    createdAt: now,
    updatedAt: now,
    sourcePath: input.sourcePath,
    language: input.language,
    modelTier: input.modelTier,
    ...(input.consentId ? { consentId: input.consentId } : {}),
    chunks: [{ index: 0, startMs: 0 }],
  });
}

export async function listBatchItems(userData: string): Promise<AsrBatchItem[]> {
  try {
    const entries = await readdir(asrBatchDir(userData), { withFileTypes: true });
    const items = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(
          async (entry) =>
            JSON.parse(
              await readFile(join(asrBatchDir(userData), entry.name), "utf8"),
            ) as AsrBatchItem,
        ),
    );
    return items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function transcriptFromResult(result: AsrTranscription, consentId?: string): TranscriptDocument {
  const segments =
    result.segments.length > 0
      ? result.segments
      : result.text.trim()
        ? [{ startMs: 0, endMs: 0, text: result.text.trim() }]
        : [];
  return {
    lines: segments.map((segment, index) => ({
      n: index + 1,
      text: segment.text,
      startMs: segment.startMs,
      endMs: segment.endMs,
    })),
    provenance: {
      model: result.model,
      vadApplied: result.vadApplied,
      vadModel: result.vadModel,
      origin: "local",
      speechRatio: result.speechRatio,
      vadThreshold: result.vadThreshold,
    },
    ...(consentId ? { consentId } : {}),
  };
}

async function runBatchItem(
  userData: string,
  item: AsrBatchItem,
  transcribe: AsrTranscriber,
): Promise<AsrBatchItem> {
  const { error: _previousError, ...itemWithoutError } = item;
  const running = await persistItem(userData, {
    ...itemWithoutError,
    state: "running",
    updatedAt: nowIso(),
  });
  try {
    const result = await transcribe({
      path: running.sourcePath,
      language: running.language,
      modelTier: running.modelTier,
    });
    return persistItem(userData, {
      ...running,
      state: "done",
      updatedAt: nowIso(),
      transcript: transcriptFromResult(result, running.consentId),
    });
  } catch (error) {
    return persistItem(userData, {
      ...running,
      state: "error",
      updatedAt: nowIso(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Create then immediately process one item (batch UI). */
export async function startAndRunBatchItem(
  userData: string,
  input: {
    sourcePath: string;
    language: string;
    modelTier: "small" | "turbo";
    consentId?: string;
  },
  transcribe: AsrTranscriber = hostTranscribeAsr,
): Promise<AsrBatchItem> {
  const item = await createBatchItem(userData, input);
  return runBatchItem(userData, item, transcribe);
}

export async function getBatchItem(userData: string, id: string): Promise<AsrBatchItem | null> {
  try {
    return JSON.parse(await readFile(itemPath(userData, id), "utf8")) as AsrBatchItem;
  } catch {
    return null;
  }
}

/** Resume queued/running items after a restart; failed ones remain auditable. */
export async function resumeIncomplete(
  userData: string,
  transcribe: AsrTranscriber = hostTranscribeAsr,
): Promise<AsrBatchItem[]> {
  const incomplete = (await listBatchItems(userData)).filter(
    (item) => item.state === "queued" || item.state === "running",
  );
  return Promise.all(incomplete.map((item) => runBatchItem(userData, item, transcribe)));
}
