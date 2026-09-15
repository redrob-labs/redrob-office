import { randomUUID } from "node:crypto";
import { extract } from "@redrob/extract";
import {
  appendAudit,
  createRun,
  insertFinding,
  listDocuments,
  listFieldsByDocument,
  updateRun,
  type Store,
} from "@redrob/store";
import { nowIso } from "../app-time.js";

export interface VerifyRequest {
  workspaceId: string;
  candidateDocumentId: string;
  certificateText: string;
}

export interface VerifyMismatch {
  ruleId: string;
  severity: "blocker" | "warn" | "info";
  message: string;
  candidateValue: string;
  certificateValue: string;
}

export interface VerifyResult {
  runId: string;
  mismatches: VerifyMismatch[];
  certificateFields: Record<string, string>;
  findingsSaved: number;
}

function fieldMap(store: Store, documentId: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of listFieldsByDocument(store, documentId)) {
    out[field.pointer] = field.value;
  }
  return out;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Certificate check: extract certificate text, compare key fields to a candidate resume.
 * Mismatches become review findings (검토 엔진).
 */
export async function runVerify(store: Store, input: VerifyRequest): Promise<VerifyResult> {
  if (!input.certificateText.trim()) {
    throw new Error("ERR_EMPTY_CERTIFICATE");
  }
  const candidates = listDocuments(store, "recruiting/resume");
  if (!candidates.some((doc) => doc.id === input.candidateDocumentId)) {
    throw new Error("ERR_RESUME_NOT_FOUND");
  }

  const extracted = await extract({
    source: { kind: "text", content: input.certificateText },
    schemaId: "recruiting/degree-certificate.in",
  });

  const certificateFields: Record<string, string> = {};
  for (const field of extracted.fields) {
    if (!field.confidence) {
      throw new Error(`ERR_FIELD_NO_CONFIDENCE:${field.path}`);
    }
    certificateFields[field.path] = String(field.value ?? "");
  }

  const candidate = fieldMap(store, input.candidateDocumentId);
  const mismatches: VerifyMismatch[] = [];

  const nameOnResume = candidate["/name"] ?? "";
  const nameOnCert = certificateFields["/studentName"] ?? "";
  if (nameOnResume && nameOnCert && normalize(nameOnResume) !== normalize(nameOnCert)) {
    mismatches.push({
      ruleId: "name-mismatch",
      severity: "blocker",
      message: "이력서 이름과 증명서 이름이 다릅니다.",
      candidateValue: nameOnResume,
      certificateValue: nameOnCert,
    });
  }

  const skills = candidate["/skills"] ?? "";
  const degree = certificateFields["/degree"] ?? "";
  if (degree && skills && !normalize(skills).includes(normalize(degree).slice(0, 12)) && degree.length > 3) {
    mismatches.push({
      ruleId: "degree-not-on-resume",
      severity: "warn",
      message: "증명서 학위가 이력서 기술·경력 요약에서 보이지 않습니다.",
      candidateValue: skills.slice(0, 120),
      certificateValue: degree,
    });
  }

  if (mismatches.length === 0) {
    mismatches.push({
      ruleId: "certificate-ok",
      severity: "info",
      message: "이름 기준으로는 맞습니다. 기관·날짜는 사람이 한 번 더 보면 됩니다.",
      candidateValue: nameOnResume,
      certificateValue: nameOnCert || certificateFields["/institution"] || "",
    });
  }

  const startedAt = nowIso();
  const runId = randomUUID();
  createRun(store, {
    id: runId,
    workspaceId: input.workspaceId,
    engine: "review",
    startedAt,
    finishedAt: null,
    itemCount: 1,
    timingJson: null,
    tierStart: extracted.tierUsed,
    tierEnd: null,
    tierChanged: false,
  });

  let findingsSaved = 0;
  for (const mismatch of mismatches) {
    if (mismatch.severity === "info") continue;
    insertFinding(store, {
      id: randomUUID(),
      runId,
      rubricId: "recruiting/degree-certificate.in",
      ruleId: mismatch.ruleId,
      severity: mismatch.severity,
      message: mismatch.message,
      evidenceJson: JSON.stringify({
        candidateValue: mismatch.candidateValue,
        certificateValue: mismatch.certificateValue,
      }),
      confidenceJson: null,
    });
    findingsSaved += 1;
  }

  updateRun(store, {
    id: runId,
    workspaceId: input.workspaceId,
    engine: "review",
    startedAt,
    finishedAt: nowIso(),
    itemCount: 1,
    timingJson: JSON.stringify(extracted.timing),
    tierStart: extracted.tierUsed,
    tierEnd: extracted.tierUsed,
    tierChanged: false,
  });

  appendAudit(store, {
    id: randomUUID(),
    at: nowIso(),
    action: "verify.completed",
    payloadJson: JSON.stringify({
      runId,
      candidateDocumentId: input.candidateDocumentId,
      mismatchCount: mismatches.filter((item) => item.severity !== "info").length,
    }),
  });

  return { runId, mismatches, certificateFields, findingsSaved };
}
