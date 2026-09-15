import { useEffect, useState } from "react";
import { useI18n } from "@redrob/ui";
import type { DocumentSummary } from "../../shared/office-api";
import { handleSubmitHotkey } from "./submit-hotkey";
import { mapDeskError } from "./desk-errors";
import { severityLabel } from "./schema-label";

export function VerifyPanel({ workspaceId }: { workspaceId: string }): JSX.Element {
  const { t } = useI18n();
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [candidateDocumentId, setCandidateDocumentId] = useState("");
  const [certificateText, setCertificateText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mismatches, setMismatches] = useState<
    Array<{ ruleId: string; severity: string; message: string; candidateValue: string; certificateValue: string }>
  >([]);

  useEffect(() => {
    void window.office.listDocuments("recruiting/resume").then((list) => {
      setDocs(list);
      if (list[0]) setCandidateDocumentId(list[0].id);
    });
  }, []);

  async function run(): Promise<void> {
    if (!candidateDocumentId) {
      setError(t("verify.noDocs"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const raw = (await window.office.runVerify({
        workspaceId,
        candidateDocumentId,
        certificateText,
      })) as {
        mismatches: Array<{
          ruleId: string;
          severity: string;
          message: string;
          candidateValue: string;
          certificateValue: string;
        }>;
      };
      setMismatches(raw.mismatches);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(mapDeskError(message, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="panel"
      onKeyDown={(event) =>
        handleSubmitHotkey(
          event,
          !busy && Boolean(candidateDocumentId) && certificateText.trim().length > 0,
          () => void run(),
        )
      }
    >
      <div className="surface p-6">
        <p className="font-medium">{t("verify.title")}</p>
        <p className="mt-1 text-sm text-gray-500">{t("verify.body")}</p>
        <label className="mt-4 block text-sm">
          <span className="text-gray-600">{t("verify.candidate")}</span>
          <select
            className="mt-1 w-full rounded border-0 bg-gray-100 px-3 py-2 text-sm"
            value={candidateDocumentId}
            onChange={(event) => setCandidateDocumentId(event.target.value)}
          >
            {docs.length === 0 ? <option value="">{t("verify.noDocs")}</option> : null}
            {docs.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.path}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-gray-600">{t("verify.certificate")}</span>
          <textarea
            className="mt-1 min-h-40 w-full rounded border-0 bg-gray-100 px-3 py-2 text-sm"
            value={certificateText}
            onChange={(event) => setCertificateText(event.target.value)}
            placeholder={t("verify.certificateHint")}
          />
        </label>
        <button
          type="button"
          className="btn-primary mt-4"
          disabled={busy || !candidateDocumentId || certificateText.trim().length === 0}
          onClick={() => void run()}
        >
          {busy ? t("verify.working") : t("verify.run")}
        </button>
        {error ? (
          <p className="mt-4 rounded border border-destructive-muted bg-destructive-soft p-3 text-sm text-destructive-ink">{error}</p>
        ) : null}
      </div>
      {mismatches.length > 0 ? (
        <div className="surface p-6">
          <p className="font-medium">{t("verify.results")}</p>
          <ul className="mt-3 space-y-3">
            {mismatches.map((item) => (
              <li key={item.ruleId} className="rounded bg-gray-100 p-3 text-sm">
                <p className="font-medium">
                  [{severityLabel(t, item.severity)}] {item.message}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {t("verify.candidate")}: {item.candidateValue || "-"}
                </p>
                <p className="text-xs text-gray-500">
                  {t("verify.certificate")}: {item.certificateValue || "-"}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
