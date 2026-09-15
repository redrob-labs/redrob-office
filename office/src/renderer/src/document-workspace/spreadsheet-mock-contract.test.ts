import { describe, expect, it } from "vitest";
import { createMockOfficeApi } from "../desk-bridge";

/**
 * SpreadsheetEditor loads via docRenderModel and refuses anything that is not
 * kind:"xlsx". The browser mock must honour that for Documents create → edit →
 * save → reopen to work outside Electron.
 */
describe("browser mock spreadsheet contract", () => {
  it("createDocument(xlsx) renders as an xlsx model and survives save+reopen", async () => {
    const office = createMockOfficeApi();
    const created = await office.createDocument({ format: "xlsx", title: "Grid" });
    expect(created.contentFile.endsWith(".xlsx")).toBe(true);

    const first = await office.docRenderModel(created.absolutePath);
    expect(first.kind).toBe("xlsx");
    if (first.kind !== "xlsx") return;
    expect(first.sheets.length).toBeGreaterThan(0);
    const sheet = first.sheets[0]!.name;

    const saved = await office.updateSpreadsheetArtifact({
      id: created.id,
      sheet,
      changes: [{ row: 1, column: 1, value: "hello" }],
      baseRevision: created.revision,
    });

    const listed = await office.listArtifacts();
    expect(listed.some((item) => item.id === created.id)).toBe(true);

    const reopened = await office.getArtifact(created.id);
    expect(reopened).not.toBeNull();
    expect(reopened!.absolutePath).toBe(saved.absolutePath);

    const second = await office.docRenderModel(reopened!.absolutePath);
    expect(second.kind).toBe("xlsx");
    if (second.kind !== "xlsx") return;
    expect(second.sheets[0]?.rows[0]?.cells[0]?.text).toBe("hello");
  });
});
