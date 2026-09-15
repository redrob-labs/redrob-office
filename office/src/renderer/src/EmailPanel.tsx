import { useEffect, useState } from "react";
import { useI18n } from "@redrob/ui";
import type { DocumentSummary } from "../../shared/office-api";
import { handleSubmitHotkey } from "./submit-hotkey";
import { estimateOperationMs, useWorkResult } from "./work-result";

type Decision = "pass" | "reject";

export function EmailPanel(): JSX.Element {
  const { t, locale } = useI18n();
  const { setResult, startProgress, failProgress, clearProgress } = useWorkResult();
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [decision, setDecision] = useState<Decision>("pass");
  const [roleTitle, setRoleTitle] = useState("");
  const [notes, setNotes] = useState("");
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
      if (!handoff?.recommendation) return;
      if (handoff.recommendation === "interview" || handoff.recommendation === "pass") {
        setDecision("pass");
      } else if (handoff.recommendation === "reject") {
        setDecision("reject");
      }
      if (handoff.scoresText) {
        setNotes((prev) => prev || handoff.scoresText);
      }
    });
  }, [documentId]);

  async function run(): Promise<void> {
    if (!documentId) {
      setError(t("email.noDocs"));
      return;
    }
    setBusy(true);
    setError(null);
    const etaMs = await estimateOperationMs("draftDecisionEmail", 2_000);
    startProgress({
      operation: "draftDecisionEmail",
      title: t("email.preview"),
      etaMs,
      steps: [
        { id: "load", label: t("progress.email.load"), status: "active" },
        { id: "draft", label: t("progress.email.draft"), status: "pending" },
        { id: "save", label: t("progress.email.save"), status: "pending" },
      ],
    });
    try {
      const result = (await window.office.draftDecisionEmail({
        documentId,
        decision,
        locale,
        ...(roleTitle.trim() ? { roleTitle } : {}),
        ...(notes.trim() ? { notes } : {}),
      })) as {
        preview: { subject: string; body: string };
        timingMs?: number;
      };
      setResult({
        title: result.preview.subject,
        body: `# ${result.preview.subject}\n\n${result.preview.body}\n`,
        source: "template",
        ...(typeof result.timingMs === "number"
          ? { meta: `${Math.round(result.timingMs)} ms` }
          : {}),
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
      <p className="text-sm leading-relaxed text-gray-500">{t("email.body")}</p>
      <label className="block">
        <span className="field-label">{t("email.document")}</span>
        <select
          className="field-input"
          value={documentId}
          onChange={(event) => setDocumentId(event.target.value)}
        >
          {docs.length === 0 ? <option value="">{t("email.noDocs")}</option> : null}
          {docs.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.path.split(/[/\\]/).pop() || doc.path}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className="field-label">{t("email.decision")}</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="decision"
              checked={decision === "pass"}
              onChange={() => setDecision("pass")}
            />
            {t("email.pass")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="decision"
              checked={decision === "reject"}
              onChange={() => setDecision("reject")}
            />
            {t("email.reject")}
          </label>
        </div>
      </fieldset>
      <label className="block">
        <span className="field-label">{t("email.roleTitle")}</span>
        <input
          className="field-input"
          value={roleTitle}
          onChange={(event) => setRoleTitle(event.target.value)}
          placeholder={t("email.roleTitleHint")}
        />
      </label>
      <label className="block">
        <span className="field-label">{t("email.notes")}</span>
        <textarea
          className="field-input min-h-20"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={t("email.notesHint")}
        />
      </label>
      <button
        type="button"
        className="btn-primary self-start"
        disabled={busy || !documentId}
        onClick={() => void run()}
      >
        {busy ? t("email.working") : t("email.run")}
      </button>
      {error ? (
        <p className="rounded border border-destructive-muted bg-destructive-soft p-3 text-sm text-destructive-ink">{error}</p>
      ) : null}
    </div>
  );
}
