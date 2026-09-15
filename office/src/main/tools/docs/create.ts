import { writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { z } from "zod";
import {
  blankDocumentBytes,
  blankMarkdown,
  type NewDocumentFormat,
} from "../../services/create-document.js";
import { assertAllowedPath } from "../path-policy.js";
import type { RegisteredTool, ToolResult } from "../types.js";

/**
 * Starting a document, rather than only editing one.
 *
 * Every other document tool needs a file to already exist: `doc.open` takes a
 * path, and everything after it takes a session. That left a task able to
 * rewrite a spreadsheet it was handed and unable to produce one, which is the
 * more common request by far — "make me a spreadsheet of this" has to start
 * somewhere.
 *
 * The format comes from the extension rather than a separate argument, because
 * a path already says what kind of file it is and two ways to say the same
 * thing is two ways to disagree.
 */

const FORMATS: Record<string, NewDocumentFormat> = {
  ".md": "md",
  ".markdown": "md",
  ".docx": "docx",
  ".xlsx": "xlsx",
  ".pptx": "pptx",
};

const KNOWN = Object.keys(FORMATS).join(", ");

/**
 * What a fresh document is, said plainly enough that the run cannot mistake it
 * for the finished thing.
 *
 * Asked for a comparison spreadsheet with a chart, a run created the workbook,
 * read "Created …" as the work being done, and reported back a spreadsheet that
 * held one empty cell. The tool knows which calls are still owed, so it says so
 * rather than leaving the next step to be inferred from the file name.
 */
function createdSummary(label: string, format: NewDocumentFormat): string {
  const next =
    format === "xlsx"
      ? "doc.open, then sheet.writeRange for the rows and sheet.chart for any chart"
      : format === "pptx"
        ? "doc.open, then slide.add for each slide"
        : "doc.open, then doc.insertSection for the content";
  return (
    `Created ${label} (${format}). It is empty — fill it with ${next}. ` +
    "Nothing is in it until those calls succeed, so do not report it as finished yet."
  );
}

export const docCreateTool: RegisteredTool = {
  name: "doc.create",
  description:
    "Create a new empty document. Give a name like report.xlsx to keep it with the other " +
    "documents, where the person can see and open it, or a path to put it somewhere " +
    `particular inside an allowed folder. The extension decides the kind: ${KNOWN}. ` +
    "Returns the path, which doc.open takes to start editing. Refuses to overwrite a file " +
    "that already exists.",
  risk: "high",
  inputSchema: z.object({
    name: z
      .string()
      .min(1)
      .optional()
      .describe(
        "File name for a document kept with the others, ending in .md, .docx, .xlsx or .pptx",
      ),
    path: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Absolute path, only when the document has to live somewhere in particular",
      ),
    title: z
      .string()
      .max(200)
      .optional()
      .describe(
        "Heading for the first page or slide; defaults to the file name",
      ),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    if (!input.path && !input.name) {
      const message = "doc.create needs a name, such as report.xlsx.";
      return { ok: false, summary: message, error: message };
    }
    if (!input.path) return createAsArtifact(input.name!, input.title);

    const path = assertAllowedPath(input.path, ctx.allowedPaths, "doc.create");
    const format = FORMATS[extname(path).toLowerCase()];
    if (!format) {
      const message = `doc.create does not know how to make a ${extname(path) || "file with no extension"}. Known: ${KNOWN}`;
      return { ok: false, summary: message, error: message };
    }

    const title = input.title?.trim() || basename(path, extname(path));
    const body =
      format === "md"
        ? Buffer.from(blankMarkdown(title), "utf8")
        : await blankDocumentBytes(format, title);

    try {
      // Exclusive: a document tool that silently replaced an existing file
      // would be the one way to lose work that no undo covers.
      await writeFile(path, body, { flag: "wx" });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        const message = `${path} already exists. Open it with doc.open, or choose another name.`;
        return { ok: false, summary: message, error: message };
      }
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, summary: message, error: message };
    }

    return {
      ok: true,
      summary: createdSummary(basename(path), format),
      data: { path, format, title, bytes: body.length },
    };
  },
};

/**
 * A document kept with the rest of them, so it shows up in the app the moment
 * it exists. The file the task then edits is the document itself rather than a
 * copy of it, so every later change is the one the person is looking at.
 */
async function createAsArtifact(
  name: string,
  wantedTitle?: string,
): Promise<ToolResult> {
  const fileName = basename(name.trim());
  if (!fileName || fileName !== name.trim()) {
    const message = `"${name}" is a path, not a name. Give a name such as report.xlsx, or pass path for a particular place.`;
    return { ok: false, summary: message, error: message };
  }
  const format = FORMATS[extname(fileName).toLowerCase()];
  if (!format) {
    const message = `doc.create does not know how to make a ${extname(fileName) || "file with no extension"}. Known: ${KNOWN}`;
    return { ok: false, summary: message, error: message };
  }

  const title = wantedTitle?.trim() || basename(fileName, extname(fileName));
  const { artifactsDirPath, looseArtifactId } =
    await import("../../services/artifacts.js");
  const path = join(artifactsDirPath(), fileName);
  const body =
    format === "md"
      ? Buffer.from(blankMarkdown(title), "utf8")
      : await blankDocumentBytes(format, title);

  try {
    await writeFile(path, body, { flag: "wx" });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const message =
      code === "EEXIST"
        ? // Without the path, runs guessed folders and apologised for turns on end
          // before giving up on the document altogether.
          `${fileName} already exists at ${path}. Call doc.open with "${fileName}" (or that path) to use it, or choose another name.`
        : err instanceof Error
          ? err.message
          : String(err);
    return { ok: false, summary: message, error: message };
  }

  return {
    ok: true,
    summary: `${createdSummary(fileName, format)} Path: ${path}.`,
    data: { path, format, title, bytes: body.length },
    artifactId: looseArtifactId(fileName),
  };
}
