import { useEffect, useState } from "react";
import { useI18n } from "@redrob/ui";
import type { DayLogSession, DayLogVisionRoute } from "../../shared/office-api";
import { MarkdownBody } from "./MarkdownBody";

const INTERVAL_OPTIONS = [
  { ms: 60_000, key: "daylog.interval1m" },
  { ms: 5 * 60_000, key: "daylog.interval5m" },
  { ms: 10 * 60_000, key: "daylog.interval10m" },
  { ms: 15 * 60_000, key: "daylog.interval15m" },
] as const;

export function DayLogPanel(): JSX.Element {
  const { t, locale } = useI18n();
  const [session, setSession] = useState<DayLogSession | null>(null);
  const [history, setHistory] = useState<DayLogSession[]>([]);
  const [intervalMs, setIntervalMs] = useState(5 * 60_000);
  /** Prefer local; cloud requires explicit session opt-in (default off). */
  const [visionRoute, setVisionRoute] = useState<DayLogVisionRoute>("local");
  const [cloudOptIn, setCloudOptIn] = useState(false);
  const [deleteAfter, setDeleteAfter] = useState(true);
  const [notifyOnCapture, setNotifyOnCapture] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const [localDisabledReason, setLocalDisabledReason] = useState<string | null>(null);

  function refresh(): void {
    void window.office.getActiveDayLog().then(setSession).catch(() => setSession(null));
    void window.office.listDayLogs().then(setHistory).catch(() => setHistory([]));
    void window.office
      .dayLogCapabilities()
      .then((cap) => {
        setCloudReady(cap.cloudReady);
        setLocalReady(cap.localReady);
        setLocalDisabledReason(cap.localDisabledReason ?? null);
        setVisionRoute((current) => {
          // Stay on local when GPU is missing — do not auto-switch to cloud (opt-in required).
          if (current === "local" && cap.localReady) return "local";
          if (current === "cloud" && !cap.cloudReady && cap.localReady) return "local";
          return current;
        });
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 4000);
    return () => window.clearInterval(id);
  }, []);

  const routeReady =
    visionRoute === "local"
      ? localReady
      : cloudReady && cloudOptIn;

  async function start(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const next = await window.office.startDayLog({
        intervalMs,
        visionRoute,
        deleteCapturesAfterReport: deleteAfter,
        notifyOnCapture,
        locale: locale === "en" ? "en" : "ko",
        ...(visionRoute === "cloud" ? { cloudOptIn: true } : {}),
      });
      setSession(next);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function stopAndReport(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      if (session?.status === "recording") {
        await window.office.stopDayLog();
      }
      const done = await window.office.finalizeDayLog();
      setSession(done);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      refresh();
    } finally {
      setBusy(false);
    }
  }

  const recording = session?.status === "recording";
  const showGpuGate = !localReady;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">
          {t("daylog.title")}
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{t("daylog.body")}</p>
      </header>

      <section className="rounded border border-gray-200 bg-white/90 p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {t("daylog.visionRoute")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["local", "daylog.visionLocal", localReady],
              ["cloud", "daylog.visionCloud", cloudReady],
            ] as const
          ).map(([value, labelKey, ready]) => (
            <button
              key={value}
              type="button"
              disabled={recording}
              className={visionRoute === value ? "btn-primary" : "btn-secondary"}
              onClick={() => {
                setVisionRoute(value);
                if (value !== "cloud") setCloudOptIn(false);
              }}
            >
              {t(labelKey)}
              {!ready ? ` · ${t("daylog.notReady")}` : ""}
            </button>
          ))}
        </div>

        {showGpuGate ? (
          <div
            className="mt-3 rounded border border-warning-muted bg-warning-soft px-3 py-2 text-sm text-warning-ink"
            role="status"
          >
            <p>{t("daylog.visionGpuRequired")}</p>
            <p className="mt-1.5">{t("daylog.visionGpuLater")}</p>
            <p className="mt-1.5">{t("daylog.visionCloudAvailable")}</p>
            {localDisabledReason ? (
              <p className="mt-1.5 font-mono text-xs text-muted-foreground">{localDisabledReason}</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-xs text-gray-500">{t("daylog.visionLocalHint")}</p>
        )}

        {visionRoute === "cloud" ? (
          <div className="mt-3 rounded border border-gray-200 bg-gray-50/90 px-3 py-2 text-sm text-gray-700">
            <p>{t("daylog.visionCloudOptInBody")}</p>
            <label className="mt-2 flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={cloudOptIn}
                disabled={recording || !cloudReady}
                onChange={(e) => setCloudOptIn(e.target.checked)}
              />
              <span>{t("daylog.visionCloudOptInCheck")}</span>
            </label>
            {!cloudReady ? (
              <p className="mt-2 text-xs text-gray-500">{t("daylog.visionCloudHint")}</p>
            ) : null}
          </div>
        ) : null}

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
          {t("daylog.interval")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {INTERVAL_OPTIONS.map((opt) => (
            <button
              key={opt.ms}
              type="button"
              disabled={recording}
              className={intervalMs === opt.ms ? "btn-primary" : "btn-secondary"}
              onClick={() => setIntervalMs(opt.ms)}
            >
              {t(opt.key)}
            </button>
          ))}
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            className="mt-1"
            checked={deleteAfter}
            disabled={recording}
            onChange={(e) => setDeleteAfter(e.target.checked)}
          />
          <span>{t("daylog.deleteAfter")}</span>
        </label>

        <label className="mt-3 flex items-start gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            className="mt-1"
            checked={notifyOnCapture}
            disabled={recording}
            onChange={(e) => setNotifyOnCapture(e.target.checked)}
          />
          <span>
            {t("daylog.notifyOnCapture")}
            <span className="mt-0.5 block text-xs text-gray-400">
              {t("daylog.notifyOnCaptureHint")}
            </span>
          </span>
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          {!recording ? (
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !routeReady}
              onClick={() => void start()}
            >
              {t("daylog.start")}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => void stopAndReport()}
            >
              {busy ? t("daylog.working") : t("daylog.stop")}
            </button>
          )}
        </div>
      </section>

      {session ? (
        <section className="rounded border border-gray-200 bg-white/90 p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-900">
            {t("daylog.statusLine", { status: t(`daylog.statuses.${session.status}`) })}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {t("daylog.captureCount", { count: session.captures.length })}
            {" · "}
            {t("daylog.startedAt", { at: session.startedAt })}
          </p>
          {session.lastCaptureError && session.captures.length === 0 ? (
            <p className="mt-2 text-sm text-warning-ink" role="status">
              {t("daylog.captureFailed", { detail: session.lastCaptureError })}
            </p>
          ) : null}
          {(session.captureFailures ?? 0) > 0 && session.captures.length > 0 ? (
            <p className="mt-2 text-xs text-warning-ink" role="status">
              {t("daylog.captureMissed", { count: session.captureFailures ?? 0 })}
            </p>
          ) : null}
          {session.error ? (
            <p className="mt-2 text-sm text-destructive-ink" role="alert">
              {session.error}
            </p>
          ) : null}
          {session.reportMarkdown ? (
            <div className="mt-4 rounded border border-gray-100 bg-gray-50/80 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t("daylog.report")}
              </p>
              <MarkdownBody
                source={session.reportMarkdown}
                className="markdown-body text-sm leading-relaxed text-gray-800"
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <p className="rounded border border-destructive-muted bg-destructive-soft px-3 py-2 text-sm text-destructive-ink">
          {error}
        </p>
      ) : null}

      {history.length > 0 ? (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {t("daylog.history")}
          </p>
          <ul className="flex flex-col gap-2">
            {history.slice(0, 8).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-left text-sm hover:border-gray-300"
                  onClick={() => setSession(item)}
                >
                  <span className="font-medium text-gray-800">{item.startedAt}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    {t(`daylog.statuses.${item.status}`)} ·{" "}
                    {t("daylog.captureCount", { count: item.captures.length })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
