import { readFile, writeFile } from "node:fs/promises";

import type { Tier } from "@redrob/kernel";

const CONCURRENCY: Record<Tier, number> = { T4: 1, T8: 2, T16: 3 };

export interface BatchRunState {
  completed: string[];
  failed: Record<string, string>;
}

export interface BatchResult<T> {
  results: Map<string, T>;
  errors: Map<string, Error>;
  state: BatchRunState;
}

async function loadState(path: string): Promise<BatchRunState> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (
      value !== null &&
      typeof value === "object" &&
      Array.isArray((value as { completed?: unknown }).completed) &&
      (value as { failed?: unknown }).failed !== null &&
      typeof (value as { failed?: unknown }).failed === "object"
    ) {
      return value as BatchRunState;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return { completed: [], failed: {} };
}

export async function runBatch<T>(
  itemIds: readonly string[],
  tier: Tier,
  runStatePath: string,
  work: (itemId: string) => Promise<T>,
): Promise<BatchResult<T>> {
  const state = await loadState(runStatePath);
  const completed = new Set(state.completed);
  const pending = itemIds.filter((itemId) => !completed.has(itemId));
  const results = new Map<string, T>();
  const errors = new Map<string, Error>();
  let next = 0;

  const persist = async (): Promise<void> => {
    await writeFile(runStatePath, JSON.stringify(state, null, 2), "utf8");
  };
  const worker = async (): Promise<void> => {
    while (true) {
      const itemId = pending[next++];
      if (itemId === undefined) return;
      try {
        results.set(itemId, await work(itemId));
        state.completed.push(itemId);
      } catch (error) {
        const itemError = error instanceof Error ? error : new Error(String(error));
        errors.set(itemId, itemError);
        state.failed[itemId] = itemError.message;
      }
      await persist();
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY[tier] }, () => worker()));
  return { results, errors, state };
}
