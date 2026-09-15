import {
  ABSENT_TOKEN,
  DEFAULT_LOCAL_PACK_TIER,
  FieldFillSession,
  applyExecutionPlan,
  axisToSlotSpecs,
  detectDeviceProfile,
  getActiveExecutionPlan,
  MODEL_ARTIFACTS,
  TIERS,
  prepareImageForModel,
  quoteSubstringChoices,
  readInferenceRouteFromEnv,
  readLlmProvidersFromEnv,
  redrobAvailableFromEnv,
  resolveInferenceRoute,
  slotFieldToFillable,
  type FieldConfidence,
  type FillableField,
  type Tier,
} from "@redrob/kernel";
import { loadRubric, type RubricAxis } from "@redrob/registry";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { scoreAxesCloud } from "./cloud-score.js";
import { deterministicRules } from "./rules/index.js";

export { formatRankLatencyLog, rankAgainstQuery, rankLexically } from "./rank.js";
export type { RankItem, RankResult } from "./rank.js";
export { cosineSimilarity, rankWithCloudEmbeddings } from "./cloud-rank.js";

export interface CompareFieldStreamItem {
  path: string;
  value: unknown;
  /** UI/IPC key — same as SlotFieldSpec.streamTarget (defaults to path). */
  streamTarget: string;
}

export interface CompareInput {
  artifact:
    | { kind: "structured"; data: unknown }
    | { kind: "image"; buffer: Buffer }
    | { kind: "text"; content: string };
  rubricId: string;
  /** Fired once per completed axis field (lines / quote / score). */
  onField?: (field: CompareFieldStreamItem) => void;
}

export interface Finding {
  ruleId: string;
  severity: "blocker" | "warn" | "info";
  message: string;
  evidence: {
    pointer?: string;
    bbox?: [number, number, number, number];
    excerpt?: string;
  };
  confidence: FieldConfidence;
}

export interface AxisScore {
  axisId: string;
  value: number;
  max: number;
  confidence: FieldConfidence;
  evidence: {
    lineRefs: number[];
    excerpt: string;
  };
}

export type UnscoredReason = "absent" | "citation_failed" | "error";

export interface UnscoredAxis {
  axisId: string;
  reason: UnscoredReason;
}

export interface CompareResult {
  rubricId: string;
  findings: Finding[];
  /** Scored axes only — never includes unscored-as-zero. */
  scores?: AxisScore[];
  unscoredAxes: UnscoredAxis[];
  timing: { totalMs: number };
  tierUsed: Tier;
  rebuilds: number;
  bleedTrimmed: number;
  grammarFails: number;
  errors: number;
}

/**
 * Number lines 1-based. Same string must be used for the prompt and for citation checks.
 */
export function numberLines(text: string): {
  numberedText: string;
  lines: Map<number, string>;
} {
  const rawLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines = new Map<number, string>();
  const numberedText = rawLines
    .map((line, index) => {
      const n = index + 1;
      lines.set(n, line);
      return `${n}|${line}`;
    })
    .join("\n");
  return { numberedText, lines };
}

/** True when the excerpt appears in at least one cited line. */
export function citationHolds(
  lines: ReadonlyMap<number, string>,
  lineRefs: readonly number[],
  excerpt: string,
): boolean {
  const quote = excerpt.trim();
  if (!quote || lineRefs.length === 0) return false;
  const norm = (value: string): string => value.replace(/\s+/g, " ").trim().toLowerCase();
  const normalizedQuote = norm(quote);
  return lineRefs.some((n) => {
    const line = lines.get(n) ?? "";
    if (line.includes(quote)) return true;
    return norm(line).includes(normalizedQuote);
  });
}

function modelsDirectory(): string {
  if (!process.env.REDROB_MODELS_DIR) {
    throw new Error("REDROB_MODELS_DIR is not configured. Set it to the directory containing downloaded local models.");
  }
  return process.env.REDROB_MODELS_DIR;
}

/** Whether a local text model is actually on disk, without throwing. */
async function localModelAvailable(): Promise<boolean> {
  if (!process.env.REDROB_MODELS_DIR) return false;
  try {
    const plan = await applyExecutionPlan({ skipBackendProbe: true });
    await access(plan.modelPath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function artifactText(artifact: CompareInput["artifact"]): Promise<string> {
  if (artifact.kind === "text") return artifact.content;
  if (artifact.kind === "structured") {
    return Object.entries(artifact.data as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
      .join("\n");
  }
  // Shared gate with PDF page renders / uploads once VLM path is live.
  await prepareImageForModel(artifact.buffer);
  throw new Error("image compare requires a wired VLM image adapter; refusing silent comparison.");
}

function severity(value: string): Finding["severity"] {
  if (value === "blocker" || value === "warn" || value === "info") return value;
  throw new Error(`Model returned invalid finding severity: ${value}`);
}

export function excludeDeterministicFindings<T extends { ruleId: string }>(
  findings: readonly T[],
  deterministicRuleIds: ReadonlySet<string>,
): T[] {
  return findings.filter((finding) => !deterministicRuleIds.has(finding.ruleId));
}

function axisFields(axis: RubricAxis): {
  lines: FillableField;
  quote: FillableField;
  score: FillableField;
} {
  const { specs, hints } = axisToSlotSpecs(axis);
  const [linesSpec, quoteSpec, scoreSpec] = specs;
  return {
    lines: slotFieldToFillable(linesSpec!, hints[linesSpec!.id]),
    quote: slotFieldToFillable(quoteSpec!, hints[quoteSpec!.id]),
    score: slotFieldToFillable(scoreSpec!, hints[scoreSpec!.id]),
  };
}

async function scoreAxes(options: {
  modelPath: string;
  numberedText: string;
  lines: Map<number, string>;
  axes: readonly RubricAxis[];
  modelRulePrompts: string;
  onField?: (field: CompareFieldStreamItem) => void;
}): Promise<{
  scores: AxisScore[];
  unscoredAxes: UnscoredAxis[];
  rebuilds: number;
  bleedTrimmed: number;
  grammarFails: number;
  errors: number;
}> {
  const declared = options.axes.flatMap((axis) => {
    const fields = axisFields(axis);
    return [fields.lines, fields.quote, fields.score];
  });
  const document = [
    options.modelRulePrompts,
    "",
    "Numbered artifact (line|text):",
    options.numberedText,
  ].join("\n");

  const session = await FieldFillSession.open({
    modelPath: options.modelPath,
    document,
    fields: declared,
    systemPrompt: [
      "Score each rubric axis using only the numbered artifact.",
      "For each axis decode in order: lines, quote, score.",
      "lines = 1–3 line numbers from the artifact (comma-separated).",
      "quote = choose an exact substring from the cited line text (grammar-constrained).",
      `Write ${ABSENT_TOKEN} when evidence is missing — that leaves the axis unscored.`,
      "Do not write JSON or prose explanations.",
    ].join(" "),
    ...(options.onField
      ? {
          onField: (item: {
            path: string;
            value: unknown;
          }) => {
            options.onField?.({
              path: item.path,
              value: item.value,
              streamTarget: item.path,
            });
          },
        }
      : {}),
  });

  const scores: AxisScore[] = [];
  const unscoredAxes: UnscoredAxis[] = [];
  let rebuilds = 0;
  let bleedTrimmed = 0;
  let grammarFails = 0;
  let errors = 0;

  try {
    for (const axis of options.axes) {
      const fields = axisFields(axis);
      try {
        const linesResult = await session.fill(fields.lines);
        if (linesResult.absent || !Array.isArray(linesResult.value)) {
          await session.writeDeterministic(fields.quote, ABSENT_TOKEN);
          await session.writeDeterministic(fields.score, ABSENT_TOKEN);
          unscoredAxes.push({ axisId: axis.id, reason: "absent" });
          continue;
        }
        const lineRefs = linesResult.value as number[];
        const lineTexts = lineRefs
          .map((n) => (options.lines.get(n) ?? "").trim())
          .filter((line) => line.length > 0);
        const choices = quoteSubstringChoices(lineTexts);
        if (choices.length === 0) {
          await session.writeDeterministic(fields.quote, ABSENT_TOKEN);
          await session.writeDeterministic(fields.score, ABSENT_TOKEN);
          unscoredAxes.push({ axisId: axis.id, reason: "absent" });
          continue;
        }

        const citedPreview = lineRefs
          .map((n) => `${n}|${options.lines.get(n) ?? ""}`)
          .join("\n");
        await session.injectRaw(`(cited lines for ${axis.id})\n${citedPreview}\n`);

        const quoteField: FillableField = {
          ...fields.quote,
          stringChoices: choices,
        };

        const quoteResult = await session.fill(quoteField);
        if (
          quoteResult.absent ||
          typeof quoteResult.value !== "string" ||
          !String(quoteResult.value).trim()
        ) {
          await session.writeDeterministic(fields.score, ABSENT_TOKEN);
          unscoredAxes.push({ axisId: axis.id, reason: "absent" });
          continue;
        }
        const excerpt = String(quoteResult.value).trim();
        // Grammar only allows substrings of cited lines — no separate citation check.

        const scoreResult = await session.fill(fields.score);
        if (
          scoreResult.absent ||
          typeof scoreResult.value !== "number" ||
          !Number.isInteger(scoreResult.value)
        ) {
          unscoredAxes.push({ axisId: axis.id, reason: "absent" });
          continue;
        }
        const value = scoreResult.value;
        if (value < axis.range[0] || value > axis.range[1]) {
          unscoredAxes.push({ axisId: axis.id, reason: "error" });
          continue;
        }
        scores.push({
          axisId: axis.id,
          value,
          max: axis.range[1],
          confidence: scoreResult.confidence,
          evidence: { lineRefs, excerpt },
        });
      } catch {
        unscoredAxes.push({ axisId: axis.id, reason: "error" });
        await session.rebuild();
      }
    }
  } finally {
    rebuilds = session.rebuilds;
    bleedTrimmed = session.bleedTrimmed;
    grammarFails = session.grammarFails;
    errors = session.errors;
    await session.close();
  }

  return { scores, unscoredAxes, rebuilds, bleedTrimmed, grammarFails, errors };
}

export async function compare(input: CompareInput): Promise<CompareResult> {
  const startedAt = performance.now();
  const rubric = loadRubric(input.rubricId);
  const deterministic = rubric.rules.filter((rule) => rule.kind === "deterministic");
  const findings = deterministic.flatMap((rule) => {
    const implementation = rule.implementation ? deterministicRules[rule.implementation] : undefined;
    if (!implementation) throw new Error(`Unknown deterministic rule implementation: ${rule.implementation ?? "missing"}`);
    return implementation(rule.id, severity(rule.severity), input.artifact.kind === "structured" ? input.artifact.data : input.artifact);
  });

  const packTier = (process.env.REDROB_PACK_TIER as Tier | undefined) ?? DEFAULT_LOCAL_PACK_TIER;
  const tier = packTier;
  await detectDeviceProfile().catch(() => undefined);

  if (rubric.axes.length === 0) {
    return {
      rubricId: rubric.id,
      findings,
      unscoredAxes: [],
      timing: { totalMs: performance.now() - startedAt },
      tierUsed: tier,
      rebuilds: 0,
      bleedTrimmed: 0,
      grammarFails: 0,
      errors: 0,
    };
  }

  const { numberedText, lines } = numberLines(await artifactText(input.artifact));
  const modelRules = rubric.rules.filter((rule) => rule.kind === "model");
  const modelRulePrompts =
    modelRules.length > 0
      ? `Rubric notes:\n${modelRules.map((rule) => `${rule.id}: ${rule.prompt}`).join("\n")}`
      : "Rubric notes: (none)";

  // Scoring follows the Settings inference route. The local path constrains the
  // model with a grammar and reads logprob confidence; a cloud route has neither
  // (no local weights, no logprobs), so it scores over JSON with degraded
  // confidence and an after-the-fact citation check. This is what lets a
  // machine with no GPU still complete the assess step.
  const providers = readLlmProvidersFromEnv();
  const route = resolveInferenceRoute({
    mode: readInferenceRouteFromEnv(),
    providers,
    localAvailable: await localModelAvailable(),
    redrobAvailable: redrobAvailableFromEnv(),
    workload: { kind: "fieldFill", text: numberedText },
  });

  let scored: {
    scores: AxisScore[];
    unscoredAxes: UnscoredAxis[];
    rebuilds: number;
    bleedTrimmed: number;
    grammarFails: number;
    errors: number;
  };

  if (route.provider === "openai" || route.provider === "openrouter" || route.provider === "anthropic") {
    scored = await scoreAxesCloud({
      provider: route.provider,
      model: route.model,
      providers,
      numberedText,
      lines,
      axes: rubric.axes,
      modelRulePrompts,
      ...(input.onField ? { onField: input.onField } : {}),
    });
  } else if (route.provider === "redrob_remote") {
    throw new Error(
      "Redrob Remote scoring is not wired. Use a local model or add a cloud API key.",
    );
  } else {
    await applyExecutionPlan();
    const modelsDir = modelsDirectory();
    void modelsDir;
    const plan = getActiveExecutionPlan() ?? (await applyExecutionPlan());
    const modelPath = plan.modelPath;
    // Ensure artifact metadata still resolves for pack tier checks.
    const modelId = TIERS[(process.env.REDROB_PACK_TIER as Tier | undefined) ?? DEFAULT_LOCAL_PACK_TIER].text;
    if (!MODEL_ARTIFACTS[plan.modelId] && !MODEL_ARTIFACTS[modelId]) {
      throw new Error(`No local text model is configured for plan ${plan.modelId}.`);
    }
    scored = await scoreAxes({
      modelPath,
      numberedText,
      lines,
      axes: rubric.axes,
      modelRulePrompts,
      ...(input.onField ? { onField: input.onField } : {}),
    });
  }

  const { scores, unscoredAxes, rebuilds, bleedTrimmed, grammarFails, errors } = scored;

  return {
    rubricId: rubric.id,
    findings,
    ...(scores.length > 0 ? { scores } : {}),
    unscoredAxes,
    timing: { totalMs: performance.now() - startedAt },
    tierUsed: tier,
    rebuilds,
    bleedTrimmed,
    grammarFails,
    errors,
  };
}
