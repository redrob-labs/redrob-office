import type { Store } from "../db.js";

export interface Finding {
  id: string;
  runId: string;
  rubricId: string;
  ruleId: string;
  severity: string;
  message: string;
  evidenceJson: string | null;
  confidenceJson: string | null;
}

export interface UpsertFindingInput {
  id: string;
  runId: string;
  rubricId: string;
  ruleId: string;
  severity: string;
  message: string;
  evidenceJson?: string | null;
  confidenceJson?: string | null;
}

function toFinding(row: Record<string, unknown> | undefined): Finding | undefined {
  if (!row) return undefined;
  return {
    id: String(row.id),
    runId: String(row.run_id),
    rubricId: String(row.rubric_id),
    ruleId: String(row.rule_id),
    severity: String(row.severity),
    message: String(row.message),
    evidenceJson: row.evidence_json === null || row.evidence_json === undefined ? null : String(row.evidence_json),
    confidenceJson:
      row.confidence_json === null || row.confidence_json === undefined ? null : String(row.confidence_json),
  };
}

export function insertFinding(store: Store, input: UpsertFindingInput): Finding {
  store.db
    .prepare(
      `INSERT INTO findings (
        id, run_id, rubric_id, rule_id, severity, message, evidence_json, confidence_json
      ) VALUES (
        @id, @runId, @rubricId, @ruleId, @severity, @message, @evidenceJson, @confidenceJson
      )`,
    )
    .run({
      ...input,
      evidenceJson: input.evidenceJson ?? null,
      confidenceJson: input.confidenceJson ?? null,
    });
  return listFindingsByRun(store, input.runId).find((finding) => finding.id === input.id)!;
}

export function listFindingsByRun(store: Store, runId: string): Finding[] {
  return store.db
    .prepare("SELECT * FROM findings WHERE run_id = ? ORDER BY severity ASC, id ASC")
    .all(runId)
    .map((row) => toFinding(row as Record<string, unknown>)!)
    .filter((finding): finding is Finding => finding !== undefined);
}

export function listRecentFindings(store: Store, limit = 50): Finding[] {
  return store.db
    .prepare(
      `SELECT f.* FROM findings f
       INNER JOIN runs r ON r.id = f.run_id
       ORDER BY r.started_at DESC, f.id ASC
       LIMIT ?`,
    )
    .all(limit)
    .map((row) => toFinding(row as Record<string, unknown>)!)
    .filter((finding): finding is Finding => finding !== undefined);
}
