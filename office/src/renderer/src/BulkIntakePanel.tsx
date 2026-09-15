import { useEffect, useState } from "react";
import { useI18n } from "@redrob/ui";
import type { IntakeBatchResult, IntakeProgressEvent } from "../../shared/office-api";
import { schemaLabel } from "./schema-label";
import { handleSubmitHotkey } from "./submit-hotkey";

export function BulkIntakePanel({
  schemaId,
  workspaceId,
  onCompleted,
}: {
  /** Extraction schema picked by the catalog's variant chips. */
  schemaId: string | undefined;
  workspaceId: string;
  onCompleted?: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IntakeBatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<IntakeProgressEvent | null>(null);

  useEffect(() => {
    return window.office.onIntakeProgress((event) => {
      setLive(event);
    });
  }, []);

  async function runIntake(): Promise<void> {
    if (!schemaId) {
      setError(t("scale.bulk.noSchema"));
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setLive(null);
    try {
      const directoryPath = await window.office.pickIntakeFolder();
      if (!directoryPath) {
        setBusy(false);
        return;
      }
      const batch = await window.office.runIntakeBatch({
        workspaceId,
        schemaId,
        directoryPath,
      });
      setResult(batch);
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const queued = result?.queued ?? live?.queued ?? 0;
  const processed = result?.processed ?? live?.processed ?? 0;
  const errors = result?.errors ?? live?.errors ?? 0;

  return (
    <div
      className="surface border-dashed p-6"
      onKeyDown={(event) =>
        handleSubmitHotkey(event, !busy && Boolean(schemaId), () => void runIntake())
      }
    >
      <p className="font-medium">{t("scale.bulk.title")}</p>
      <p className="mt-1 text-sm text-gray-500">{t("scale.bulk.body")}</p>
      <p className="mt-2 text-xs text-gray-400">{t("scale.bulk.textOnly")}</p>
      {schemaId ? (
        <p className="mt-4 text-xs text-gray-500">
          {t("scale.bulk.schema")}: {schemaLabel(t, schemaId)}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy || !schemaId}
        onClick={() => void runIntake()}
        className="btn-primary mt-5 inline-flex cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? t("scale.bulk.working") : t("scale.bulk.selectFolder")}
      </button>
      <div className="mt-5 grid grid-cols-3 gap-3 text-xs text-gray-500">
        <span className="rounded bg-gray-100 px-3 py-2">
          {t("scale.bulk.queued")}: {queued}
        </span>
        <span className="rounded bg-gray-100 px-3 py-2">
          {t("scale.bulk.processed")}: {processed}
        </span>
        <span className="rounded bg-gray-100 px-3 py-2">
          {t("scale.bulk.errors")}: {errors}
        </span>
      </div>
      {busy && live?.field ? (
        <p className="mt-3 truncate text-xs text-gray-500">
          {t("scale.bulk.fieldStream", {
            field: live.field.path,
            value:
              live.field.value === null || live.field.value === undefined
                ? "—"
                : typeof live.field.value === "string"
                  ? live.field.value
                  : JSON.stringify(live.field.value),
            score: live.field.confidenceScore.toFixed(2),
          })}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded border border-destructive-muted bg-destructive-soft p-3 text-sm text-destructive-ink">{error}</p>
      ) : null}
      {result && result.items.some((item) => !item.ok) ? (
        <ul className="mt-4 max-h-40 space-y-1 overflow-auto text-xs text-gray-600">
          {result.items
            .filter((item) => !item.ok)
            .map((item) => (
              <li key={item.path}>
                {item.path}: {item.error}
              </li>
            ))}
        </ul>
      ) : null}
      {result && result.processed > 0 ? (
        <p className="mt-4 text-sm text-gray-600">{t("scale.bulk.reviewHint")}</p>
      ) : null}
    </div>
  );
}
