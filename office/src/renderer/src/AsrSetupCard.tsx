import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@redrob/ui";
import type { AsrInstallProgressEvent, AsrSetupStatus } from "../../shared/office-api";
import { Spinner } from "./Spinner";

function statusLine(status: AsrSetupStatus, t: (path: string) => string): string {
  if (status.ready) return t("asrSetup.statusReady");
  if (!status.binaryReady) return t("asrSetup.statusMissingCli");
  if (!status.smallModelReady && !status.turboModelReady) {
    return t("asrSetup.statusMissingModel");
  }
  return t("asrSetup.statusPartial");
}

function progressLabel(
  event: AsrInstallProgressEvent | null,
  t: (path: string, vars?: Record<string, string | number>) => string,
): string | null {
  if (!event) return null;
  if (event.kind === "extract") return t("asrSetup.progressExtract");
  if (event.kind === "done") return t("asrSetup.progressDone");
  if (event.kind === "error") return event.detail ?? t("asrSetup.progressFailed");
  const step =
    event.step === "cli"
      ? t("asrSetup.stepCli")
      : event.step === "model-turbo"
        ? t("asrSetup.stepTurbo")
        : event.step === "model-small"
          ? t("asrSetup.stepSmall")
          : t("asrSetup.stepGeneric");
  if (typeof event.percent === "number") {
    return t("asrSetup.progressPct", { step, percent: event.percent });
  }
  return t("asrSetup.progressWorking", { step });
}

/**
 * Download whisper.cpp CLI + ggml weights into the local models dir.
 * Shared by Settings → Models and Device.
 */
export function AsrSetupCard({
  active = true,
  compact = false,
  onReady,
}: {
  active?: boolean;
  compact?: boolean;
  /** Fired when status reports ready (including after a successful install). */
  onReady?: (status: AsrSetupStatus) => void;
}): JSX.Element {
  const { t } = useI18n();
  const [status, setStatus] = useState<AsrSetupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<AsrInstallProgressEvent | null>(null);
  const [includeTurbo, setIncludeTurbo] = useState(false);

  const refresh = useCallback(() => {
    void window.office
      .getAsrSetupStatus()
      .then((next) => {
        setStatus((prev) => {
          if (next.ready && !prev?.ready) onReady?.(next);
          return next;
        });
        setIncludeTurbo((was) => was || next.recommendedTier === "turbo");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [onReady]);

  useEffect(() => {
    if (!active) return;
    refresh();
  }, [active, refresh]);

  useEffect(() => {
    return window.office.onAsrInstallProgress((event) => {
      setProgress(event);
      if (event.kind === "error") {
        setError(event.detail ?? t("asrSetup.progressFailed"));
      }
    });
  }, [t]);

  async function install(): Promise<void> {
    setBusy(true);
    setError(null);
    setProgress({ kind: "start", percent: 0 });
    try {
      const next = await window.office.installAsrPack({ includeTurbo });
      setStatus((prev) => {
        if (next.ready && !prev?.ready) onReady?.(next);
        return next;
      });
      setProgress({ kind: "done", percent: 100 });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProgress({ kind: "error", detail: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
      refresh();
    }
  }

  const ready = status?.ready === true;
  const progressText = progressLabel(progress, t);

  return (
    <div
      className={
        compact
          ? "space-y-3"
          : "space-y-3 rounded bg-gray-50 p-3 ring-1 ring-inset ring-gray-200"
      }
    >
      {!compact ? (
        <>
          <p className="text-xs font-medium text-gray-700">{t("asrSetup.title")}</p>
          <p className="text-xs text-gray-500">{t("asrSetup.hint")}</p>
        </>
      ) : null}

      {status ? (
        <ul className="space-y-1 text-xs text-gray-600">
          <li>
            {t("asrSetup.cliLabel")}:{" "}
            <span className={status.binaryReady ? "text-success-ink" : "text-warning-ink"}>
              {status.binaryReady ? t("asrSetup.present") : t("asrSetup.missing")}
            </span>
          </li>
          <li>
            {t("asrSetup.smallLabel")}:{" "}
            <span className={status.smallModelReady ? "text-success-ink" : "text-warning-ink"}>
              {status.smallModelReady ? t("asrSetup.present") : t("asrSetup.missing")}
            </span>
          </li>
          <li>
            {t("asrSetup.turboLabel")}:{" "}
            <span className={status.turboModelReady ? "text-success-ink" : "text-warning-ink"}>
              {status.turboModelReady ? t("asrSetup.present") : t("asrSetup.missing")}
            </span>
          </li>
          <li className="pt-1 font-medium text-gray-800">{statusLine(status, t)}</li>
        </ul>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-gray-400">
          <Spinner className="h-3 w-3" />
          {t("asrSetup.checking")}
        </p>
      )}

      <label className="flex items-start gap-2 text-xs text-gray-600">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={includeTurbo}
          disabled={busy}
          onChange={(event) => setIncludeTurbo(event.target.checked)}
        />
        <span>{t("asrSetup.includeTurbo")}</span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={ready ? "btn-secondary text-xs" : "btn-primary text-xs"}
          disabled={busy || (status != null && !status.platformSupported && !status.binaryReady)}
          onClick={() => void install()}
        >
          {busy
            ? t("asrSetup.installing")
            : ready
              ? t("asrSetup.reinstall")
              : t("asrSetup.install")}
        </button>
        <button
          type="button"
          className="btn-secondary text-xs"
          disabled={busy}
          onClick={() => refresh()}
        >
          {t("asrSetup.refresh")}
        </button>
      </div>

      {status && !status.platformSupported && !status.binaryReady ? (
        <p className="text-xs text-warning-ink" role="alert">
          {t("asrSetup.platformUnsupported")}
        </p>
      ) : null}

      {progressText && busy ? (
        <p className="text-xs text-gray-500">{progressText}</p>
      ) : null}

      {error ? (
        <p className="text-xs text-destructive-ink" role="alert">
          {error}
        </p>
      ) : null}

      {status?.modelsDir ? (
        <p className="break-all text-[0.6875rem] text-gray-400">
          {t("asrSetup.modelsDir", { dir: status.modelsDir })}
        </p>
      ) : null}
    </div>
  );
}
