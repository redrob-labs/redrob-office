import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { tmpdir } from "node:os";

import {
  detectFormat,
  extractFormFields,
  fillForm,
  markdownToHwpx,
  parse,
  patchHwp,
  patchHwpx,
  type FillInput,
  type FillOutputFormat,
  type FileType,
  type FormField,
  type PatchSkip,
} from "kordoc";

export type EditableDocumentFormat = "hwpx" | "hwp";

export interface ParsedDocument {
  fileType: FileType;
  markdown: string;
  pageCount?: number;
  title?: string;
  formFields: FormField[];
}

export interface PatchDocumentInput {
  /** Absolute path or raw bytes of the original document. */
  original: string | Uint8Array;
  editedMarkdown: string;
  /** Override format detection when known. */
  format?: EditableDocumentFormat;
}

export interface PatchDocumentResult {
  format: EditableDocumentFormat;
  path: string;
  applied: number;
  skipped: PatchSkip[];
  timing: { totalMs: number };
}

export interface FillDocumentFormInput {
  original: string | Uint8Array;
  values: Record<string, string>;
  /**
   * Prefer style-preserving HWPX fill when the source is HWPX.
   * Falls back to freshly generated HWPX for other inputs.
   */
  preserve?: boolean;
}

export interface FillDocumentFormResult {
  format: "hwpx" | "markdown";
  path: string;
  filledLabels: string[];
  unmatchedLabels: string[];
  timing: { totalMs: number };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function loadBytes(original: string | Uint8Array): Promise<Uint8Array> {
  if (typeof original === "string") {
    return new Uint8Array(await readFile(original));
  }
  return original;
}

async function detectEditableFormat(
  bytes: Uint8Array,
  hint?: EditableDocumentFormat,
): Promise<EditableDocumentFormat> {
  if (hint) return hint;
  const detected = detectFormat(toArrayBuffer(bytes));
  if (detected === "hwpx" || detected === "hwp") return detected;
  throw new Error(
    `Format-preserving edit supports .hwpx / .hwp only (detected: ${detected}). Parse to markdown and regenerate for other formats.`,
  );
}

async function tempOut(prefix: string, ext: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  return join(directory, `document.${ext}`);
}

/** Parse HWP/HWPX/DOCX/PDF/… into editable markdown (+ form field labels when present). */
export async function parseDocument(original: string | Uint8Array): Promise<ParsedDocument> {
  const bytes = await loadBytes(original);
  const result = await parse(Buffer.from(bytes));
  if (!result.success) {
    throw new Error(result.error || "Failed to parse document.");
  }
  const form = extractFormFields(result.blocks);
  return {
    fileType: result.fileType,
    markdown: result.markdown,
    ...(result.pageCount !== undefined ? { pageCount: result.pageCount } : {}),
    ...(result.metadata?.title ? { title: result.metadata.title } : {}),
    formFields: form.fields,
  };
}

/** Format-preserving patch for Hangul documents (HWPX or HWP 5.x). */
export async function patchDocument(input: PatchDocumentInput): Promise<PatchDocumentResult> {
  const startedAt = performance.now();
  const bytes = await loadBytes(input.original);
  const format = await detectEditableFormat(bytes, input.format);
  const patched =
    format === "hwpx"
      ? await patchHwpx(bytes, input.editedMarkdown)
      : await patchHwp(bytes, input.editedMarkdown);
  if (!patched.success || !patched.data) {
    throw new Error(patched.error || "Document patch failed.");
  }
  const path = await tempOut("redrob-patch-", format);
  await writeFile(path, patched.data);
  return {
    format,
    path,
    applied: patched.applied,
    skipped: patched.skipped,
    timing: { totalMs: performance.now() - startedAt },
  };
}

/** Fill labeled form fields; prefers HWPX style preservation when possible. */
export async function fillDocumentForm(input: FillDocumentFormInput): Promise<FillDocumentFormResult> {
  const startedAt = performance.now();
  const bytes = await loadBytes(input.original);
  const values: Record<string, FillInput> = Object.fromEntries(
    Object.entries(input.values).map(([key, value]) => [key, value]),
  );

  let outputFormat: FillOutputFormat = "hwpx";
  if (input.preserve !== false) {
    try {
      const format = await detectEditableFormat(bytes);
      if (format === "hwpx") outputFormat = "hwpx-preserve";
    } catch {
      outputFormat = "hwpx";
    }
  }

  const filled = await fillForm(Buffer.from(bytes), values, outputFormat);
  if (filled.format === "markdown") {
    const path = await tempOut("redrob-fill-", "md");
    await writeFile(path, String(filled.output), "utf8");
    return {
      format: "markdown",
      path,
      filledLabels: filled.fill.filled.map((field) => field.label),
      unmatchedLabels: filled.fill.unmatched,
      timing: { totalMs: performance.now() - startedAt },
    };
  }

  const path = await tempOut("redrob-fill-", "hwpx");
  await writeFile(path, Buffer.from(filled.output as ArrayBuffer));
  return {
    format: "hwpx",
    path,
    filledLabels: filled.fill.filled.map((field) => field.label),
    unmatchedLabels: filled.fill.unmatched,
    timing: { totalMs: performance.now() - startedAt },
  };
}

/** Create a new HWPX from markdown via kordoc (richer than the slot→builder path). */
export async function generateHwpxFromMarkdown(markdown: string): Promise<{ path: string; timing: { totalMs: number } }> {
  const startedAt = performance.now();
  const buffer = await markdownToHwpx(markdown);
  const path = await tempOut("redrob-md-hwpx-", "hwpx");
  await writeFile(path, Buffer.from(buffer));
  return { path, timing: { totalMs: performance.now() - startedAt } };
}

export function suggestedOutputName(sourcePath: string, suffix: string): string {
  const base = basename(sourcePath, extname(sourcePath)) || "document";
  const ext = extname(sourcePath).toLowerCase() || ".hwpx";
  return `${base}${suffix}${ext}`;
}
