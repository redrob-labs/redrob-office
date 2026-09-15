import { generate, isBinaryOutputKind, OUTPUT_KIND_MIME, parseOutputKind } from "@redrob/generate";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { loadTemplate } from "@redrob/registry";
import { localizeSlotDescription } from "@redrob/ui";
import { saveArtifact, type ArtifactKind } from "./artifacts.js";
import { fillJdSlotsFromFacts, assembleJdMarkdown } from "./jd.js";
import { loadCompanyProfile } from "./company-profile.js";
import { fillSlots } from "./slot-fill.js";
import { draftSlotCompileHints, draftSlotToSpec } from "@redrob/kernel";

export interface DraftTemplateRequest {
  templateId: string;
  data: Record<string, string>;
  /** When true, ask the local model to fill slots (reuses slot-fill / JD path). */
  useModel?: boolean;
  categoryId?: string;
  artifactKind?: ArtifactKind;
  title?: string;
  locale?: string;
}

export interface DraftTemplateResult {
  templateId: string;
  markdown: string;
  source: "model" | "template";
  modelError?: string;
  artifactId?: string;
  unfilled: string[];
  timingMs: number;
  outputKind?: string;
  contentFile?: string;
  rebuilds?: number;
  bleedTrimmed?: number;
  grammarFails?: number;
  errors?: number;
}

export type DraftTemplateFieldStream = (field: {
  path: string;
  value: unknown;
  streamTarget?: string;
}) => void;

function slotsToMarkdown(
  templateId: string,
  data: Record<string, string>,
  locale?: string,
): string {
  const template = loadTemplate(templateId);
  const sections = template.slots.flatMap((slot) => {
    const value = data[slot.id]?.trim();
    if (!value) return [];
    const heading = localizeSlotDescription(
      locale,
      templateId,
      slot.id,
      slot.description || slot.id,
    );
    return [`## ${heading}\n\n${value}`];
  });
  return `${sections.join("\n\n")}\n`;
}

function templateSlotsAsSpecs(templateId: string) {
  const slots = loadTemplate(templateId).slots.map((slot) => ({
    id: slot.id,
    description: slot.description || slot.id,
    maxChars: slot.maxChars ?? defaultTemplateMaxChars(slot.id),
    required: slot.required,
  }));
  return {
    specs: slots.map((s) => draftSlotToSpec(s)),
    hints: Object.fromEntries(slots.map((s) => [s.id, draftSlotCompileHints(s)])),
  };
}

/** English-oriented defaults when template YAML omits maxChars. */
function defaultTemplateMaxChars(slotId: string): number {
  switch (slotId) {
    case "body":
    case "narrative":
    case "memo":
    case "analysis":
    case "conclusion":
      return 800;
    case "responsibilities":
    case "qualifications":
      return 700;
    case "subject":
    case "roleTitle":
    case "title":
      return 120;
    case "location":
      return 80;
    case "candidateName":
    case "decision":
      return 60;
    default:
      return 200;
  }
}

/**
 * Model path: recruiting/jd reuses fillJdSlotsFromFacts; other templates use the
 * same fillSlots helper (no separate constrained-JSON implementation).
 */
async function expandWithModel(
  templateId: string,
  data: Record<string, string>,
  locale?: string,
  onField?: DraftTemplateFieldStream,
): Promise<
  | {
      markdown: string;
      unfilled: string[];
      data: Record<string, string>;
      rebuilds: number;
      bleedTrimmed: number;
      grammarFails: number;
      errors: number;
    }
  | { error: string }
> {
  try {
    if (templateId === "recruiting/jd") {
      const attempt = await fillJdSlotsFromFacts(
        {
          roleTitle: data.roleTitle ?? "",
          responsibilities: data.responsibilities ?? "",
          qualifications: data.qualifications ?? "",
          ...(data.location?.trim() ? { location: data.location.trim() } : {}),
        },
        { ...(locale ? { locale } : {}), ...(onField ? { onField } : {}) },
      );
      if ("error" in attempt) return attempt;
      const profile = await loadCompanyProfile();
      return {
        markdown: assembleJdMarkdown(attempt.values, profile, locale),
        unfilled: attempt.unfilled,
        data: { ...data, ...attempt.values },
        rebuilds: attempt.rebuilds,
        bleedTrimmed: attempt.bleedTrimmed,
        grammarFails: attempt.grammarFails,
        errors: attempt.errors,
      };
    }

    const { specs, hints } = templateSlotsAsSpecs(templateId);
    const document = Object.entries(data)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
    const filled = await fillSlots({
      document,
      slots: specs,
      hints,
      systemPrompt:
        "Fill each slot with a concise value from the facts. Do not invent. Value only per label.",
      ...(onField ? { onField } : {}),
    });
    const merged = { ...data, ...filled.values };
    return {
      markdown: slotsToMarkdown(templateId, merged, locale),
      unfilled: filled.unfilled,
      data: merged,
      rebuilds: filled.rebuilds,
      bleedTrimmed: filled.bleedTrimmed,
      grammarFails: filled.grammarFails,
      errors: filled.errors,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function draftFromTemplate(
  input: DraftTemplateRequest,
  onField?: DraftTemplateFieldStream,
): Promise<DraftTemplateResult> {
  const startedAt = performance.now();
  const template = loadTemplate(input.templateId);
  const outputKind = parseOutputKind(template.outputKind);
  const unfilledRequired = template.slots
    .filter((slot) => slot.required && !input.data[slot.id]?.trim())
    .map((slot) => slot.id);
  if (unfilledRequired.length > 0) {
    throw new Error(`Missing required slots: ${unfilledRequired.join(", ")}`);
  }

  let markdown = slotsToMarkdown(input.templateId, input.data, input.locale);
  let filledData: Record<string, string> = { ...input.data };
  let source: "model" | "template" = "template";
  let modelError: string | undefined;
  let unfilled: string[] = [];
  let rebuilds: number | undefined;
  let bleedTrimmed: number | undefined;
  let grammarFails: number | undefined;
  let errors: number | undefined;

  if (input.useModel) {
    const attempt = await expandWithModel(
      input.templateId,
      input.data,
      input.locale,
      onField,
    );
    if ("markdown" in attempt) {
      markdown = attempt.markdown;
      filledData = attempt.data;
      source = "model";
      unfilled = attempt.unfilled;
      rebuilds = attempt.rebuilds;
      bleedTrimmed = attempt.bleedTrimmed;
      grammarFails = attempt.grammarFails;
      errors = attempt.errors;
    } else {
      modelError = attempt.error;
    }
  }

  const categoryId = input.categoryId ?? input.templateId.split("/")[0] ?? "other";
  const title = input.title?.trim() || input.templateId;
  const counters = {
    ...(rebuilds !== undefined ? { rebuilds } : {}),
    ...(bleedTrimmed !== undefined ? { bleedTrimmed } : {}),
    ...(grammarFails !== undefined ? { grammarFails } : {}),
    ...(errors !== undefined ? { errors } : {}),
  };

  if (outputKind === "markdown" && !modelError) {
    const artifact = await saveArtifact({
      kind: input.artifactKind ?? "other",
      title,
      body: markdown,
      categoryId,
      source,
      contentFile: "content.md",
      encoding: "utf8",
    });
    return {
      templateId: input.templateId,
      markdown,
      source,
      artifactId: artifact.id,
      unfilled,
      timingMs: performance.now() - startedAt,
      outputKind,
      contentFile: artifact.contentFile,
      ...(modelError ? { modelError } : {}),
      ...counters,
    };
  }

  const generated = await generate({ templateId: input.templateId, data: filledData });
  if (generated.output.kind === "markdown") {
    markdown = await readFile(generated.output.path, "utf8");
  } else if (!isBinaryOutputKind(generated.output.kind)) {
    // html / svg — expose file body so the result pane can preview it.
    markdown = await readFile(generated.output.path, "utf8");
  }

  const artifact = await saveArtifact({
    kind: input.artifactKind ?? "other",
    title,
    categoryId,
    source: modelError ? "template" : source,
    ...(isBinaryOutputKind(generated.output.kind)
      ? {
          sourcePath: generated.output.path,
          encoding: "binary" as const,
          contentFile: basename(generated.output.path),
          mimeType: OUTPUT_KIND_MIME[generated.output.kind],
        }
      : {
          body: await readFile(generated.output.path, "utf8"),
          encoding: "utf8" as const,
          contentFile: basename(generated.output.path),
          mimeType: OUTPUT_KIND_MIME[generated.output.kind],
        }),
  });

  return {
    templateId: input.templateId,
    markdown,
    source: modelError ? "template" : source,
    artifactId: artifact.id,
    unfilled: unfilled.length > 0 ? unfilled : generated.unfilled,
    timingMs: performance.now() - startedAt,
    outputKind: generated.output.kind,
    contentFile: artifact.contentFile,
    ...(modelError ? { modelError } : {}),
    ...counters,
  };
}
