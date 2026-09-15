import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadTemplate } from "@redrob/registry";

import { OUTPUT_KIND_EXT, parseOutputKind, type OutputKind } from "./kinds.js";
import { collectSlots } from "./slots.js";
import { renderDocx, renderHwpx, renderPptx } from "./render/office.js";
import { renderHtml, renderJson, renderMarkdown, renderSvg } from "./render/text.js";

export { draftRubricFromJd, slugifyRubricSuffix } from "./rubric.js";
export {
  OUTPUT_KIND_EXT,
  OUTPUT_KIND_MIME,
  isBinaryOutputKind,
  parseOutputKind,
  type OutputKind,
} from "./kinds.js";

export interface GenerateInput {
  templateId: string;
  data: unknown;
  locale?: string;
}

export interface GenerateResult {
  templateId: string;
  output: {
    kind: OutputKind;
    path: string;
  };
  unfilled: string[];
  timing: { totalMs: number };
}

/** Masks publishable plain-text PII without changing non-PII content. */
export function maskPii(text: string): string {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email redacted]")
    // KR resident registration number before phone (RRN can look phone-like)
    .replace(/(?<!\d)\d{6}-?[1-4]\d{6}(?!\d)/g, "[id redacted]")
    // KR mobile / landline + general international
    .replace(/(?<!\d)01[016789]-?\d{3,4}-?\d{4}(?!\d)/g, "[phone redacted]")
    .replace(/(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)/g, "[phone redacted]")
    // Simple postal-ish address lines with street keywords (EN/KR)
    .replace(
      /(?:\d{1,5}\s+[A-Za-z0-9.\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd)\b)|(?:[가-힣]+\s?(?:시|군|구)\s?[가-힣0-9\s-]+(?:로|길)\s?\d+)/g,
      "[address redacted]",
    );
}

function outputPath(directory: string, templateId: string, kind: OutputKind): string {
  const base = templateId.replace(/\//g, "-");
  return join(directory, `${base}.${OUTPUT_KIND_EXT[kind]}`);
}

async function writeOutput(
  kind: OutputKind,
  path: string,
  filled: ReturnType<typeof collectSlots>["filled"],
): Promise<void> {
  switch (kind) {
    case "markdown":
      await renderMarkdown(path, filled);
      return;
    case "html":
      await renderHtml(path, filled);
      return;
    case "svg":
      await renderSvg(path, filled);
      return;
    case "json":
      await renderJson(path, filled);
      return;
    case "docx":
      await renderDocx(path, filled);
      return;
    case "pptx":
      await renderPptx(path, filled);
      return;
    case "hwpx":
      await renderHwpx(path, filled);
      return;
    case "xlsx":
      throw new Error("xlsx output is not implemented yet.");
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unsupported output kind: ${_exhaustive}`);
    }
  }
}

export async function generate(input: GenerateInput): Promise<GenerateResult> {
  const startedAt = performance.now();
  const template = loadTemplate(input.templateId);
  const kind = parseOutputKind(template.outputKind);
  const { filled, unfilled } = collectSlots(template, input.data);
  const directory = await mkdtemp(join(tmpdir(), "redrob-generate-"));
  const path = outputPath(directory, template.id, kind);
  await writeOutput(kind, path, filled);
  return {
    templateId: template.id,
    output: { kind, path },
    unfilled,
    timing: { totalMs: performance.now() - startedAt },
  };
}
