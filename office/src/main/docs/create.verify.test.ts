import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { closeDocSession, configureDocSessions } from "./session.js";
import { executeComputerTool } from "../tools/registry.js";
import { runToolWithDocPreview } from "../services/chat.js";
import type { CanonicalExecPlan } from "../security/types.js";
import type { ToolContext } from "../tools/types.js";

/**
 * A document from nothing to something, through the tools alone.
 *
 * Every other document test starts by writing a fixture file itself, which
 * quietly assumed the hard part — a task asked to "make me a spreadsheet" had
 * no way to begin, because every tool needed a file that already existed. This
 * walks the whole path a task actually takes: create, open, fill, and read
 * back what is now in the file.
 */

let root = "";
let workspace = "";

function ctx(): ToolContext {
  return { allowedPaths: [workspace], userDataPath: root };
}

async function applyWrite(
  tool: string,
  args: Record<string, unknown>,
): Promise<void> {
  const dry = await executeComputerTool(tool, { ...args, dryRun: true }, ctx());
  expect(dry.result.ok, `${tool} dry run: ${dry.result.error ?? ""}`).toBe(
    true,
  );
  const plan = (dry.result.data as { plan: CanonicalExecPlan }).plan;
  const applied = await executeComputerTool(
    tool,
    { ...args, dryRun: false },
    { ...ctx(), approvedExecPlan: plan },
  );
  expect(
    applied.result.ok,
    `${tool} apply: ${applied.result.error ?? ""}`,
  ).toBe(true);
}

function setUp(): void {
  root = mkdtempSync(join(tmpdir(), "doc-create-"));
  workspace = join(root, "workspace");
  mkdirSync(workspace, { recursive: true });
  // Documents made by name go to the redrob folder; keep this run out of the
  // real one.
  process.env.REDROB_ARTIFACTS_DIR = join(root, "redrob-artifacts");
  configureDocSessions(root);
}

afterEach(() => {
  delete process.env.REDROB_ARTIFACTS_DIR;
  if (root) rmSync(root, { recursive: true, force: true });
  root = "";
});

describe("doc.create", () => {
  it("makes a spreadsheet a task can then fill in and read back", async () => {
    setUp();
    const path = join(workspace, "totals.xlsx");

    const created = await executeComputerTool("doc.create", { path }, ctx());
    expect(created.result.ok).toBe(true);
    expect(existsSync(path)).toBe(true);

    const opened = await executeComputerTool("doc.open", { path }, ctx());
    expect(opened.result.ok).toBe(true);
    const sessionId = (opened.result.data as { sessionId: string }).sessionId;

    await applyWrite("sheet.writeRange", {
      sessionId,
      sheet: "Sheet1",
      start: "A1",
      values: [
        ["Region", "Revenue"],
        ["North", 120],
        ["South", 95],
      ],
    });

    const read = await executeComputerTool(
      "doc.readRange",
      { sessionId, sheet: "Sheet1", range: "A1:B3" },
      ctx(),
    );
    expect(read.result.ok).toBe(true);
    expect(JSON.stringify(read.result.data)).toContain("Revenue");
    expect(JSON.stringify(read.result.data)).toContain("North");

    await closeDocSession(sessionId);
  });

  /**
   * doc.create's own advice for a name that is taken is "open it with doc.open",
   * and doc.open used to refuse a name — so runs guessed folders instead.
   */
  it("opens a document by the name it was created with", async () => {
    setUp();
    const { configureArtifacts } = await import("../services/artifacts.js");
    configureArtifacts(workspace, workspace);
    const created = await executeComputerTool("doc.create", { name: "by-name.xlsx" }, ctx());
    expect(created.result.ok, created.result.error ?? "").toBe(true);

    const opened = await executeComputerTool(
      "doc.open",
      { path: "by-name.xlsx" },
      { ...ctx(), allowedPaths: [workspace, process.env.REDROB_ARTIFACTS_DIR!] },
    );
    expect(opened.result.ok, opened.result.error ?? "").toBe(true);
    await closeDocSession((opened.result.data as { sessionId: string }).sessionId);

    const again = await executeComputerTool("doc.create", { name: "by-name.xlsx" }, ctx());
    expect(again.result.ok).toBe(false);
    expect(again.result.error).toMatch(/already exists at .*by-name\.xlsx/);
    expect(again.result.error).toMatch(/doc\.open with "by-name\.xlsx"/);
  });

  it("fills a spreadsheet the way chat calls the tools, with no plan of its own", async () => {
    setUp();
    const path = join(workspace, "chat-written.xlsx");
    await executeComputerTool("doc.create", { path }, ctx());
    const opened = await executeComputerTool("doc.open", { path }, ctx());
    const sessionId = (opened.result.data as { sessionId: string }).sessionId;

    // What the model sends: no dryRun, no exec plan. Before chat previewed for
    // itself this failed with "call with dryRun first" however often it retried,
    // so the spreadsheet stayed empty and the comparison arrived as prose.
    const written = await runToolWithDocPreview(
      "sheet.writeRange",
      {
        sessionId,
        sheet: "Sheet1",
        start: "A1",
        values: [
          ["Company", "Remote"],
          ["Cloudbeds", "yes"],
        ],
      },
      ctx(),
    );
    expect(written.ok, written.error ?? "").toBe(true);

    const charted = await runToolWithDocPreview(
      "sheet.chart",
      { sessionId, sheet: "Sheet1", type: "bar", dataRange: "A1:B2", title: "Remote" },
      ctx(),
    );
    expect(charted.ok, charted.error ?? "").toBe(true);
    await closeDocSession(sessionId);

    const zip = await JSZip.loadAsync(readFileSync(path));
    const sheet = await zip.file("xl/worksheets/sheet1.xml")?.async("string");
    const strings = await zip.file("xl/sharedStrings.xml")?.async("string");
    expect(sheet).toContain('<row r="2"');
    expect(strings).toContain("Cloudbeds");
    expect(zip.file("xl/charts/chart1.xml"), "chart part missing").toBeTruthy();
  });

  it("puts the numbers and their labels inside the chart, not only a reference", async () => {
    setUp();
    const path = join(workspace, "chart.xlsx");
    await executeComputerTool("doc.create", { path }, ctx());
    const opened = await executeComputerTool("doc.open", { path }, ctx());
    const sessionId = (opened.result.data as { sessionId: string }).sessionId;

    await applyWrite("sheet.writeRange", {
      sessionId,
      sheet: "Sheet1",
      start: "A1",
      values: [
        ["Region", "Revenue"],
        ["North", 120],
        ["South", 95],
      ],
    });
    // The whole table, labels and header included — which is how a person
    // describes a table, and therefore what a model asks for.
    await applyWrite("sheet.chart", {
      sessionId,
      sheet: "Sheet1",
      type: "bar",
      dataRange: "A1:B3",
      title: "Revenue",
    });
    await closeDocSession(sessionId);

    // A chart that only points at a range draws as empty axes wherever the
    // reference is not resolved for it — which is every converter.
    const zip = await JSZip.loadAsync(readFileSync(path));
    const chart = await zip.file("xl/charts/chart1.xml")?.async("string");
    expect(chart, "chart part missing").toBeTruthy();
    expect(chart).toContain("<c:numCache>");
    expect(chart).toContain("<c:v>120</c:v>");
    expect(chart).toContain("<c:v>95</c:v>");
    expect(chart).toContain("North");
    expect(chart).toContain("South");
    // The header names the series rather than being plotted as a bar.
    expect(chart).toContain("Revenue");
    expect(chart).not.toContain("<c:v>Region</c:v>");
  });

  it("also charts a range that is only the numbers", async () => {
    setUp();
    const path = join(workspace, "narrow.xlsx");
    await executeComputerTool("doc.create", { path }, ctx());
    const opened = await executeComputerTool("doc.open", { path }, ctx());
    const sessionId = (opened.result.data as { sessionId: string }).sessionId;
    await applyWrite("sheet.writeRange", {
      sessionId,
      sheet: "Sheet1",
      start: "A1",
      values: [
        ["Region", "Revenue"],
        ["North", 120],
        ["South", 95],
      ],
    });
    await applyWrite("sheet.chart", {
      sessionId,
      sheet: "Sheet1",
      type: "bar",
      dataRange: "B2:B3",
      title: "Revenue",
    });
    await closeDocSession(sessionId);

    const zip = await JSZip.loadAsync(readFileSync(path));
    const chart = await zip.file("xl/charts/chart1.xml")?.async("string");
    expect(chart).toContain("<c:v>120</c:v>");
    // Labels come from the column beside the numbers when the range is one wide.
    expect(chart).toContain("North");
  });

  it("files a document by name with the rest of them, ready to edit in place", async () => {
    setUp();
    const artifacts = await import("../services/artifacts.js");
    artifacts.configureArtifacts(root, root);

    const created = await executeComputerTool(
      "doc.create",
      { name: "totals.xlsx", title: "Totals" },
      ctx(),
    );
    expect(created.result.ok, created.result.error ?? "").toBe(true);
    const data = created.result.data as { path: string };
    // A file in the documents folder, named the way it was asked for, rather
    // than buried in a folder named after a uuid.
    expect(data.path).toBe(join(artifacts.artifactsDirPath(), "totals.xlsx"));

    // Announced, so the app can open it without being told to go looking.
    const artifactId = created.result.artifactId;
    expect(artifactId).toBeTruthy();

    const listed = await artifacts.listArtifacts();
    expect(listed.map((a) => a.id)).toContain(artifactId);
    expect(listed.find((a) => a.id === artifactId)?.title).toBe("totals");

    // The file the task edits is the document itself, not a copy of it: what
    // it writes next is what the person is looking at.
    const view = await artifacts.getArtifact(artifactId!);
    expect(view?.absolutePath).toBe(data.path);

    const opened = await executeComputerTool(
      "doc.open",
      { path: data.path },
      { allowedPaths: [artifacts.artifactsDirPath()], userDataPath: root },
    );
    expect(opened.result.ok, opened.result.error ?? "").toBe(true);
    await closeDocSession(
      (opened.result.data as { sessionId: string }).sessionId,
    );
  });

  it("says so when a document is closed with nothing written into it", async () => {
    setUp();
    const path = join(workspace, "unfilled.xlsx");
    await executeComputerTool("doc.create", { path }, ctx());
    const opened = await executeComputerTool("doc.open", { path }, ctx());
    const sessionId = (opened.result.data as { sessionId: string }).sessionId;

    const closed = await executeComputerTool("doc.close", { sessionId }, ctx());
    expect(closed.result.ok).toBe(true);
    expect(closed.result.summary).toMatch(/still an empty document/);
  });

  it("closes quietly once something has been written", async () => {
    setUp();
    const path = join(workspace, "filled.xlsx");
    await executeComputerTool("doc.create", { path }, ctx());
    const opened = await executeComputerTool("doc.open", { path }, ctx());
    const sessionId = (opened.result.data as { sessionId: string }).sessionId;
    await applyWrite("sheet.writeRange", {
      sessionId,
      sheet: "Sheet1",
      start: "A1",
      values: [["Region", "Revenue"]],
    });

    const closed = await executeComputerTool("doc.close", { sessionId }, ctx());
    expect(closed.result.summary).not.toMatch(/empty document/);
  });

  it("refuses a name that is really a path", async () => {
    setUp();
    const created = await executeComputerTool(
      "doc.create",
      { name: "../escape.md" },
      ctx(),
    );
    expect(created.result.ok).toBe(false);
    expect(created.result.error).toMatch(/path, not a name/);
  });

  it("keeps the chart when the sheet under it is edited again", async () => {
    setUp();
    const path = join(workspace, "kept.xlsx");
    await executeComputerTool("doc.create", { path }, ctx());
    const first = await executeComputerTool("doc.open", { path }, ctx());
    let sessionId = (first.result.data as { sessionId: string }).sessionId;
    await applyWrite("sheet.writeRange", {
      sessionId,
      sheet: "Sheet1",
      start: "A1",
      values: [
        ["Region", "Revenue"],
        ["North", 120],
        ["South", 95],
      ],
    });
    await applyWrite("sheet.chart", {
      sessionId,
      sheet: "Sheet1",
      type: "bar",
      dataRange: "A1:B3",
      title: "Revenue",
    });
    await closeDocSession(sessionId);

    // The edit a task makes next, on a workbook that now has a chart on it.
    const second = await executeComputerTool("doc.open", { path }, ctx());
    sessionId = (second.result.data as { sessionId: string }).sessionId;
    await applyWrite("sheet.writeRange", {
      sessionId,
      sheet: "Sheet1",
      start: "A4",
      values: [["East", 140]],
    });
    await applyWrite("sheet.writeRange", {
      sessionId,
      sheet: "Sheet1",
      start: "B3",
      values: [[200]],
    });
    await closeDocSession(sessionId);

    const zip = await JSZip.loadAsync(readFileSync(path));
    const chart = await zip.file("xl/charts/chart1.xml")?.async("string");
    expect(chart, "chart was dropped by the edit").toBeTruthy();
    const sheet = await zip.file("xl/worksheets/sheet1.xml")?.async("string");
    expect(sheet, "sheet lost its link to the drawing").toContain("<drawing ");
    // The chart carries its numbers, so the edit has to reach them too.
    expect(chart).toContain("<c:v>200</c:v>");
    expect(chart).not.toContain("<c:v>95</c:v>");
  });

  it("makes a document, and a deck, that open as what they claim to be", async () => {
    setUp();
    for (const [file, expected] of [
      ["memo.docx", "docx"],
      ["deck.pptx", "pptx"],
    ] as const) {
      const path = join(workspace, file);
      const created = await executeComputerTool(
        "doc.create",
        { path, title: "Q3" },
        ctx(),
      );
      expect(created.result.ok, created.result.error ?? "").toBe(true);

      const opened = await executeComputerTool("doc.open", { path }, ctx());
      expect(opened.result.ok, opened.result.error ?? "").toBe(true);
      const data = opened.result.data as {
        sessionId: string;
        outline: { format: string };
      };
      expect(data.outline.format).toBe(expected);
      await closeDocSession(data.sessionId);
    }
  });

  it("writes markdown as text rather than as a zip", async () => {
    setUp();
    const path = join(workspace, "notes.md");
    const created = await executeComputerTool(
      "doc.create",
      { path, title: "Notes" },
      ctx(),
    );
    expect(created.result.ok).toBe(true);

    const read = await executeComputerTool("fs.read", { path }, ctx());
    expect((read.result.data as { content: string }).content).toContain(
      "# Notes",
    );
  });

  it("refuses to write over something that is already there", async () => {
    setUp();
    const path = join(workspace, "taken.xlsx");
    writeFileSync(path, "not really a spreadsheet");

    const created = await executeComputerTool("doc.create", { path }, ctx());
    expect(created.result.ok).toBe(false);
    expect(created.result.error).toMatch(/already exists/);
    // The file it refused to make is the file it left alone.
    expect(existsSync(path)).toBe(true);
  });

  it("says so rather than guessing when the extension means nothing", async () => {
    setUp();
    const created = await executeComputerTool(
      "doc.create",
      { path: join(workspace, "mystery.rtf") },
      ctx(),
    );
    expect(created.result.ok).toBe(false);
    expect(created.result.error).toMatch(/\.docx/);
  });

  it("will not create outside an allowed folder", async () => {
    setUp();
    const created = await executeComputerTool(
      "doc.create",
      { path: join(root, "outside.xlsx") },
      ctx(),
    );
    expect(created.result.ok).toBe(false);
    expect(existsSync(join(root, "outside.xlsx"))).toBe(false);
  });
});
