import { useEffect, useState } from "react";
import { useI18n } from "@redrob/ui";
import type { DocumentSummary, SlotStreamEvent } from "../../shared/office-api";
import { handleSubmitHotkey } from "./submit-hotkey";
import { mapDeskError } from "./desk-errors";
import {
  rubricAxisLabel,
  rubricLabel,
  severityLabel,
  unscoredReasonLabel,
} from "./schema-label";

function previewValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function AssessPanel({ workspaceId }: { workspaceId: string }): JSX.Element {
  const { t, locale } = useI18n();
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [rubrics, setRubrics] = useState<string[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [rubricId, setRubricId] = useState("recruiting/candidate-6axis");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveSlots, setLiveSlots] = useState<SlotStreamEvent[]>([]);
  const [result, setResult] = useState<{
    scores?: Array<{ axisId: string; value: number; max: number }>;
    unscoredAxes?: Array<{ axisId: string; reason: string }>;
    findings: Array<{ ruleId: string; severity: string; message: string }>;
    findingsSaved: number;
  } | null>(null);

  useEffect(() => {
    void window.office.listDocuments("recruiting/resume").then((list) => {
      setDocs(list);
      if (list[0]) setDocumentId(list[0].id);
    });
    void window.office.listRubricChoices().then((list) => {
      setRubrics(list);
      if (list[0]) setRubricId(list[0]);
    });
  }, []);

  useEffect(() => {
    return window.office.onSlotStream((event) => {
      if (event.operation !== "assess") return;
      setLiveSlots((prev) => {
        const without = prev.filter((item) => item.streamTarget !== event.streamTarget);
        return [...without, event];
      });
    });
  }, []);

  async function run(): Promise<void> {
    if (!documentId) {
      setError(t("assess.noDocs"));
      return;
    }
    setBusy(true);
    setError(null);
    setLiveSlots([]);
    try {
      const raw = (await window.office.runAssess({
        workspaceId,
        documentId,
        rubricId,
      })) as {
        compare: {
          scores?: Array<{ axisId: string; value: number; max: number }>;
          unscoredAxes?: Array<{ axisId: string; reason: string }>;
          findings: Array<{ ruleId: string; severity: string; message: string }>;
        };
        findingsSaved: number;
      };
      setResult({
        ...(raw.compare.scores ? { scores: raw.compare.scores } : {}),
        ...(raw.compare.unscoredAxes ? { unscoredAxes: raw.compare.unscoredAxes } : {}),
        findings: raw.compare.findings,
        findingsSaved: raw.findingsSaved,
      });
      const scoresText = (raw.compare.scores ?? [])
        .map((score) => `${score.axisId}: ${score.value}/${score.max}`)
        .join("\n");
      const { saveAssessHandoff } = await import("./assess-handoff");
      saveAssessHandoff({
        documentId,
        scoresText,
        recommendation:
          (raw.compare.scores ?? []).reduce((sum, s) => sum + s.value, 0) >=
          (raw.compare.scores ?? []).reduce((sum, s) => sum + s.max, 0) * 0.7
            ? "interview"
            : "hold",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(mapDeskError(message, t));
    } finally {
      setBusy(false);
    }
  }

  const scoredTotal = (result?.scores ?? []).reduce((sum, score) => sum + score.value, 0);
  const scoredMax = (result?.scores ?? []).reduce((sum, score) => sum + score.max, 0);
  const unscoredCount = result?.unscoredAxes?.length ?? 0;
  const latestLive = liveSlots[liveSlots.length - 1];

  return (
    <div
      className="panel"
      onKeyDown={(event) =>
        handleSubmitHotkey(event, !busy && Boolean(documentId), () => void run())
      }
    >
      <div className="surface p-6">
        <p className="font-medium">{t("assess.title")}</p>
        <p className="mt-1 text-sm text-gray-500">{t("assess.body")}</p>
        <label className="mt-4 block text-sm">
          <span className="text-gray-600">{t("assess.document")}</span>
          <select
            className="mt-1 w-full rounded border-0 bg-gray-100 px-3 py-2 text-sm"
            value={documentId}
            onChange={(event) => setDocumentId(event.target.value)}
          >
            {docs.length === 0 ? <option value="">{t("assess.noDocs")}</option> : null}
            {docs.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.path.split(/[/\\]/).pop() || doc.path}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-gray-600">{t("assess.rubric")}</span>
          <select
            className="mt-1 w-full rounded border-0 bg-gray-100 px-3 py-2 text-sm"
            value={rubricId}
            onChange={(event) => setRubricId(event.target.value)}
          >
            {rubrics.map((id) => (
              <option key={id} value={id}>
                {rubricLabel(t, id, locale)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-primary mt-4" disabled={busy || !documentId} onClick={() => void run()}>
          {busy ? t("assess.working") : t("assess.run")}
        </button>
        {busy && latestLive ? (
          <p className="mt-3 truncate text-xs text-gray-500">
            {t("assess.slotStream", {
              target: latestLive.streamTarget,
              value: previewValue(latestLive.value),
            })}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded border border-destructive-muted bg-destructive-soft p-3 text-sm text-destructive-ink">{error}</p>
        ) : null}
      </div>
      {result ? (
        <div className="surface p-6">
          <p className="font-medium">{t("assess.scores")}</p>
          {(result.scores ?? []).length > 0 ? (
            <p className="mt-1 text-sm text-gray-500">
              {scoredTotal} / {scoredMax}
              {unscoredCount > 0 ? ` · ${t("assess.unscored", { count: unscoredCount })}` : ""}
            </p>
          ) : unscoredCount > 0 ? (
            <p className="mt-1 text-sm text-gray-500">{t("assess.unscored", { count: unscoredCount })}</p>
          ) : null}
          <ul className="mt-3 space-y-2 text-sm">
            {(result.scores ?? []).map((score) => (
              <li key={score.axisId} className="flex justify-between rounded bg-gray-100 px-3 py-2">
                <span>{rubricAxisLabel(t, rubricId, score.axisId)}</span>
                <span className="font-semibold">
                  {score.value} / {score.max}
                </span>
              </li>
            ))}
            {(result.unscoredAxes ?? []).map((axis) => (
              <li
                key={`unscored-${axis.axisId}`}
                className="flex justify-between rounded bg-warning-soft px-3 py-2 text-warning-ink"
              >
                <span>{rubricAxisLabel(t, rubricId, axis.axisId)}</span>
                <span className="text-xs">{unscoredReasonLabel(t, axis.reason)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 font-medium">{t("assess.findings")}</p>
          <ul className="mt-2 space-y-2 text-sm text-gray-600">
            {result.findings.map((finding, index) => (
              <li key={`${finding.ruleId}-${index}`}>
                [{severityLabel(t, finding.severity)}] {finding.message}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-400">
            {t("assess.saved", { count: result.findingsSaved })}
          </p>
        </div>
      ) : null}
    </div>
  );
}
