import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addMemory,
  importMemories,
  listMemories,
  openStore,
  requiredStoreTables,
  updateMemory,
  deleteMemory,
} from "./index.js";

describe("requiredStoreTables", () => {
  it("includes memories", () => {
    expect(requiredStoreTables()).toContain("memories");
  });
});

describe("memories", () => {
  it("stores manual facts and imports without duplicates", () => {
    const directory = mkdtempSync(join(tmpdir(), "redrob-store-mem-"));
    const store = openStore(join(directory, "store.sqlite"));
    try {
      const first = addMemory(store, { body: " Prefer concise Korean replies. " });
      expect(first.body).toBe("Prefer concise Korean replies.");
      expect(first.source).toBe("manual");

      const imported = importMemories(store, [
        "Prefer concise Korean replies.",
        "Company is Acme.",
        "",
        "Company is Acme.",
      ]);
      expect(imported.imported).toBe(1);
      expect(imported.skipped).toBe(3);

      const listed = listMemories(store);
      expect(listed).toHaveLength(2);

      const updated = updateMemory(store, first.id, "Prefer short Korean replies.");
      expect(updated?.body).toBe("Prefer short Korean replies.");
      expect(deleteMemory(store, first.id)).toBe(true);
      expect(listMemories(store)).toHaveLength(1);
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
