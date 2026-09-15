import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openStore, upsertDocument, upsertField } from "@redrob/store";
import { correctField } from "./corrections.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("correctField", () => {
  it("logs the original model value and confidence before marking the field reviewed", () => {
    const directory = mkdtempSync(join(tmpdir(), "redrob-correction-"));
    temporaryDirectories.push(directory);
    const store = openStore(join(directory, "redrob.sqlite"));
    upsertDocument(store, {
      id: "document-1",
      path: "/private/resume.pdf",
      contentHash: "hash",
      schemaId: "recruiting/resume",
      extractedAt: "2026-08-04T00:00:00.000Z",
      tierUsed: "T8",
    });
    upsertField(store, {
      id: "field-1",
      documentId: "document-1",
      pointer: "/name",
      value: "Ami",
      confidenceScore: 0.61,
      confidenceJson: "{\"score\":0.61}",
    });

    const result = correctField(store, {
      fieldId: "field-1",
      value: "Ami Patel",
      schemaId: "recruiting/resume",
      modelId: "qwen35-4b-q4",
      tier: "T8",
    });
    store.close();

    expect(result.field).toMatchObject({
      value: "Ami Patel",
      confidenceScore: 0.61,
      reviewed: true,
    });
    expect(result.correction).toMatchObject({
      fieldId: "field-1",
      modelValue: "Ami",
      humanValue: "Ami Patel",
      confidenceAtCorrection: 0.61,
      confidenceJson: "{\"score\":0.61}",
      schemaId: "recruiting/resume",
      modelId: "qwen35-4b-q4",
      tier: "T8",
    });
  });
});
