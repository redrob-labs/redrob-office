import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { assertAllowedPath } from "./path-policy.js";
import type { RegisteredTool, ToolResult } from "./types.js";

const MAX_READ_CHARS = 200_000;
const MAX_WRITE_CHARS = 2_000_000;

export const fsReadTool: RegisteredTool = {
  name: "fs.read",
  description:
    "Read a UTF-8 text file inside an allowed folder. Returns truncated content for large files.",
  risk: "low",
  inputSchema: z.object({
    path: z.string().min(1).describe("Absolute path to the file"),
    maxChars: z
      .number()
      .int()
      .positive()
      .max(MAX_READ_CHARS)
      .optional()
      .describe("Max characters to return (default 100000)"),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    const path = assertAllowedPath(input.path, ctx.allowedPaths, "fs.read");
    const info = await stat(path);
    if (!info.isFile()) {
      return { ok: false, summary: "Not a file", error: "Not a file" };
    }
    const raw = await readFile(path, "utf8");
    const limit = input.maxChars ?? 100_000;
    const truncated = raw.length > limit;
    const content = truncated ? raw.slice(0, limit) : raw;
    return {
      ok: true,
      summary: truncated
        ? `Read ${path} (${raw.length} chars, truncated to ${limit})`
        : `Read ${path} (${raw.length} chars)`,
      data: { path, content, truncated, size: raw.length },
    };
  },
};

export const fsWriteTool: RegisteredTool = {
  name: "fs.write",
  description:
    "Write UTF-8 text to a file inside an allowed folder. Creates parent directories as needed.",
  risk: "high",
  inputSchema: z.object({
    path: z.string().min(1).describe("Absolute path to write"),
    content: z.string().describe("Full file contents to write"),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    if (input.content.length > MAX_WRITE_CHARS) {
      return {
        ok: false,
        summary: "Content too large",
        error: `Content exceeds ${MAX_WRITE_CHARS} characters`,
      };
    }
    const path = assertAllowedPath(input.path, ctx.allowedPaths, "fs.write");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.content, "utf8");
    // Writing a document into the documents folder is making a document,
    // whether or not doc.create was the way in.
    const { artifactIdForPath } = await import("../services/artifacts.js");
    const artifactId = artifactIdForPath(path);
    // A page is judged on what it paints, not on what was written. Saying so in
    // the write result is the only place the model will read it in time to fix
    // the file rather than announce a blank screen as finished work.
    const rendered = /\.html?$/i.test(path)
      ? await (async () => {
          const { checkHtmlRenders } = await import(
            "../docs/render/html-check.js"
          );
          return checkHtmlRenders(path);
        })()
      : { ok: true, problems: [] };
    const warning = rendered.ok
      ? ""
      : `\nOPEN IT AND IT SHOWS NOTHING: ${rendered.problems.join(" ")}`;
    return {
      ok: true,
      summary: `Wrote ${path} (${input.content.length} chars)${warning}`,
      data: {
        path,
        bytes: Buffer.byteLength(input.content, "utf8"),
        ...(rendered.ok ? {} : { renderProblems: rendered.problems }),
      },
      ...(artifactId ? { artifactId } : {}),
    };
  },
};

export const fsListTool: RegisteredTool = {
  name: "fs.list",
  description: "List files and directories inside an allowed folder.",
  risk: "low",
  inputSchema: z.object({
    path: z.string().min(1).describe("Absolute directory path"),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    const path = assertAllowedPath(input.path, ctx.allowedPaths, "fs.list");
    const info = await stat(path);
    if (!info.isDirectory()) {
      return {
        ok: false,
        summary: "Not a directory",
        error: "Not a directory",
      };
    }
    const entries = await readdir(path, { withFileTypes: true });
    const items = entries.slice(0, 500).map((entry) => ({
      name: entry.name,
      path: join(path, entry.name),
      type: entry.isDirectory() ? "dir" : entry.isFile() ? "file" : "other",
    }));
    return {
      ok: true,
      summary: `Listed ${items.length} entries in ${path}${
        entries.length > items.length ? " (truncated)" : ""
      }`,
      data: { path, items, truncated: entries.length > items.length },
    };
  },
};
