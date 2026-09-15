import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@redrob/ui";
import type { BackendInstallProgressEvent, BackendStatusView } from "../../shared/office-api";
import { Spinner } from "./Spinner";

function gigabytes(bytes: number): string {
  return `${(bytes / 1_000_000_000).toFixed(1)}GB`;
}

function progressLabel(
  event: BackendInstallProgressEvent | null,
  t: (path: string, vars?: Record<string, string | number>) => string,
): string | null {
  if (!event) return null;
  if (event.kind === "extract") return t("backend.progressExtract");
  if (event.kind === "done") return t("backend.progressDone");
  if (event.kind === "error") return event.detail ?? t("backend.progressFailed");
  if (event.archiveCount && event.archiveCount > 1) {
    return t("backend.progressDownloadPart", {
      percent: event.percent ?? 0,
      index: event.archiveIndex ?? 1,
      count: event.archiveCount,
    });
  }
  return t("backend.progressDownload", { percent: event.percent ?? 0 });
}

/**
 * Installs the llama.cpp server this machine's GPU needs.
 *
 * The weights and the runtime are separate downloads and having only the
 * weights is the confusing state: the app looks configured, picks a local
 * route, and then every call fails because there is no server to run them on.
 * This card is what turns that into one button.
 */
export function BackendSetupCard({
  active = true,
  onReady,
}: {
  active?: boolean;
  onReady?: (status: BackendStatusView) => void;
}): JSX.Element {
  const { t } = useI18n();
  const [status, setStatus] = useState<BackendStatusView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<BackendInstallProgressEvent | null>(null);

  const refresh = useCallback(() => {
    void window.office
      .getBackendStatus()
      .then((next) => {
        setStatus((prev) => {
          if (next.ready && !prev?.ready) onReady?.(next);
          return next;
        });
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
    return window.office.onBackendInstallProgress((event) => {
      setProgress(event);
      if (event.kind === "error") setError(event.detail ?? t("backend.progressFailed"));
    });
  }, [t]);

  async function install(backendId: string): Promise<void> {
    setBusy(true);
    setError(null);
    setProgress({ kind: "start", backendId, percent: 0 });
    try {
      const next = await window.office.installBackend(backendId);
      setStatus(next);
      if (next.ready) onReady?.(next);
      setProgress({ kind: "done", backendId, percent: 100 });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      refresh();
    }
  }

  const progressText = progressLabel(progress, t);
  const recommended = status?.options.find((option) => option.id === status.recommendedId) ?? null;

  if (!status) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-gray-400">
        <Spinner className="h-3 w-3" />
        {t("backend.checking")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-gray-800">
        {status.overridePath
          ? t("backend.statusOverride")
          : status.activeId
            ? t("backend.statusInstalled", { backend: status.activeId })
            : t("backend.statusMissing")}
      </p>

      {status.detectionChain ? (
        <p className="text-xs leading-relaxed text-gray-500">{status.detectionChain}</p>
      ) : null}

      {status.options.length === 0 ? (
        <p className="text-xs text-warning-ink" role="alert">
          {t("backend.noneForPlatform")}
        </p>
      ) : null}

      <ul className="space-y-2">
        {status.options.map((option) => {
          const isRecommended = option.id === status.recommendedId;
          return (
            <li
              key={option.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded bg-gray-50 p-3 ring-1 ring-inset ring-gray-200"
            >
              <span className="text-xs font-medium text-gray-800">{option.id}</span>
              {isRecommended ? (
                <span className="rounded bg-gray-900 px-2 py-0.5 text-[0.625rem] font-medium text-white">
                  {t("backend.recommended")}
                </span>
              ) : null}
              {option.installed ? (
                <span className="text-[0.6875rem] text-gray-500">{t("backend.installed")}</span>
              ) : option.downloadBytes === null ? (
                <span className="text-[0.6875rem] text-gray-500">{t("backend.manualOnly")}</span>
              ) : (
                <span className="text-[0.6875rem] text-gray-500">
                  {t("backend.size", { size: gigabytes(option.downloadBytes) })}
                </span>
              )}
              {option.requirements ? (
                <span className="basis-full text-[0.6875rem] text-gray-400">
                  {option.requirements}
                </span>
              ) : null}
              {option.unavailableReason ? (
                <span className="basis-full text-[0.6875rem] text-warning-ink">
                  {option.unavailableReason}
                </span>
              ) : null}
              <span className="ml-auto flex gap-2">
                {option.downloadBytes !== null ? (
                  <button
                    type="button"
                    className={
                      isRecommended && !option.installed
                        ? "btn-primary text-xs"
                        : "btn-secondary text-xs"
                    }
                    disabled={busy}
                    onClick={() => void install(option.id)}
                  >
                    {busy && progress?.backendId === option.id
                      ? t("backend.installing")
                      : option.installed
                        ? t("backend.reinstall")
                        : t("backend.install")}
                  </button>
                ) : null}
                {option.installed ? (
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    disabled={busy}
                    onClick={() => {
                      void window.office.removeBackend(option.id).then(setStatus).catch(() => {
                        refresh();
                      });
                    }}
                  >
                    {t("backend.remove")}
                  </button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      {recommended && !recommended.installed && recommended.downloadBytes !== null ? (
        <p className="text-xs leading-relaxed text-gray-500">
          {t("backend.firstRunHint", { size: gigabytes(recommended.downloadBytes) })}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={refresh}>
          {t("backend.refresh")}
        </button>
      </div>

      {progressText && busy ? <p className="text-xs text-gray-500">{progressText}</p> : null}

      {error ? (
        <p className="text-xs text-destructive-ink" role="alert">
          {error}
        </p>
      ) : null}

      {status.binaryPath ? (
        <p className="break-all text-[0.6875rem] text-gray-400">
          {t("backend.installedAt", { dir: status.binaryPath })}
        </p>
      ) : null}
    </div>
  );
}
