import { useEffect, useState } from "react";
import { useI18n } from "@redrob/ui";
import type { DocumentSummary } from "../../shared/office-api";
import { handleSubmitHotkey } from "./submit-hotkey";
import { estimateOperationMs, useWorkResult } from "./work-result";

export function PublishPanel(): JSX.Element {
  const { t, locale } = useI18n();
  const { setResult, startProgress, failProgress, clearProgress } = useWorkResult();
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [rubricScoresText, setRubricScoresText] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.office.listDocuments("recruiting/resume").then((list) => {
      setDocs(list);
      if (list[0]) setDocumentId(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!documentId) return;
    void import("./assess-handoff").then(({ loadAssessHandoff }) => {
      const handoff = loadAssessHandoff(documentId);
      if (!handoff) return;
      if (handoff.scoresText) setRubricScoresText(handoff.scoresText);
      if (handoff.recommendation) setRecommendation(handoff.recommendation);
    });
  }, [documentId]);

  async function run(): Promise<void> {
    if (!documentId) {
      setError(t("publish.noDocs"));
      return;
    }
    setBusy(true);
    setError(null);
    const etaMs = await estimateOperationMs("publish", 3_000);
    startProgress({
      operation: "runPublish",
      title: t("publish.title"),
      etaMs,
      steps: [
        { id: "load", label: t("progress.publish.load"), status: "active" },
        { id: "fill", label: t("progress.publish.fill"), status: "pending" },
        { id: "mask", label: t("progress.publish.mask"), status: "pending" },
        { id: "save", label: t("progress.publish.save"), status: "pending" },
      ],
    });
    try {
      const raw = (await window.office.runPublish({
        documentId,
        locale,
        ...(rubricScoresText.trim() ? { rubricScoresText } : {}),
        ...(recommendation.trim() ? { recommendation } : {}),
      })) as { body: string; unfilled: string[]; timingMs?: number };
      setResult({
        title: t("publish.done"),
        body: raw.body,
        source: "template",
        meta: [
          typeof raw.timingMs === "number" ? `${Math.round(raw.timingMs)} ms` : null,
          raw.unfilled.length > 0 ? `${t("publish.unfilled")}: ${raw.unfilled.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    } catch (err) {
      failProgress();
      clearProgress();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex flex-col gap-4"
      onKeyDown={(event) =>
        handleSubmitHotkey(event, !busy && Boolean(documentId), () => void run())
      }
    >
      <p className="text-sm leading-relaxed text-gray-500">{t("publish.body")}</p>
      <label className="block">
        <span className="field-label">{t("publish.document")}</span>
        <select
          className="field-input"
          value={documentId}
          onChange={(event) => setDocumentId(event.target.value)}
        >
          {docs.length === 0 ? <option value="">{t("publish.noDocs")}</option> : null}
          {docs.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.path}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="field-label">{t("publish.scores")}</span>
        <textarea
          className="field-input min-h-24"
          value={rubricScoresText}
          onChange={(event) => setRubricScoresText(event.target.value)}
          placeholder={t("publish.scoresHint")}
        />
      </label>
      <label className="block">
        <span className="field-label">{t("publish.recommendation")}</span>
        <input
          className="field-input"
          value={recommendation}
          onChange={(event) => setRecommendation(event.target.value)}
          placeholder={t("publish.recommendationHint")}
        />
      </label>
      <button
        type="button"
        className="btn-primary self-start"
        disabled={busy || !documentId}
        onClick={() => void run()}
      >
        {busy ? t("publish.working") : t("publish.run")}
      </button>
      {error ? (
        <p className="rounded border border-destructive-muted bg-destructive-soft p-3 text-sm text-destructive-ink">{error}</p>
      ) : null}
    </div>
  );
}
