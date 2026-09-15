import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

/**
 * Documents belong in the redrob folder, beside the models: what a person made
 * outlives any one version of the app, and the app's own settings folder is on
 * Linux a place the file tools refuse to touch.
 */

let home = "";
let userData = "";

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "artifacts-home-"));
  userData = join(home, "settings");
  mkdirSync(userData, { recursive: true });
  process.env.REDROB_ARTIFACTS_DIR = join(home, "redrob", "artifacts");
});

afterEach(() => {
  delete process.env.REDROB_ARTIFACTS_DIR;
  if (home) rmSync(home, { recursive: true, force: true });
  home = "";
});

async function load(): Promise<typeof import("./artifacts.js")> {
  // Fresh module per test: the root is module state, set at configure time.
  vi.resetModules();
  return import("./artifacts.js");
}

describe("configureArtifacts", () => {
  it("files documents where an explicit root says, so tests stay off the real shelf", async () => {
    const mod = await load();
    const elsewhere = join(home, "somewhere-else");
    expect(mod.configureArtifacts(userData, elsewhere)).toBe(elsewhere);
    const saved = await mod.saveArtifact({
      kind: "other",
      title: "Kept aside",
      body: "# Kept aside\n",
    });
    expect(saved.absolutePath.startsWith(elsewhere)).toBe(true);
    expect(existsSync(join(home, "redrob", "artifacts", saved.id))).toBe(false);
  });

  it("keeps documents in the redrob folder rather than under app settings", async () => {
    const mod = await load();
    const root = mod.configureArtifacts(userData);
    expect(root).toBe(join(home, "redrob", "artifacts"));
    expect(existsSync(root)).toBe(true);
    expect(existsSync(join(userData, "artifacts"))).toBe(false);
  });

  it("moves documents saved at the old address across, once", async () => {
    const legacy = join(userData, "artifacts", "abc");
    mkdirSync(legacy, { recursive: true });
    writeFileSync(
      join(legacy, "meta.json"),
      JSON.stringify({
        id: "abc",
        kind: "report",
        title: "Old",
        createdAt: "2026-01-01T00:00:00.000Z",
        contentFile: "content.md",
        encoding: "utf8",
      }),
    );
    writeFileSync(join(legacy, "content.md"), "# Old\n");

    const mod = await load();
    const root = mod.configureArtifacts(userData);
    expect(existsSync(join(root, "abc", "content.md"))).toBe(true);
    expect(existsSync(legacy)).toBe(false);

    const found = await mod.getArtifact("abc");
    expect(found?.title).toBe("Old");
  });

  it("leaves a document alone when one of the same name is already there", async () => {
    const legacy = join(userData, "artifacts", "abc");
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, "content.md"), "old\n");
    const current = join(home, "redrob", "artifacts", "abc");
    mkdirSync(current, { recursive: true });
    writeFileSync(join(current, "content.md"), "current\n");

    const mod = await load();
    mod.configureArtifacts(userData);
    expect(existsSync(join(legacy, "content.md"))).toBe(true);
  });
});

describe("a file in the documents folder", () => {
  it("is a document, without a folder or a meta file around it", async () => {
    const mod = await load();
    const root = mod.configureArtifacts(userData);
    writeFileSync(join(root, "plan.md"), "# Plan\n\nShip it.\n");

    const listed = await mod.listArtifacts();
    expect(listed.map((a) => a.title)).toEqual(["plan"]);

    const id = listed[0]!.id;
    const view = await mod.getArtifact(id);
    expect(view?.body).toContain("Ship it.");
    expect(view?.absolutePath).toBe(join(root, "plan.md"));
    expect(view?.encoding).toBe("utf8");
  });

  it("is listed beside the ones that do have folders", async () => {
    const mod = await load();
    const root = mod.configureArtifacts(userData);
    writeFileSync(join(root, "loose.md"), "# Loose\n");
    const saved = await mod.saveArtifact({
      kind: "report",
      title: "Filed",
      body: "# Filed\n",
    });

    const ids = (await mod.listArtifacts()).map((a) => a.id);
    expect(ids).toContain(saved.id);
    expect(ids.some((id) => id.startsWith("file:"))).toBe(true);
  });

  it("edits in place and deletes as itself", async () => {
    const mod = await load();
    const root = mod.configureArtifacts(userData);
    writeFileSync(join(root, "notes.md"), "# Notes\n");
    const id = mod.looseArtifactId("notes.md");

    await mod.updateArtifact({ id, body: "# Notes\n\nEdited.\n" });
    expect((await mod.getArtifact(id))?.body).toContain("Edited.");

    expect(await mod.deleteArtifact(id)).toBe(true);
    expect(existsSync(join(root, "notes.md"))).toBe(false);
  });

  it("rejects a stale markdown save instead of overwriting external changes", async () => {
    const mod = await load();
    const root = mod.configureArtifacts(userData);
    const path = join(root, "notes.md");
    writeFileSync(path, "# Notes\n");
    const id = mod.looseArtifactId("notes.md");
    const opened = await mod.getArtifact(id);
    expect(opened).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 5));
    writeFileSync(path, "# Changed elsewhere\n");

    await expect(
      mod.updateArtifact({
        id,
        body: "# My stale edit\n",
        baseRevision: opened!.revision,
      }),
    ).rejects.toMatchObject({ code: "artifact_conflict" });
    expect((await mod.getArtifact(id))?.body).toContain("Changed elsewhere");
  });

  it("updates selected xlsx cells and preserves the rest of the workbook", async () => {
    const mod = await load();
    const root = mod.configureArtifacts(userData);
    const path = join(root, "scores.xlsx");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Scores");
    sheet.addRow(["Name", "Score"]);
    sheet.addRow(["Ada", 4]);
    await workbook.xlsx.writeFile(path);
    const id = mod.looseArtifactId("scores.xlsx");
    const opened = await mod.getArtifact(id);
    expect(opened).not.toBeNull();

    await mod.updateSpreadsheetArtifact({
      id,
      sheet: "Scores",
      changes: [{ row: 2, column: 2, value: "5" }],
      baseRevision: opened!.revision,
    });

    const checked = new ExcelJS.Workbook();
    await checked.xlsx.readFile(path);
    expect(checked.getWorksheet("Scores")?.getCell(1, 1).value).toBe("Name");
    expect(checked.getWorksheet("Scores")?.getCell(2, 2).value).toBe(5);
  });

  it("keeps a newly created workbook renderable as xlsx after save", async () => {
    const mod = await load();
    mod.configureArtifacts(userData);
    const { createBlankDocument } = await import("./create-document.js");
    const { buildRenderModel } = await import("../docs/render/model.js");

    const created = await createBlankDocument({
      format: "xlsx",
      title: "Fresh grid",
    });
    expect((await buildRenderModel(created.absolutePath)).kind).toBe("xlsx");

    const saved = await mod.updateSpreadsheetArtifact({
      id: created.id,
      sheet: "Sheet1",
      changes: [
        { row: 1, column: 1, value: "Hello" },
        { row: 1, column: 2, value: "7" },
      ],
      baseRevision: created.revision,
    });
    const rendered = await buildRenderModel(saved.absolutePath);
    expect(rendered.kind).toBe("xlsx");
    if (rendered.kind === "xlsx") {
      expect(rendered.sheets[0]?.rows[0]?.cells[0]?.text).toBe("Hello");
      expect(rendered.sheets[0]?.rows[0]?.cells[1]?.text).toBe("7");
    }
    const reopened = await mod.getArtifact(created.id);
    expect(reopened).not.toBeNull();
    expect((await buildRenderModel(reopened!.absolutePath)).kind).toBe("xlsx");
  });

  it("does not guess what a file dropped in the folder is", async () => {
    const mod = await load();
    const root = mod.configureArtifacts(userData);
    writeFileSync(join(root, "espresso-deck.html"), "<!doctype html><title>Deck</title>");

    const [listed] = await mod.listArtifacts();
    expect(listed?.title).toBe("espresso-deck");
    expect(listed?.kind).toBe("other");
  });

  it("ignores what is not a document", async () => {
    const mod = await load();
    const root = mod.configureArtifacts(userData);
    writeFileSync(join(root, ".DS_Store"), "junk");
    writeFileSync(join(root, "~$draft.docx"), "lock");
    writeFileSync(join(root, "notes.bin"), "bytes");

    expect(await mod.listArtifacts()).toEqual([]);
  });

  it("cannot be asked for by a name that climbs out of the folder", async () => {
    const mod = await load();
    mod.configureArtifacts(userData);
    writeFileSync(join(home, "secret.md"), "# Secret\n");
    expect(await mod.getArtifact("file:../secret.md")).toBeNull();
  });
});

describe("artifactIdForPath", () => {
  it("recognises the document a file inside the folder belongs to", async () => {
    const mod = await load();
    mod.configureArtifacts(userData);
    const saved = await mod.saveArtifact({
      kind: "report",
      title: "Sales",
      body: "# Sales\n",
      contentFile: "sales.md",
    });
    expect(mod.artifactIdForPath(saved.absolutePath)).toBe(saved.id);
  });

  it("recognises a document written straight into the folder", async () => {
    const mod = await load();
    const root = mod.configureArtifacts(userData);
    writeFileSync(join(root, "report.xlsx"), "x");
    expect(mod.artifactIdForPath(join(root, "report.xlsx"))).toBe(
      mod.looseArtifactId("report.xlsx"),
    );
  });

  it("claims nothing for a file that is merely nearby", async () => {
    const mod = await load();
    const root = mod.configureArtifacts(userData);
    expect(mod.artifactIdForPath(join(root, "absent.md"))).toBeNull();
    expect(mod.artifactIdForPath(join(home, "elsewhere.md"))).toBeNull();
    expect(mod.artifactIdForPath(join(root, "..", "escape.md"))).toBeNull();
  });
});
