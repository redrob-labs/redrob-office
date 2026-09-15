import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@redrob/ui";
import type {
  DeviceProfile,
  ExecutionPlanView,
  MeasuredTiming,
  RuntimeFallbackNotice,
} from "../../shared/office-api";
import {
  modelRoleLabel,
  operationLabel,
  runtimeAlertLabel,
  runtimeAlertSeverity,
} from "./schema-label";
import { AsrSetupCard } from "./AsrSetupCard";
import { BackendSetupCard } from "./BackendSetupCard";
import { CloudNudge } from "./CloudNudge";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function formatRamGb(totalRamMb: number): string {
  const gb = totalRamMb / 1024;
  const rounded = gb >= 10 ? Math.round(gb) : Math.round(gb * 10) / 10;
  return String(rounded);
}

function formatSeconds(totalMs: number): string {
  const seconds = totalMs / 1000;
  if (seconds < 10) return (Math.round(seconds * 10) / 10).toFixed(1);
  return String(Math.round(seconds));
}

function formatMoment(iso: string, locale: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleTimeString(locale === "ko" ? "ko-KR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Mirrors the Settings section rhythm so both pages read as one product. */
function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="border-t border-gray-200 py-6 first:border-t-0 first:pt-0 last:pb-0 dark:border-gray-800">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      {hint ? (
        <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{hint}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function StatRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}): JSX.Element {
  return (
    <div className="flex w-full items-baseline justify-between gap-4 border-b border-gray-200 py-3.5 last:border-b-0 dark:border-gray-800">
      <dt className="min-w-0 shrink text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {hint ? (
          <span className="mt-0.5 block text-xs font-normal text-gray-500 dark:text-gray-400">
            {hint}
          </span>
        ) : null}
      </dt>
      <dd className="shrink-0 text-right text-sm font-semibold text-gray-900 dark:text-white">
        {value}
      </dd>
    </div>
  );
}

/**
 * Read-only readout of what this machine is doing right now: silent fallbacks,
 * the active inference plan, detected hardware, and measured run times.
 * Anything editable (GPU preference, routing, keys) lives in Settings → Models.
 */
export function DevicePanel({
  active = true,
  onOpenSettings,
}: {
  /** Refetch whenever the tab becomes visible — the shell keeps it mounted. */
  active?: boolean;
  onOpenSettings?: () => void;
}): JSX.Element {
  const { t, locale } = useI18n();
  const [device, setDevice] = useState<DeviceProfile | null>(null);
  const [executionPlan, setExecutionPlan] = useState<ExecutionPlanView | null>(
    null,
  );
  const [models, setModels] = useState<Record<string, string>>({});
  const [measurements, setMeasurements] = useState<MeasuredTiming[]>([]);
  const [notices, setNotices] = useState<RuntimeFallbackNotice[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setBusy(true);
    setError(null);

    const profilePromise = withTimeout(
      window.office.getDeviceProfile(),
      8_000,
      "device profile",
    )
      .then((profile) => {
        setDevice(profile);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });

    void withTimeout(window.office.getExecutionPlan(), 12_000, "execution plan")
      .then((plan) => {
        setExecutionPlan(plan);
      })
      .catch(() => {
        // Keep hardware usable even if inference plan is slow/unavailable.
      });

    void window.office.getTierModels().then(setModels).catch(() => undefined);
    void window.office.getMeasurements().then(setMeasurements).catch(() => undefined);
    void window.office
      .getRuntimeFallbackNotices()
      .then(setNotices)
      .catch(() => setNotices([]));

    void profilePromise.finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    if (!active) return;
    refresh();
  }, [active, refresh]);

  const modelEntries = Object.entries(models);

  return (
    <div className="pane flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-gray-200 px-6 dark:border-gray-800">
        <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
          {t("device.headline")}
        </h2>
        <button
          type="button"
          className="shrink-0 rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          disabled={busy}
          onClick={() => refresh()}
        >
          {busy ? t("device.refreshing") : t("device.refresh")}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="max-w-2xl">
          <p className="mb-5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {t("device.purpose")}
          </p>
          {error ? (
            <p className="mb-6 rounded border border-destructive-muted bg-destructive-soft p-3 text-sm text-destructive-ink">
              {error}
            </p>
          ) : null}

          {/* Above the hardware readout on purpose: a person who opened this
              panel because nothing works needs the way out before the specs
              that explain why. */}
          <div className="mb-6 empty:mb-0">
            <CloudNudge />
          </div>

          <Section title={t("device.alerts")} hint={t("device.alertsHint")}>
            {notices.length === 0 ? (
              <p className="flex items-center gap-2 rounded border border-success-muted bg-success-soft px-3 py-2.5 text-sm text-success-ink">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-success"
                />
                {t("device.alertsEmpty")}
              </p>
            ) : (
              <ul className="space-y-2">
                {notices.map((notice) => {
                  const blocking = runtimeAlertSeverity(notice.code) === "error";
                  return (
                    <li
                      key={`${notice.code}-${notice.at}`}
                      className={`rounded border p-3 ${
                        blocking
                          ? "border-destructive-muted bg-destructive-soft text-destructive-ink"
                          : "border-warning-muted bg-warning-soft text-warning-ink"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 text-sm font-semibold">
                          {runtimeAlertLabel(t, notice.code)}
                        </p>
                        <p className="shrink-0 text-[0.6875rem] opacity-70">
                          {formatMoment(notice.at, locale)}
                        </p>
                      </div>
                      <p className="mt-1 text-xs font-medium opacity-80">
                        {notice.source === "asr"
                          ? t("device.sourceAsr")
                          : t("device.sourceInference")}
                      </p>
                      <p className="mt-1 break-words text-xs leading-relaxed opacity-90">
                        {notice.detail}
                      </p>
                      {notice.code === "ERR_ASR_BINARY" ? (
                        <p className="mt-2 text-xs font-medium opacity-90">
                          {t("asrSetup.deviceHint")}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title={t("backend.title")} hint={t("backend.hint")}>
            <BackendSetupCard active={active} onReady={refresh} />
          </Section>

          <Section title={t("asrSetup.title")} hint={t("asrSetup.deviceHint")}>
            <AsrSetupCard active={active} />
          </Section>

          <Section title={t("device.planTitle")} hint={t("device.planHint")}>
            {executionPlan ? (
              <>
                <dl className="w-full">
                  <StatRow
                    label={t("device.backendLabel")}
                    value={executionPlan.backend}
                  />
                  <StatRow
                    label={t("device.modelLabel")}
                    value={executionPlan.modelId}
                  />
                  <StatRow
                    label={t("device.layersLabel")}
                    value={String(executionPlan.gpuLayers)}
                  />
                  <StatRow
                    label={t("device.threadsLabel")}
                    value={String(executionPlan.threads)}
                  />
                  <StatRow
                    label={t("device.isolationLabel")}
                    value={executionPlan.isolation}
                  />
                </dl>
                {executionPlan.usingFallbackModel ? (
                  <p className="mt-4 rounded border border-warning-muted bg-warning-soft p-3 text-xs leading-relaxed text-warning-ink">
                    {t("device.fallbackModel")}
                  </p>
                ) : null}
                <div className="mt-4 rounded bg-gray-50 p-4 ring-1 ring-inset ring-gray-300 dark:bg-gray-800/60 dark:ring-gray-700">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500">
                    {t("device.reasonLabel")}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                    {executionPlan.reason}
                  </p>
                </div>
                {onOpenSettings ? (
                  <button
                    type="button"
                    className="btn-secondary mt-4 text-xs"
                    onClick={onOpenSettings}
                  >
                    {t("chat.openModelsSettings")}
                  </button>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-gray-500">
                {busy ? t("device.detecting") : t("device.planUnavailable")}
              </p>
            )}
          </Section>

          <Section title={t("device.models")} hint={t("device.modelsHint")}>
            {modelEntries.length === 0 ? (
              <p className="text-sm text-gray-500">{t("device.noModels")}</p>
            ) : (
              <dl className="w-full">
                {modelEntries.map(([kind, model]) => (
                  <StatRow
                    key={kind}
                    label={modelRoleLabel(t, kind)}
                    value={model}
                  />
                ))}
              </dl>
            )}
          </Section>

          <Section title={t("device.machineTitle")} hint={t("device.machineHint")}>
            {device ? (
              <dl className="w-full">
                <StatRow
                  label={t("device.tier")}
                  hint={t("device.tierHint")}
                  value={
                    device.tier === "T4"
                      ? t("device.tierT4")
                      : device.tier === "T8"
                        ? t("device.tierT8")
                        : t("device.tierT16")
                  }
                />
                <StatRow
                  label={t("device.ram")}
                  hint={t("device.ramFree", {
                    gb: formatRamGb(device.freeRamMb),
                  })}
                  value={t("device.ramValue", {
                    gb: formatRamGb(device.totalRamMb),
                  })}
                />
                <StatRow
                  label={t("device.cpu")}
                  value={t("device.cpuValue", {
                    model: device.cpuModel,
                    cores: device.cpuCores,
                  })}
                />
                <StatRow
                  label={t("device.gpu")}
                  value={
                    device.gpu
                      ? t("device.gpuValue", {
                          vendor: device.gpu.vendor,
                          name: device.gpu.renderer,
                        })
                      : t("device.gpuUnavailable")
                  }
                />
                <StatRow
                  label={t("device.cpuTemp")}
                  value={
                    device.cpuTempC === null
                      ? t("device.cpuTempUnavailable")
                      : t("device.cpuTempValue", {
                          temp: String(device.cpuTempC),
                        })
                  }
                />
              </dl>
            ) : (
              <p className="text-sm text-gray-500">
                {busy ? t("device.detecting") : t("device.detectFailed")}
              </p>
            )}
          </Section>

          <Section title={t("device.timings")} hint={t("device.timingsHint")}>
            {measurements.length === 0 ? (
              <p className="text-sm text-gray-500">{t("device.noTimings")}</p>
            ) : (
              <ul className="w-full divide-y divide-gray-300">
                {measurements.map((item) => (
                  <li
                    key={`${item.operation}-${item.recordedAt}`}
                    className="flex w-full items-baseline justify-between gap-4 py-3.5 first:pt-0"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-gray-900">
                      {operationLabel(t, item.operation)}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-800">
                      {t("device.timingValue", {
                        seconds: formatSeconds(item.totalMs),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
