import { generate, maskPii } from "@redrob/generate";
import { documentFieldsAsObject } from "./assess.js";
import { saveArtifact } from "./artifacts.js";
import type { Store } from "@redrob/store";

export type DecisionKind = "pass" | "reject";
export type DeskLocale = "en" | "ko";

export interface DecisionEmailRequest {
  documentId: string;
  decision: DecisionKind;
  roleTitle?: string;
  notes?: string;
  locale?: DeskLocale;
}

export interface DecisionEmailResult {
  templateId: string;
  path: string;
  unfilled: string[];
  timingMs: number;
  artifactId: string;
  preview: {
    subject: string;
    body: string;
  };
}

function normalizeLocale(locale?: string): DeskLocale {
  return locale === "en" ? "en" : "ko";
}

function buildBody(input: {
  decision: DecisionKind;
  candidateName: string;
  roleTitle: string;
  notes?: string;
  locale: DeskLocale;
}): string {
  if (input.locale === "en") {
    const role = input.roleTitle || "this role";
    if (input.decision === "pass") {
      return [
        `Hi ${input.candidateName},`,
        "",
        `Thank you for interviewing for ${role}. We'd like to move you forward to the next step.`,
        input.notes?.trim() || "We'll follow up separately with scheduling details.",
        "",
        "Best regards,",
      ].join("\n");
    }
    return [
      `Hi ${input.candidateName},`,
      "",
      `Thank you for applying for ${role}. After careful review, we won't be moving forward this time.`,
      input.notes?.trim() || "We wish you the best in your search.",
      "",
      "Best regards,",
    ].join("\n");
  }

  const role = input.roleTitle || "해당 포지션";
  if (input.decision === "pass") {
    return [
      `${input.candidateName}님, 안녕하세요.`,
      "",
      `${role} 채용 전형 결과, 다음 단계로 모시고자 합니다.`,
      input.notes?.trim() || "일정은 별도 안내드리겠습니다.",
      "",
      "감사합니다.",
    ].join("\n");
  }
  return [
    `${input.candidateName}님, 안녕하세요.`,
    "",
    `${role} 지원에 감사드립니다. 이번 전형에서는 함께하지 못하게 되었습니다.`,
    input.notes?.trim() || "좋은 인연이 닿길 바랍니다.",
    "",
    "감사합니다.",
  ].join("\n");
}

export async function draftDecisionEmail(
  store: Store,
  input: DecisionEmailRequest,
  onProgress?: (stepId: "load" | "draft" | "save") => void,
): Promise<DecisionEmailResult> {
  if (input.decision !== "pass" && input.decision !== "reject") {
    throw new Error("decision must be pass or reject.");
  }
  const locale = normalizeLocale(input.locale);
  onProgress?.("load");
  const data = documentFieldsAsObject(store, input.documentId);
  const candidateName =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : locale === "en"
        ? "Candidate"
        : "지원자";
  const roleTitle = input.roleTitle?.trim() || "";
  const roleLabel =
    roleTitle || (locale === "en" ? "Hiring" : "채용");
  const subject =
    locale === "en"
      ? input.decision === "pass"
        ? `[Next step] ${roleLabel} update`
        : `[Update] ${roleLabel} application`
      : input.decision === "pass"
        ? `[합격] ${roleLabel} 전형 안내`
        : `[결과] ${roleLabel} 지원 결과 안내`;
  onProgress?.("draft");
  const body = buildBody({
    decision: input.decision,
    candidateName,
    roleTitle,
    locale,
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  });

  const result = await generate({
    templateId: "recruiting/decision-email",
    data: {
      subject,
      decision: input.decision,
      candidateName,
      body,
      ...(roleTitle ? { roleTitle } : {}),
    },
    locale,
  });

  onProgress?.("save");
  const markdown = maskPii(`# ${subject}\n\n${body}\n`);
  const artifact = await saveArtifact({
    kind: "email",
    title: subject,
    body: markdown,
    categoryId: "recruiting",
    source: "template",
  });

  return {
    templateId: result.templateId,
    path: artifact.id,
    unfilled: result.unfilled,
    timingMs: result.timing.totalMs,
    artifactId: artifact.id,
    preview: { subject, body: maskPii(body) },
  };
}
