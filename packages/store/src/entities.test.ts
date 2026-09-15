import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findDuplicateDocumentIds,
  linkEntity,
  openStore,
  upsertDocument,
} from "./index.js";
import { phoneticNormalize } from "./identity.js";

describe("identity blocking", () => {
  it("normalises name token order for blocking keys", () => {
    expect(phoneticNormalize("Priya Sharma")).toBe(phoneticNormalize("Sharma Priya"));
  });

  it("links three source docs for the same blocked person as one entity", () => {
    const directory = mkdtempSync(join(tmpdir(), "redrob-entities-"));
    const store = openStore(join(directory, "store.sqlite"));
    try {
      for (const id of ["doc_a", "doc_b", "doc_c"]) {
        upsertDocument(store, {
          id,
          path: `/tmp/${id}.txt`,
          contentHash: id,
          schemaId: "recruiting/resume",
          extractedAt: "2026-08-04T00:00:00.000Z",
          tierUsed: "T8",
        });
      }
      const a = linkEntity(store, {
        displayName: "Asha Patel",
        dob: "1994-02-01",
        phone: "+91 98765 43210",
        documentId: "doc_a",
      });
      const b = linkEntity(store, {
        displayName: "Patel Asha",
        dob: "1994-02-01",
        phone: "9876543210",
        documentId: "doc_b",
      });
      const c = linkEntity(store, {
        displayName: "asha patel",
        dob: "1994-02-01",
        phone: "3210",
        documentId: "doc_c",
      });
      expect(a.entityId).toBe(b.entityId);
      expect(b.entityId).toBe(c.entityId);
      expect(a.method).toBe("exact_block");
      expect(findDuplicateDocumentIds(store.db, a.entityId).sort()).toEqual([
        "doc_a",
        "doc_b",
        "doc_c",
      ]);
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
