import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { logCorrection, openStore, requiredStoreTables, upsertDocument, upsertField } from "./index.js";

describe("requiredStoreTables", () => {
  it("includes corrections as a first-class table", () => {
    expect(requiredStoreTables()).toContain("corrections");
  });
});

describe("corrections", () => {
  it("preserves the field confidence from before the human edit", () => {
    const directory = mkdtempSync(join(tmpdir(), "redrob-store-"));
    const store = openStore(join(directory, "store.sqlite"));
    try {
      upsertDocument(store, {
        id: "doc_1", path: "/tmp/resume.pdf", contentHash: "hash", schemaId: "recruiting/resume",
        extractedAt: "2026-08-04T00:00:00.000Z", tierUsed: "T8",
      });
      upsertField(store, {
        id: "field_1", documentId: "doc_1", pointer: "/name", value: "Model Name",
        confidenceScore: 0.91, confidenceJson: '{"score":0.91}',
      });
      const correction = logCorrection(store, {
        id: "correction_1", fieldId: "field_1", modelValue: "Model Name", humanValue: "Human Name",
        correctedAt: "2026-08-04T00:01:00.000Z", schemaId: "recruiting/resume", modelId: "model_1", tier: "T8",
      });
      expect(correction.confidenceAtCorrection).toBe(0.91);
      expect(correction.confidenceJson).toBe('{"score":0.91}');
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
