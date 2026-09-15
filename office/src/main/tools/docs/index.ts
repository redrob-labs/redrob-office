import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { z } from "zod";
import { docCreateTool } from "./create.js";
import { assertAllowedPath } from "../path-policy.js";
import type { RegisteredTool, ToolResult } from "../types.js";
import {
  closeDocSession,
  commitDocOps,
  getDocSession,
  openDocSession,
  undoDocSession,
  wrapDocRead,
  ensureSheet,
} from "../../docs/session.js";
import {
  assertPlanMatchesApproval,
  buildCanonicalExecPlan,
} from "../../security/exec-policy.js";
import type { DocOp } from "../../docs/types.js";
import { XlsxAdapter } from "../../docs/adapters/xlsx-adapter.js";

function requireSession(id: string) {
  return getDocSession(id);
}

function planForDoc(tool: string, sessionPath: string, opHash: string) {
  return buildCanonicalExecPlan({
    command: tool,
    args: [opHash],
    cwd: sessionPath,
  });
}

async function runWriteTool(input: {
  tool: string;
  sessionId: string;
  ops: DocOp[];
  dryRun: boolean;
  ctx: Parameters<RegisteredTool["handler"]>[1];
}): Promise<ToolResult> {
  const session = requireSession(input.sessionId);
  const preview = await commitDocOps(input.sessionId, input.tool, input.ops, {
    dryRun: true,
  });
  const plan = planForDoc(input.tool, session.path, preview.opHash);

  if (input.dryRun) {
    return {
      ok: true,
      summary: `dryRun ${input.tool}: ${preview.diff.kind} diff (hash ${preview.opHash.slice(0, 12)})`,
      data: {
        dryRun: true,
        opHash: preview.opHash,
        diff: preview.diff,
        plan,
      },
    };
  }

  if (!input.ctx.approvedExecPlan) {
    return {
      ok: false,
      summary: "Document write requires dryRun approval plan",
      error: "Missing approvedExecPlan — call with dryRun first",
    };
  }
  try {
    assertPlanMatchesApproval(input.ctx.approvedExecPlan, plan);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, summary: message, error: message };
  }

  const committed = await commitDocOps(input.sessionId, input.tool, input.ops, {
    dryRun: false,
    expectedHash: preview.opHash,
  });
  return {
    ok: true,
    summary: `Applied ${input.tool} (hash ${committed.opHash.slice(0, 12)})`,
    data: {
      dryRun: false,
      opHash: committed.opHash,
      diff: committed.diff,
      applied: true,
    },
  };
}

/**
 * A name means the same thing to open as it does to create.
 *
 * doc.create takes `report.xlsx` and files it with the person's documents, and
 * its own advice when the file is already there is "open it with doc.open" —
 * which then refused a bare name, because it only took paths. Runs spent turns
 * apologising and guessing folders, and some abandoned the spreadsheet entirely.
 */
async function resolveDocPath(path: string): Promise<string> {
  const name = path.trim();
  if (!name || name !== basename(name)) return path;
  const { artifactsDirPath } = await import("../../services/artifacts.js");
  const inDocuments = join(artifactsDirPath(), name);
  return existsSync(inDocuments) ? inDocuments : path;
}

export const docOpenTool: RegisteredTool = {
  name: "doc.open",
  description:
    "Open an xlsx/docx/pptx for document tools. Takes a path, or the name of a document " +
    "kept with the person's other documents (the same name doc.create takes). " +
    "Returns sessionId + outline.",
  risk: "low",
  inputSchema: z.object({
    path: z.string().min(1),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    const path = assertAllowedPath(
      await resolveDocPath(input.path),
      ctx.allowedPaths,
      "doc.open",
    );
    const session = await openDocSession(path, ctx.userDataPath);
    const outline = await session.adapter.outline();
    return {
      ok: true,
      summary: `Opened ${outline.format} session ${session.id}`,
      data: {
        sessionId: session.id,
        outline,
        untrusted: wrapDocRead(`doc:${path}`, outline),
      },
    };
  },
};

export const docOutlineTool: RegisteredTool = {
  name: "doc.outline",
  description: "Return structure of an open document session.",
  risk: "low",
  inputSchema: z.object({ sessionId: z.string().min(1) }),
  async handler(input): Promise<ToolResult> {
    const session = requireSession(input.sessionId);
    const outline = await session.adapter.outline();
    return {
      ok: true,
      summary: `Outline ${outline.format}`,
      data: { outline, untrusted: wrapDocRead("doc.outline", outline) },
    };
  },
};

export const docReadRangeTool: RegisteredTool = {
  name: "doc.readRange",
  description:
    "Read a range: xlsx {sheet,range}, docx {start,end} paragraphs, pptx {index}.",
  risk: "low",
  inputSchema: z
    .object({
      sessionId: z.string().min(1),
      sheet: z.string().optional(),
      range: z.string().optional(),
      start: z.number().int().optional(),
      end: z.number().int().optional(),
      index: z.number().int().optional(),
    })
    .passthrough(),
  async handler(input): Promise<ToolResult> {
    const session = requireSession(input.sessionId);
    const data = await session.adapter.readRange(input);
    return {
      ok: true,
      summary: "Read range",
      data: { data, untrusted: wrapDocRead("doc.readRange", data) },
    };
  },
};

export const docSearchTool: RegisteredTool = {
  name: "doc.search",
  description: "Search text inside an open document session.",
  risk: "low",
  inputSchema: z.object({
    sessionId: z.string().min(1),
    query: z.string().min(1),
  }),
  async handler(input): Promise<ToolResult> {
    const session = requireSession(input.sessionId);
    const hits = await session.adapter.search(input.query);
    return {
      ok: true,
      summary: `${hits.length} hit(s)`,
      data: { hits, untrusted: wrapDocRead("doc.search", hits) },
    };
  },
};

export const docCloseTool: RegisteredTool = {
  name: "doc.close",
  description: "Close a document session and clear snapshots.",
  risk: "low",
  inputSchema: z.object({
    sessionId: z.string().min(1),
    keepSnapshots: z.boolean().optional(),
  }),
  async handler(input): Promise<ToolResult> {
    // Opened and closed with nothing in between, and the run went on to report
    // a spreadsheet it had never filled in. Closing is the last moment the
    // emptiness can still be said out loud.
    const session = getDocSession(input.sessionId);
    const empty = !session.wrote;
    const path = session.path;
    await closeDocSession(input.sessionId, Boolean(input.keepSnapshots));
    return {
      ok: true,
      summary: empty
        ? `Closed ${input.sessionId}. Nothing was written, so ${path} is still an empty document — open it again and add the content before calling it done.`
        : `Closed ${input.sessionId}`,
    };
  },
};

export const docUndoTool: RegisteredTool = {
  name: "doc.undo",
  description: "Undo the last committed document op for a session.",
  risk: "high",
  inputSchema: z.object({ sessionId: z.string().min(1) }),
  async handler(input): Promise<ToolResult> {
    const diff = await undoDocSession(input.sessionId);
    if (!diff) {
      return { ok: false, summary: "Nothing to undo", error: "Empty undo stack" };
    }
    return { ok: true, summary: "Undid last op", data: { diff } };
  },
};

export const docPreviewTool: RegisteredTool = {
  name: "doc.preview",
  description:
    "Render the open document to a PDF beside it. No office suite required.",
  risk: "low",
  inputSchema: z.object({ sessionId: z.string().min(1) }),
  async handler(input): Promise<ToolResult> {
    const session = requireSession(input.sessionId);
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join, basename, extname } = await import("node:path");
    const { renderDocumentToPdf } = await import("../../docs/render/pdf-export.js");
    const dir = await mkdtemp(join(tmpdir(), "redrob-doc-preview-"));
    const base = basename(session.path, extname(session.path)) || "document";
    const target = join(dir, `${base}.pdf`);
    const result = await renderDocumentToPdf(session.path, target);
    if (!result.ok) {
      return {
        ok: true,
        summary: result.reason,
        data: { previewAvailable: false, reason: result.reason },
      };
    }
    return {
      ok: true,
      summary: `Preview PDF: ${result.path}`,
      data: { previewAvailable: true, pdfPath: result.path },
    };
  },
};

export const sheetWriteRangeTool: RegisteredTool = {
  name: "sheet.writeRange",
  description: "Write a 2D values grid starting at A1-style cell. Supports dryRun.",
  risk: "high",
  inputSchema: z.object({
    sessionId: z.string().min(1),
    sheet: z.string().min(1),
    start: z.string().min(1),
    values: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
    dryRun: z.boolean().optional(),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    const session = requireSession(input.sessionId);
    if (session.format !== "xlsx") {
      return { ok: false, summary: "Not an xlsx session", error: "Wrong format" };
    }
    if (session.adapter instanceof XlsxAdapter) {
      await ensureSheet(session.adapter, input.sheet);
    }
    return runWriteTool({
      tool: "sheet.writeRange",
      sessionId: input.sessionId,
      ops: [
        {
          op: "writeRange",
          sheet: input.sheet,
          start: input.start,
          values: input.values,
        },
      ],
      dryRun: Boolean(input.dryRun),
      ctx,
    });
  },
};

export const sheetAddFormulaTool: RegisteredTool = {
  name: "sheet.addFormula",
  description: "Set a formula on a cell. Supports dryRun.",
  risk: "high",
  inputSchema: z.object({
    sessionId: z.string().min(1),
    sheet: z.string().min(1),
    cell: z.string().min(1),
    formula: z.string().min(1),
    dryRun: z.boolean().optional(),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    return runWriteTool({
      tool: "sheet.addFormula",
      sessionId: input.sessionId,
      ops: [
        {
          op: "addFormula",
          sheet: input.sheet,
          cell: input.cell,
          formula: input.formula,
        },
      ],
      dryRun: Boolean(input.dryRun),
      ctx,
    });
  },
};

export const sheetSortTool: RegisteredTool = {
  name: "sheet.sort",
  description: "Sort a rectangular range by 1-based column index. Supports dryRun.",
  risk: "high",
  inputSchema: z.object({
    sessionId: z.string().min(1),
    sheet: z.string().min(1),
    range: z.string().min(1),
    column: z.number().int().positive(),
    ascending: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    return runWriteTool({
      tool: "sheet.sort",
      sessionId: input.sessionId,
      ops: [
        {
          op: "sort",
          sheet: input.sheet,
          range: input.range,
          column: input.column,
          ascending: input.ascending,
        },
      ],
      dryRun: Boolean(input.dryRun),
      ctx,
    });
  },
};

export const sheetInsertRowsTool: RegisteredTool = {
  name: "sheet.insertRows",
  description: "Insert blank rows at startRow. Supports dryRun.",
  risk: "high",
  inputSchema: z.object({
    sessionId: z.string().min(1),
    sheet: z.string().min(1),
    startRow: z.number().int().positive(),
    count: z.number().int().positive().max(1000),
    dryRun: z.boolean().optional(),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    return runWriteTool({
      tool: "sheet.insertRows",
      sessionId: input.sessionId,
      ops: [
        {
          op: "insertRows",
          sheet: input.sheet,
          startRow: input.startRow,
          count: input.count,
        },
      ],
      dryRun: Boolean(input.dryRun),
      ctx,
    });
  },
};

export const sheetChartTool: RegisteredTool = {
  name: "sheet.chart",
  description: "Add a bar/column chart bound to a data range. Supports dryRun.",
  risk: "high",
  inputSchema: z.object({
    sessionId: z.string().min(1),
    sheet: z.string().min(1),
    type: z.enum(["bar", "column"]),
    dataRange: z.string().min(1),
    title: z.string().optional(),
    anchorCell: z.string().optional(),
    dryRun: z.boolean().optional(),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    return runWriteTool({
      tool: "sheet.chart",
      sessionId: input.sessionId,
      ops: [
        {
          op: "chart",
          sheet: input.sheet,
          type: input.type,
          dataRange: input.dataRange,
          title: input.title,
          anchorCell: input.anchorCell,
        },
      ],
      dryRun: Boolean(input.dryRun),
      ctx,
    });
  },
};

export const docFindReplaceTool: RegisteredTool = {
  name: "doc.findReplace",
  description: "Find/replace text in a docx while preserving run styles. Supports dryRun.",
  risk: "high",
  inputSchema: z.object({
    sessionId: z.string().min(1),
    find: z.string().min(1),
    replace: z.string(),
    all: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    return runWriteTool({
      tool: "doc.findReplace",
      sessionId: input.sessionId,
      ops: [
        {
          op: "findReplace",
          find: input.find,
          replace: input.replace,
          all: input.all,
        },
      ],
      dryRun: Boolean(input.dryRun),
      ctx,
    });
  },
};

export const docInsertSectionTool: RegisteredTool = {
  name: "doc.insertSection",
  description: "Insert a heading + body section into a docx. Supports dryRun.",
  risk: "high",
  inputSchema: z.object({
    sessionId: z.string().min(1),
    heading: z.string().min(1),
    body: z.string(),
    afterIndex: z.number().int().optional(),
    dryRun: z.boolean().optional(),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    return runWriteTool({
      tool: "doc.insertSection",
      sessionId: input.sessionId,
      ops: [
        {
          op: "insertSection",
          heading: input.heading,
          body: input.body,
          afterIndex: input.afterIndex,
        },
      ],
      dryRun: Boolean(input.dryRun),
      ctx,
    });
  },
};

export const docApplyStyleTool: RegisteredTool = {
  name: "doc.applyStyle",
  description: "Apply a paragraph style (Heading1/Heading2/Normal). Supports dryRun.",
  risk: "high",
  inputSchema: z.object({
    sessionId: z.string().min(1),
    paragraphIndex: z.number().int().nonnegative(),
    style: z.enum(["Heading1", "Heading2", "Normal"]),
    dryRun: z.boolean().optional(),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    return runWriteTool({
      tool: "doc.applyStyle",
      sessionId: input.sessionId,
      ops: [
        {
          op: "applyStyle",
          paragraphIndex: input.paragraphIndex,
          style: input.style,
        },
      ],
      dryRun: Boolean(input.dryRun),
      ctx,
    });
  },
};

export const slideAddTool: RegisteredTool = {
  name: "slide.add",
  description: "Add a slide with title/body. Supports dryRun.",
  risk: "high",
  inputSchema: z.object({
    sessionId: z.string().min(1),
    title: z.string().min(1),
    body: z.string().optional(),
    atIndex: z.number().int().optional(),
    dryRun: z.boolean().optional(),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    return runWriteTool({
      tool: "slide.add",
      sessionId: input.sessionId,
      ops: [
        {
          op: "add",
          title: input.title,
          body: input.body,
          atIndex: input.atIndex,
        },
      ],
      dryRun: Boolean(input.dryRun),
      ctx,
    });
  },
};

export const slideSetTextTool: RegisteredTool = {
  name: "slide.setText",
  description: "Set title/body text on a slide. Supports dryRun.",
  risk: "high",
  inputSchema: z.object({
    sessionId: z.string().min(1),
    index: z.number().int().nonnegative(),
    title: z.string().optional(),
    body: z.string().optional(),
    dryRun: z.boolean().optional(),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    return runWriteTool({
      tool: "slide.setText",
      sessionId: input.sessionId,
      ops: [
        {
          op: "setText",
          index: input.index,
          title: input.title,
          body: input.body,
        },
      ],
      dryRun: Boolean(input.dryRun),
      ctx,
    });
  },
};

export const slideInsertImageTool: RegisteredTool = {
  name: "slide.insertImage",
  description: "Insert an image file onto a slide. Supports dryRun.",
  risk: "high",
  inputSchema: z.object({
    sessionId: z.string().min(1),
    index: z.number().int().nonnegative(),
    imagePath: z.string().min(1),
    dryRun: z.boolean().optional(),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    assertAllowedPath(input.imagePath, ctx.allowedPaths, "slide.insertImage");
    return runWriteTool({
      tool: "slide.insertImage",
      sessionId: input.sessionId,
      ops: [
        {
          op: "insertImage",
          index: input.index,
          imagePath: input.imagePath,
        },
      ],
      dryRun: Boolean(input.dryRun),
      ctx,
    });
  },
};

export const slideReorderTool: RegisteredTool = {
  name: "slide.reorder",
  description: "Move a slide from one index to another. Supports dryRun.",
  risk: "high",
  inputSchema: z.object({
    sessionId: z.string().min(1),
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
    dryRun: z.boolean().optional(),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    return runWriteTool({
      tool: "slide.reorder",
      sessionId: input.sessionId,
      ops: [{ op: "reorder", from: input.from, to: input.to }],
      dryRun: Boolean(input.dryRun),
      ctx,
    });
  },
};

export const DOC_TOOLS: RegisteredTool[] = [
  docCreateTool,
  docOpenTool,
  docOutlineTool,
  docReadRangeTool,
  docSearchTool,
  docCloseTool,
  docUndoTool,
  docPreviewTool,
  sheetWriteRangeTool,
  sheetAddFormulaTool,
  sheetSortTool,
  sheetInsertRowsTool,
  sheetChartTool,
  docFindReplaceTool,
  docInsertSectionTool,
  docApplyStyleTool,
  slideAddTool,
  slideSetTextTool,
  slideInsertImageTool,
  slideReorderTool,
];
