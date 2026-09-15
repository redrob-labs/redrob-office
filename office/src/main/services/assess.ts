import { randomUUID } from "node:crypto";
import { type CompareResult } from "@redrob/compare";
import { hostCompare } from "./inference-host.js";
import {
  appendAudit,
  createRun,
  insertFinding,
  listDocuments,
  listFieldsByDocument,
  listRecentFindings,
  updateRun,
  type Document,
  type Finding,
  type Store,
} from "@redrob/store";
import { listUserRubricIds } from "@redrob/registry";
import { nowIso } from "../app-time.js";

export interface DocumentSummary {
  id: string;
  path: string;
  schemaId: string;
  extractedAt: string;
  fieldCount: number;
}

export function listDocumentSummaries(store: Store, schemaId?: string): DocumentSummary[] {
  return listDocuments(store, schemaId).map((doc) => ({
    id: doc.id,
    path: doc.path,
    schemaId: doc.schemaId,
    extractedAt: doc.extractedAt,
    fieldCount: listFieldsByDocument(store, doc.id).length,
  }));
}

export function documentFieldsAsObject(store: Store, documentId: string): Record<string, unknown> {
  const fields = listFieldsByDocument(store, documentId);
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    const key = field.pointer.replace(/^\//, "").replace(/\//g, ".");
    try {
      data[key] = JSON.parse(field.value) as unknown;
    } catch {
      data[key] = field.value;
    }
  }
  return data;
}

export function documentAsRankText(store: Store, documentId: string): string {
  const fields = listFieldsByDocument(store, documentId);
  return fields.map((field) => `${field.pointer}: ${field.value}`).join("\n");
}

export interface AssessRequest {
  workspaceId: string;
  documentId: string;
  rubricId: string;
}

export interface AssessResult {
  runId: string;
  compare: CompareResult;
  findingsSaved: number;
}

export async function runAssess(
  store: Store,
  input: AssessRequest,
  options?: {
    onField?: (field: {
      path: string;
      value: unknown;
      streamTarget: string;
    }) => void;
  },
): Promise<AssessResult> {
  const data = documentFieldsAsObject(store, input.documentId);
  if (Object.keys(data).length === 0) {
    throw new Error("ERR_NO_FIELDS");
  }
  const startedAt = nowIso();
  const runId = randomUUID();
  createRun(store, {
    id: runId,
    workspaceId: input.workspaceId,
    engine: "process",
    startedAt,
    finishedAt: null,
    itemCount: 1,
    timingJson: null,
    tierStart: "T4",
    tierEnd: null,
    tierChanged: false,
  });

  const result = await hostCompare({
    artifact: { kind: "structured", data },
    rubricId: input.rubricId,
    ...(options?.onField ? { onField: options.onField } : {}),
  });

  let findingsSaved = 0;
  for (const finding of result.findings) {
    insertFinding(store, {
      id: randomUUID(),
      runId,
      rubricId: result.rubricId,
      ruleId: finding.ruleId,
      severity: finding.severity,
      message: finding.message,
      evidenceJson: JSON.stringify(finding.evidence),
      confidenceJson: JSON.stringify(finding.confidence),
    });
    findingsSaved += 1;
  }

  updateRun(store, {
    id: runId,
    workspaceId: input.workspaceId,
    engine: "process",
    startedAt,
    finishedAt: nowIso(),
    itemCount: 1,
    timingJson: JSON.stringify(result.timing),
    tierStart: result.tierUsed,
    tierEnd: result.tierUsed,
    tierChanged: false,
  });

  appendAudit(store, {
    id: randomUUID(),
    at: nowIso(),
    action: "assess.completed",
    payloadJson: JSON.stringify({
      runId,
      documentId: input.documentId,
      rubricId: input.rubricId,
      scoreCount: result.scores?.length ?? 0,
      findingsSaved,
    }),
  });

  return { runId, compare: result, findingsSaved };
}

export function listRubricChoices(): string[] {
  const bundled = ["recruiting/candidate-6axis"];
  const user = listUserRubricIds();
  return Array.from(new Set([...bundled, ...user])).sort();
}

export function listFindings(store: Store, limit = 50): Finding[] {
  return listRecentFindings(store, limit);
}

export type { Document, Finding };
