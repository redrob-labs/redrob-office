import { useEffect, useState } from "react";
import { useI18n } from "@redrob/ui";
import type { UpdateStatusEvent } from "../../shared/office-api";

/**
 * Shown once an update has been found or staged. Installing happens on quit
 * anyway, so the button only offers to restart early.
 */
export function UpdateBanner(): JSX.Element | null {
  const { t } = useI18n();
  const [status, setStatus] = useState<UpdateStatusEvent | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!window.office) return;
    void window.office
      .getUpdateStatus()
      .then(setStatus)
      .catch(() => undefined);
    return window.office.onUpdateStatus(setStatus);
  }, []);

  if (
    !status ||
    status.kind === "checking" ||
    status.kind === "current" ||
    status.kind === "error" ||
    dismissedVersion === status.version
  ) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 flex max-w-[min(90vw,32rem)] -translate-x-1/2 flex-wrap items-center gap-3 rounded border border-brand-200 bg-white px-4 py-3 text-sm shadow-lg dark:border-brand-800 dark:bg-gray-900"
    >
      <p className="min-w-0 flex-1 text-gray-800 dark:text-gray-100">
        {status.kind === "downloaded"
          ? t("update.downloaded", { version: status.version })
          : status.kind === "downloading"
            ? t("update.downloading", {
                version: status.version,
                percent: status.percent,
              })
          : t("update.available", { version: status.version })}
      </p>
      {status.kind === "downloaded" ? (
        <button
          type="button"
          className="btn-primary shrink-0"
          onClick={() => {
            void window.office.installUpdate().catch(() => undefined);
          }}
        >
          {t("update.restart")}
        </button>
      ) : null}
      <button
        type="button"
        className="btn-secondary shrink-0"
        onClick={() => setDismissedVersion(status.version)}
      >
        {t("update.dismiss")}
      </button>
    </div>
  );
}
