import {
  DEFAULT_LOCAL_PACK_TIER,
  detectDeviceProfile,
  type Tier,
} from "@redrob/kernel";
import {
  assembleJdMarkdown,
  jdLocale,
  type CompanyProfile,
} from "../../shared/jd-assemble.js";
import { saveArtifact } from "./artifacts.js";
import { loadCompanyProfile } from "./company-profile.js";
import { jdLengthScale, jdSlotsAsSpecs, scaledJdSlots } from "./jd-slots.js";
import { fillSlots } from "./slot-fill.js";

export type { CompanyProfile };
export { assembleJdMarkdown };

export interface DraftJdRequest {
  roleTitle: string;
  responsibilities: string;
  qualifications: string;
  location?: string;
  maxTokens?: number;
  locale?: string;
}

export interface DraftJdResult {
  templateId: string;
  path: string;
  markdown: string;
  source: "model" | "template";
  modelError?: string;
  /** Soft quality issues (unfilled required slots, verbatim echo). */
  warnings?: string[];
  artifactId?: string;
  unfilled: string[];
  timingMs: number;
  rebuilds?: number;
  bleedTrimmed?: number;
  grammarFails?: number;
  errors?: number;
}

export type DraftJdProgress = (stepId: "prepare" | "model" | "generate" | "save") => void;

export type DraftJdFieldStream = (field: {
  path: string;
  value: unknown;
  streamTarget?: string;
}) => void;

const MIN_TITLE_CHARS = 2;

const PLACEHOLDER_ONLY =
  /^(몰라|모름|알아서|대충|아무거나|개발해야겠지|todo|tbd|n\/?a|없음|xxx+|asdf+|test|테스트)$/i;

function normalizeFact(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim().toLowerCase())
    .filter(Boolean)
    .join("\n");
}

function isPlaceholderBlob(text: string): boolean {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return true;
  if (PLACEHOLDER_ONLY.test(compact)) return true;
  const lines = compact.split(/\n/).map((l) => l.replace(/^[-•*]\s*/, "").trim());
  return lines.length > 0 && lines.every((line) => PLACEHOLDER_ONLY.test(line));
}

/**
 * Refuse empty / placeholder facts. Short but real notes are fine —
 * the model expands them into JD copy.
 */
export function assertJdFactsUsable(input: {
  roleTitle: string;
  responsibilities: string;
  qualifications: string;
}): void {
  const roleTitle = input.roleTitle.trim();
  const responsibilities = input.responsibilities.trim();
  const qualifications = input.qualifications.trim();
  if (roleTitle.length < MIN_TITLE_CHARS) {
    throw new Error("ERR_JD_TITLE_SHORT");
  }
  if (isPlaceholderBlob(roleTitle)) {
    throw new Error("ERR_JD_FACTS_PLACEHOLDER");
  }
  for (const value of [responsibilities, qualifications]) {
    if (isPlaceholderBlob(value)) {
      throw new Error("ERR_JD_FACTS_PLACEHOLDER");
    }
  }
}

/** Fallback when the model path fails — still includes company boilerplate. */
export async function buildJdMarkdown(
  input: {
    roleTitle: string;
    responsibilities: string;
    qualifications: string;
    location?: string;
  },
  locale?: string,
): Promise<string> {
  return assembleJdMarkdown(
    {
      roleTitle: input.roleTitle,
      responsibilities: input.responsibilities,
      qualifications: input.qualifications,
      ...(input.location?.trim() ? { location: input.location.trim() } : {}),
    },
    await loadCompanyProfile(),
    locale,
  );
}

function factsDocument(
  input: {
    roleTitle: string;
    responsibilities: string;
    qualifications: string;
    location?: string;
  },
  locale?: string,
): string {
  const labels =
    jdLocale(locale) === "ko"
      ? {
          roleTitle: "직무명",
          responsibilities: "주요 업무",
          qualifications: "자격 요건",
          location: "근무지",
        }
      : {
          roleTitle: "Role title",
          responsibilities: "Responsibilities",
          qualifications: "Qualifications",
          location: "Location",
        };
  return [
    `${labels.roleTitle}: ${input.roleTitle}`,
    `${labels.responsibilities}:\n${input.responsibilities}`,
    `${labels.qualifications}:\n${input.qualifications}`,
    input.location?.trim() ? `${labels.location}: ${input.location.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function collectQualityWarnings(
  facts: {
    roleTitle: string;
    responsibilities: string;
    qualifications: string;
  },
  rawModel: Record<string, string>,
  values: Record<string, string>,
  unfilled: string[],
): string[] {
  const warnings: string[] = [];
  if (unfilled.length > 0) {
    warnings.push(`ERR_JD_UNFILLED:${unfilled.join(",")}`);
  }
  const echoed: string[] = [];
  for (const key of ["roleTitle", "responsibilities", "qualifications"] as const) {
    const out = values[key]?.trim();
    if (!out) continue;
    if (normalizeFact(out) === normalizeFact(facts[key])) {
      echoed.push(key);
    }
  }
  // Model produced nothing useful beyond echoing facts / leaving oneLiner empty.
  if (!rawModel.oneLiner?.trim() && echoed.length >= 2) {
    warnings.push("ERR_JD_VERBATIM_ECHO");
  }
  return warnings;
}

function lengthGuidance(maxTokens?: number): string {
  const scale = jdLengthScale(maxTokens);
  if (scale >= 1.5) {
    return "Write full JD copy: many concrete bullets and a rich one-liner. Short user notes must be expanded.";
  }
  if (scale >= 1.25) {
    return "Write clear hiring language. If the facts are brief, expand them into several concrete bullets.";
  }
  return "Even for Short length: expand brief notes into a few concrete bullets — do not paste the facts back unchanged.";
}

/**
 * Shared entry used by draftJd and draftFromTemplate(useModel).
 */
export async function fillJdSlotsFromFacts(
  facts: {
    roleTitle: string;
    responsibilities: string;
    qualifications: string;
    location?: string;
  },
  options?: { onField?: DraftJdFieldStream; locale?: string; maxTokens?: number },
): Promise<
  | {
      values: Record<string, string>;
      rawModel: Record<string, string>;
      unfilled: string[];
      rebuilds: number;
      bleedTrimmed: number;
      grammarFails: number;
      errors: number;
    }
  | { error: string }
> {
  try {
    await detectDeviceProfile().catch(() => undefined);
    void ((process.env.REDROB_PACK_TIER as Tier | undefined) ?? DEFAULT_LOCAL_PACK_TIER);
    const { specs, hints } = jdSlotsAsSpecs(scaledJdSlots(options?.maxTokens));
    const lang =
      jdLocale(options?.locale) === "ko"
        ? "Write every slot value in Korean."
        : "Write every slot value in English.";
    const result = await fillSlots({
      document: factsDocument(facts, options?.locale),
      slots: specs,
      hints,
      systemPrompt: [
        "Fill each JD slot for a real job post.",
        "Stay faithful to the facts: do not invent unrelated stacks, years, or degrees.",
        "If a fact is brief, expand it into polished hiring language and multiple concrete bullets within the slot length.",
        "Do not copy short notes verbatim when you can phrase them as a proper JD.",
        "Do not write markdown headings.",
        lengthGuidance(options?.maxTokens),
        lang,
        "After each label write only the slot value then a newline.",
      ].join(" "),
      ...(options?.onField ? { onField: options.onField } : {}),
    });
    const rawModel = { ...result.values };
    // Prefer user-provided facts for required content if model left gaps.
    const values = { ...result.values };
    if (!values.roleTitle?.trim()) values.roleTitle = facts.roleTitle;
    if (!values.responsibilities?.trim()) values.responsibilities = facts.responsibilities;
    if (!values.qualifications?.trim()) values.qualifications = facts.qualifications;
    if (facts.location?.trim() && !values.location?.trim()) {
      values.location = facts.location.trim();
    }
    return {
      values,
      rawModel,
      unfilled: result.unfilled,
      rebuilds: result.rebuilds,
      bleedTrimmed: result.bleedTrimmed,
      grammarFails: result.grammarFails,
      errors: result.errors,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function draftJd(
  input: DraftJdRequest,
  onProgress?: DraftJdProgress,
  onField?: DraftJdFieldStream,
): Promise<DraftJdResult> {
  const startedAt = performance.now();
  onProgress?.("prepare");
  const roleTitle = input.roleTitle.trim();
  const responsibilities = input.responsibilities.trim();
  const qualifications = input.qualifications.trim();
  if (!roleTitle || !responsibilities || !qualifications) {
    throw new Error("roleTitle, responsibilities, and qualifications are required.");
  }
  assertJdFactsUsable({ roleTitle, responsibilities, qualifications });

  const locale = input.locale;
  const facts = {
    roleTitle,
    responsibilities,
    qualifications,
    ...(input.location?.trim() ? { location: input.location.trim() } : {}),
  };

  onProgress?.("model");
  onProgress?.("generate");
  const attempt = await fillJdSlotsFromFacts(facts, {
    ...(locale ? { locale } : {}),
    ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
    ...(onField ? { onField } : {}),
  });
  const profile = await loadCompanyProfile();

  let markdown: string;
  let source: "model" | "template";
  let modelError: string | undefined;
  let unfilled: string[] = [];
  let warnings: string[] = [];
  let rebuilds: number | undefined;
  let bleedTrimmed: number | undefined;
  let grammarFails: number | undefined;
  let errors: number | undefined;

  if ("error" in attempt) {
    modelError = attempt.error;
    markdown = await buildJdMarkdown(facts, locale);
    source = "template";
    warnings = ["ERR_JD_MODEL_FALLBACK"];
  } else {
    markdown = assembleJdMarkdown(attempt.values, profile, locale);
    source = "model";
    unfilled = attempt.unfilled;
    warnings = collectQualityWarnings(facts, attempt.rawModel, attempt.values, unfilled);
    rebuilds = attempt.rebuilds;
    bleedTrimmed = attempt.bleedTrimmed;
    grammarFails = attempt.grammarFails;
    errors = attempt.errors;
  }

  onProgress?.("save");
  const artifact = await saveArtifact({
    kind: "jd",
    title: roleTitle,
    body: markdown,
    categoryId: "recruiting",
    source,
  });

  return {
    templateId: "recruiting/jd",
    path: artifact.id,
    markdown,
    source,
    artifactId: artifact.id,
    unfilled,
    timingMs: performance.now() - startedAt,
    ...(modelError ? { modelError } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(rebuilds !== undefined ? { rebuilds } : {}),
    ...(bleedTrimmed !== undefined ? { bleedTrimmed } : {}),
    ...(grammarFails !== undefined ? { grammarFails } : {}),
    ...(errors !== undefined ? { errors } : {}),
  };
}
