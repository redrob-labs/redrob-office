import {
  confidenceFromLogprobs,
  generateCloudChatWithFallback,
  type CloudProviderId,
  type LlmProviderSecrets,
} from "@redrob/kernel";
import type { RubricAxis } from "@redrob/registry";
import { citationHolds, type AxisScore, type UnscoredAxis } from "./index.js";

/** Cloud vendors do not return usable token logprobs, so score is low-confidence. */
const DEGRADED = confidenceFromLogprobs([-20]);

export interface ScoreAxesCloudOptions {
  provider: CloudProviderId;
  model: string;
  providers: LlmProviderSecrets;
  numberedText: string;
  lines: Map<number, string>;
  axes: readonly RubricAxis[];
  modelRulePrompts: string;
  onField?: (field: { path: string; value: unknown; streamTarget: string }) => void;
}

interface AxisAnswer {
  lines?: unknown;
  quote?: unknown;
  score?: unknown;
}

export function parseCloudScoreObject(text: string): Record<string, AxisAnswer> {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fence?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Cloud scoring response was not a JSON object");
  }
  const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Cloud scoring JSON must be an object");
  }
  return parsed as Record<string, AxisAnswer>;
}

function asLineRefs(value: unknown, known: ReadonlyMap<number, string>): number[] {
  const raw = Array.isArray(value) ? value : typeof value === "number" ? [value] : [];
  const refs: number[] = [];
  for (const item of raw) {
    const n = typeof item === "number" ? item : Number.parseInt(String(item), 10);
    if (Number.isInteger(n) && known.has(n) && !refs.includes(n)) refs.push(n);
  }
  return refs.slice(0, 3);
}

/**
 * Turn the model's JSON into validated axis scores. Pure: no network, no
 * confidence source — so the citation guard (a quote must actually appear in
 * its cited lines) and the range check can be tested directly.
 */
export function interpretCloudScores(
  parsed: Record<string, AxisAnswer>,
  lines: ReadonlyMap<number, string>,
  axes: readonly RubricAxis[],
  confidence: AxisScore["confidence"],
): {
  scores: AxisScore[];
  unscoredAxes: UnscoredAxis[];
  scoreByAxis: Map<string, number | null>;
} {
  const scores: AxisScore[] = [];
  const unscoredAxes: UnscoredAxis[] = [];
  const scoreByAxis = new Map<string, number | null>();

  for (const axis of axes) {
    const answer = parsed[axis.id];
    const lineRefs = asLineRefs(answer?.lines, lines);
    const quote = typeof answer?.quote === "string" ? answer.quote.trim() : "";
    const rawScore = answer?.score;
    const score =
      typeof rawScore === "number"
        ? rawScore
        : typeof rawScore === "string" && rawScore.trim()
          ? Number.parseInt(rawScore, 10)
          : Number.NaN;
    scoreByAxis.set(axis.id, Number.isFinite(score) ? score : null);

    if (lineRefs.length === 0 || !Number.isInteger(score)) {
      unscoredAxes.push({ axisId: axis.id, reason: "absent" });
      continue;
    }
    if (score < axis.range[0] || score > axis.range[1]) {
      unscoredAxes.push({ axisId: axis.id, reason: "error" });
      continue;
    }
    if (!quote || !citationHolds(lines, lineRefs, quote)) {
      unscoredAxes.push({ axisId: axis.id, reason: "citation_failed" });
      continue;
    }
    scores.push({
      axisId: axis.id,
      value: score,
      max: axis.range[1],
      confidence,
      evidence: { lineRefs, excerpt: quote },
    });
  }

  return { scores, unscoredAxes, scoreByAxis };
}

/**
 * Score rubric axes over a cloud model, one JSON call for the whole rubric.
 *
 * The local path constrains the model with a grammar so a quote can only be a
 * substring of a cited line; the cloud has no grammar, so the same guarantee is
 * enforced here after the fact — a quote that is not actually in its cited
 * lines leaves the axis unscored rather than trusting an invented citation.
 */
export async function scoreAxesCloud(options: ScoreAxesCloudOptions): Promise<{
  scores: AxisScore[];
  unscoredAxes: UnscoredAxis[];
  rebuilds: number;
  bleedTrimmed: number;
  grammarFails: number;
  errors: number;
}> {
  const axisList = options.axes
    .map(
      (axis) =>
        `- "${axis.id}" (integer score ${axis.range[0]}..${axis.range[1]}): ${axis.label} — ${axis.guidance}`,
    )
    .join("\n");

  const system = [
    "You score a candidate against rubric axes using ONLY the numbered artifact.",
    "Each artifact line is `N|text`. For each axis: choose 1-3 line numbers that are the evidence, copy an EXACT quote that appears verbatim inside one of those lines, and give an INTEGER score within the axis range.",
    "If the artifact holds no evidence for an axis, use an empty lines array and null score. Never invent text that is not in the artifact.",
    'Reply with a single JSON object mapping each axisId to {"lines": number[], "quote": string, "score": integer|null}. No prose.',
  ].join(" ");

  const user = [
    options.modelRulePrompts,
    "",
    "Axes:",
    axisList,
    "",
    "Numbered artifact:",
    options.numberedText,
  ].join("\n");

  const cloud = await generateCloudChatWithFallback({
    provider: options.provider,
    model: options.model,
    thinking: false,
    providers: options.providers,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: Math.min(4096, 256 + options.axes.length * 96),
    temperature: 0.1,
  });

  const parsed = parseCloudScoreObject(cloud.text);
  const { scores, unscoredAxes, scoreByAxis } = interpretCloudScores(
    parsed,
    options.lines,
    options.axes,
    DEGRADED,
  );

  for (const axis of options.axes) {
    options.onField?.({
      path: `/${axis.id}/score`,
      value: scoreByAxis.get(axis.id) ?? null,
      streamTarget: `${axis.id}.score`,
    });
  }

  return { scores, unscoredAxes, rebuilds: 0, bleedTrimmed: 0, grammarFails: 0, errors: 0 };
}
