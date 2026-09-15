import type { Finding } from "../index.js";

export type DeterministicRule = (ruleId: string, severity: Finding["severity"], artifact: unknown) => Finding[];

const deterministicConfidence = {
  meanLogprob: 0,
  minLogprob: 0,
  score: 1,
  tokenCount: 1,
} as const;

function finding(ruleId: string, severity: Finding["severity"], message: string, pointer?: string): Finding {
  return {
    ruleId,
    severity,
    message,
    evidence: pointer === undefined ? {} : { pointer },
    confidence: deterministicConfidence,
  };
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function dateValue(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export const dateContinuity: DeterministicRule = (ruleId, severity, artifact) => {
  const data = object(artifact);
  if (!data) return [];
  const findings: Finding[] = [];
  for (const key of ["employment", "education"]) {
    const entries = data[key];
    if (!Array.isArray(entries)) continue;
    let previousStart: number | undefined;
    let previousEnd: number | undefined;
    entries.forEach((entry, index) => {
      const range = object(entry);
      if (!range) return;
      const start = dateValue(range.startDate ?? range.start);
      const end = dateValue(range.endDate ?? range.end);
      if (start !== undefined && end !== undefined && start > end) {
        findings.push(finding(ruleId, severity, `${key} range starts after it ends.`, `/${key}/${index}`));
      }
      if (previousStart !== undefined && start !== undefined && start < previousStart) {
        findings.push(finding(ruleId, severity, `${key} entries are out of chronological order.`, `/${key}/${index}`));
      }
      if (previousEnd !== undefined && start !== undefined && start < previousEnd) {
        findings.push(finding(ruleId, severity, `${key} date ranges overlap.`, `/${key}/${index}`));
      }
      if (start !== undefined) previousStart = start;
      if (end !== undefined) previousEnd = end;
    });
  }
  return findings;
};

export const tokenEquality: DeterministicRule = (ruleId, severity, artifact) => {
  const data = object(artifact);
  if (!data || typeof data.left !== "string" || typeof data.right !== "string") return [];
  return data.left === data.right ? [] : [finding(ruleId, severity, "Tokens are not equal.")];
};

export const stringLength: DeterministicRule = (ruleId, severity, artifact) => {
  const data = object(artifact);
  if (!data || typeof data.text !== "string" || typeof data.maxLength !== "number") return [];
  return data.text.length <= data.maxLength ? [] : [finding(ruleId, severity, `String exceeds ${data.maxLength} characters.`)];
};

function luminance(hex: string): number | undefined {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return undefined;
  const channels = match.slice(1).map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

export const contrastRatio: DeterministicRule = (ruleId, severity, artifact) => {
  const data = object(artifact);
  if (!data || typeof data.foreground !== "string" || typeof data.background !== "string") return [];
  const foreground = luminance(data.foreground);
  const background = luminance(data.background);
  if (foreground === undefined || background === undefined) return [];
  const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  const minimum = typeof data.minimumContrast === "number" ? data.minimumContrast : 4.5;
  return ratio >= minimum ? [] : [finding(ruleId, severity, `Contrast ratio ${ratio.toFixed(2)} is below ${minimum}.`)];
};

export const deterministicRules: Record<string, DeterministicRule> = {
  dateContinuity,
  tokenEquality,
  stringLength,
  contrastRatio,
};
