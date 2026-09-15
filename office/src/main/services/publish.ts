import { readFile, writeFile } from "node:fs/promises";
import { generate, maskPii } from "@redrob/generate";
import { documentFieldsAsObject } from "./assess.js";
import { saveArtifact } from "./artifacts.js";
import type { Store } from "@redrob/store";

export type DeskLocale = "en" | "ko";

export interface PublishRequest {
  documentId: string;
  rubricScoresText?: string;
  recommendation?: string;
  risks?: string;
  locale?: DeskLocale;
}

export interface PublishResult {
  templateId: string;
  path: string;
  unfilled: string[];
  timingMs: number;
  artifactId: string;
  body: string;
}

function normalizeLocale(locale?: string): DeskLocale {
  return locale === "en" ? "en" : "ko";
}

export async function runPublish(
  store: Store,
  input: PublishRequest,
  onProgress?: (stepId: "load" | "fill" | "mask" | "save") => void,
): Promise<PublishResult> {
  const locale = normalizeLocale(input.locale);
  onProgress?.("load");
  const data = documentFieldsAsObject(store, input.documentId);
  const name =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : locale === "en"
        ? "Candidate"
        : "후보자";

  const experienceLabel =
    typeof data.totalExperienceMonths === "number" ||
    typeof data.totalExperienceMonths === "string"
      ? locale === "en"
        ? `${data.totalExperienceMonths} months experience`
        : `경력 ${data.totalExperienceMonths}개월`
      : null;

  const summaryParts = [
    name,
    typeof data.email === "string" ? data.email : null,
    typeof data.skills === "string" ? data.skills : null,
    experienceLabel,
  ].filter(Boolean);

  const payload = {
    candidateSummary: summaryParts.join(" · "),
    rubricScores:
      input.rubricScoresText?.trim() ||
      (locale === "en"
        ? "No scores yet. Run rubric scoring first."
        : "채점 결과 없음. 기준별 채점을 먼저 돌리세요."),
    recommendation:
      input.recommendation?.trim() ||
      (locale === "en"
        ? "Hold — confirm low-confidence extracted fields in the intake results first."
        : "보류 - 인테이크 결과에서 확신이 낮은 항목을 먼저 확인하세요."),
    ...(input.risks?.trim() ? { risks: input.risks.trim() } : {}),
  };

  onProgress?.("fill");
  const result = await generate({
    templateId: "recruiting/candidate-report",
    data: payload,
    locale,
  });

  onProgress?.("mask");
  const raw = await readFile(result.output.path, "utf8");
  const masked = maskPii(raw);
  await writeFile(result.output.path, masked, "utf8");

  onProgress?.("save");
  const artifact = await saveArtifact({
    kind: "report",
    title: locale === "en" ? `${name} report` : `${name} 리포트`,
    body: masked,
    categoryId: "recruiting",
    source: "template",
  });

  return {
    templateId: result.templateId,
    path: artifact.id,
    unfilled: result.unfilled,
    timingMs: result.timing.totalMs,
    artifactId: artifact.id,
    body: masked,
  };
}
