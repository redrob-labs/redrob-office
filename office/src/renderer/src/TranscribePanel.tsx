import { useEffect, useState } from "react";
import { useI18n } from "@redrob/ui";
import type { AsrBatchItemView, TranscriptDocumentView } from "../../shared/office-api";
import { useWorkResult } from "./work-result";

/**
 * Batch interview / note audio → local ASR.
 * Consent gate is mandatory; legal strings are PLACEHOLDER — RELEASE BLOCKER.
 */
export function TranscribePanel(): JSX.Element {
  const { t } = useI18n();
  const { setResult } = useWorkResult();
  const [speakerKind, setSpeakerKind] = useState<"self" | "others">("self");
  const [consentAck, setConsentAck] = useState(false);
  const [othersAck, setOthersAck] = useState(false);
  const [items, setItems] = useState<AsrBatchItemView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = (): void => {
    void window.office
      .listAsrBatch()
      .then(setItems)
      .catch(() => setItems([]));
  };

  useEffect(() => {
    refresh();
  }, []);

  const canRun =
    consentAck && (speakerKind === "self" || othersAck) && !busy;

  async function pickAndRun(): Promise<void> {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const consent = await window.office.recordAsrConsent({
        speakerKind,
        acknowledgedPlaceholders: true,
      });
      const path = await window.office.pickAudioFile();
      if (!path) {
        setBusy(false);
        return;
      }
      const started = await window.office.startAsrBatchItem({
        sourcePath: path,
        language: "ko",
        consentId: consent.id,
        speakerKind,
      });
      setMessage(t("transcribe.started", { id: started.id }));
      refresh();
      const done = await window.office.waitAsrBatchItem(started.id);
      refresh();
      if (done.state === "error") {
        setError(done.error ?? t("transcribe.failed"));
        return;
      }
      const transcript = done.transcript as TranscriptDocumentView | undefined;
      if (transcript) {
        setResult({
          title: t("transcribe.preview"),
          body: transcript.lines.map((line) => `${line.n}| ${line.text}`).join("\n"),
          source: "model",
          meta: `${transcript.provenance.model} · VAD ${transcript.provenance.vadModel}`,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      refresh();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-gray-500">{t("transcribe.body")}</p>
      <div className="rounded border border-warning-muted bg-warning-soft p-3 text-xs text-warning-ink">
        <p className="font-semibold">{t("transcribe.consentTitle")}</p>
        <p className="mt-1">{t("transcribe.consentPlaceholder")}</p>
        <label className="mt-3 flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={consentAck}
            onChange={(event) => setConsentAck(event.target.checked)}
          />
          <span>{t("transcribe.consentAck")}</span>
        </label>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-900">{t("transcribe.speakerKind")}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="speakerKind"
            checked={speakerKind === "self"}
            onChange={() => setSpeakerKind("self")}
          />
          {t("transcribe.speakerSelf")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="speakerKind"
            checked={speakerKind === "others"}
            onChange={() => setSpeakerKind("others")}
          />
          {t("transcribe.speakerOthers")}
        </label>
        {speakerKind === "others" ? (
          <label className="flex items-start gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={othersAck}
              onChange={(event) => setOthersAck(event.target.checked)}
            />
            <span>{t("transcribe.othersAck")}</span>
          </label>
        ) : null}
      </fieldset>
      <button
        type="button"
        className="btn-primary self-start"
        disabled={!canRun}
        onClick={() => void pickAndRun()}
      >
        {busy ? t("transcribe.working") : t("transcribe.run")}
      </button>
      {message ? <p className="text-xs text-gray-500">{message}</p> : null}
      {error ? (
        <p className="rounded border border-destructive-muted bg-destructive-soft p-3 text-sm text-destructive-ink">{error}</p>
      ) : null}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-900">{t("transcribe.items")}</p>
        {items.length === 0 ? (
          <p className="text-xs text-gray-400">{t("transcribe.itemsEmpty")}</p>
        ) : (
          <ul className="space-y-1 text-xs text-gray-600">
            {items.slice(0, 8).map((item) => (
              <li key={item.id}>
                {item.state} · {item.id.slice(0, 8)} · {item.sourcePath.split(/[/\\]/).pop()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
