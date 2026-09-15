import {
  fillDocumentForm,
  parseDocument,
  patchDocument,
  suggestedOutputName,
  type ParsedDocument,
} from "@redrob/generate/edit";
import { basename } from "node:path";
import { saveArtifact } from "./artifacts.js";

export interface OpenDocumentForEditResult {
  path: string;
  fileName: string;
  parsed: ParsedDocument;
}

export interface SavePatchedDocumentInput {
  originalPath: string;
  editedMarkdown: string;
  title?: string;
  categoryId?: string;
}

export interface SavePatchedDocumentResult {
  artifactId: string;
  contentFile: string;
  applied: number;
  skippedReasons: string[];
  timingMs: number;
  markdown: string;
}

export interface FillOpenedFormInput {
  originalPath: string;
  values: Record<string, string>;
  title?: string;
  categoryId?: string;
}

export interface FillOpenedFormResult {
  artifactId: string;
  contentFile: string;
  filledLabels: string[];
  unmatchedLabels: string[];
  timingMs: number;
}

export async function openDocumentForEdit(path: string): Promise<OpenDocumentForEditResult> {
  const parsed = await parseDocument(path);
  return {
    path,
    fileName: basename(path),
    parsed,
  };
}

export async function savePatchedDocument(
  input: SavePatchedDocumentInput,
): Promise<SavePatchedDocumentResult> {
  const patched = await patchDocument({
    original: input.originalPath,
    editedMarkdown: input.editedMarkdown,
  });
  const contentFile = suggestedOutputName(input.originalPath, "-edited");
  const artifact = await saveArtifact({
    kind: "other",
    title: input.title?.trim() || contentFile,
    sourcePath: patched.path,
    contentFile,
    encoding: "binary",
    categoryId: input.categoryId ?? "legal",
    source: "template",
    mimeType:
      patched.format === "hwpx" ? "application/hwp+zip" : "application/x-hwp",
  });
  return {
    artifactId: artifact.id,
    contentFile: artifact.contentFile,
    applied: patched.applied,
    skippedReasons: patched.skipped.map((skip) => skip.reason),
    timingMs: patched.timing.totalMs,
    markdown: input.editedMarkdown,
  };
}

export async function fillOpenedForm(input: FillOpenedFormInput): Promise<FillOpenedFormResult> {
  const filled = await fillDocumentForm({
    original: input.originalPath,
    values: input.values,
    preserve: true,
  });
  const contentFile =
    filled.format === "markdown"
      ? suggestedOutputName(input.originalPath, "-filled").replace(/\.[^.]+$/, ".md")
      : suggestedOutputName(input.originalPath, "-filled").replace(/\.[^.]+$/, ".hwpx");
  const artifact = await saveArtifact({
    kind: "other",
    title: input.title?.trim() || contentFile,
    sourcePath: filled.path,
    contentFile: basename(contentFile),
    encoding: filled.format === "markdown" ? "utf8" : "binary",
    categoryId: input.categoryId ?? "legal",
    source: "template",
  });
  return {
    artifactId: artifact.id,
    contentFile: artifact.contentFile,
    filledLabels: filled.filledLabels,
    unmatchedLabels: filled.unmatchedLabels,
    timingMs: filled.timing.totalMs,
  };
}
