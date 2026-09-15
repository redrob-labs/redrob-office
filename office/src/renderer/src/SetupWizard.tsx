import { useEffect, useMemo, useState } from "react";
import { LocaleSwitch, useI18n } from "@redrob/ui";
import type { PackRole, SetupProgressEvent, SetupSnapshot } from "../../shared/office-api";
import { BackendSetupCard } from "./BackendSetupCard";
import { BrandLogo } from "./BrandLogo";
import { CloudNudge } from "./CloudNudge";
import { Spinner } from "./Spinner";

interface SetupWizardProps {
  snapshot: SetupSnapshot;
  onComplete: () => void;
}

function notifyDone(title: string, body: string): void {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body });
      return;
    }
    if (typeof Notification !== "undefined" && Notification.permission !== "denied") {
      void Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          new Notification(title, { body });
        }
      });
    }
  } catch {
    // Notifications are optional; in-app banner is the source of truth.
  }
}

export function SetupWizard({ snapshot, onComplete }: SetupWizardProps): JSX.Element {
  const { t } = useI18n();
  const [roles, setRoles] = useState<PackRole[]>(
    snapshot.canFitMinimal ? ["text"] : [],
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<SetupProgressEvent | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return window.office.onSetupProgress((event) => {
      setProgress(event);
    });
  }, []);

  const selectedBytes = useMemo(() => {
    return snapshot.plan.roles
      .filter((role) => roles.includes(role.role))
      .reduce((sum, role) => sum + role.approxBytes, 0);
  }, [roles, snapshot.plan.roles]);

  const percent = progress?.percent ?? (busy ? 0 : null);

  function toggleRole(role: PackRole): void {
    setRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    );
  }

  function statusLabel(event: SetupProgressEvent | null): string {
    if (!event) return busy ? t("setup.working") : "";
    if (event.kind === "start") return t("setup.status.start");
    if (event.kind === "download") {
      return t("setup.status.download", {
        id: event.artifactId ?? "model",
        pct: event.percent ?? 0,
      });
    }
    if (event.kind === "ready") {
      return t("setup.status.ready", { id: event.artifactId ?? "model" });
    }
    if (event.kind === "remote") return t("setup.status.remote");
    if (event.kind === "done") return t("setup.status.done");
    return t("setup.working");
  }

  async function continueWithPresent(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await window.office.applySetup({
        mode: "local",
        packTier: snapshot.plan.tier,
        rolesToDownload: [],
        remoteConsent: false,
      });
      setDone(true);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function downloadLocal(): Promise<void> {
    setBusy(true);
    setDone(false);
    setError(null);
    setProgress({ kind: "start", percent: 0 });
    try {
      await window.office.applySetup({
        mode: "local",
        packTier: snapshot.plan.tier,
        rolesToDownload: roles.length > 0 ? roles : ["text"],
        remoteConsent: false,
      });
      setDone(true);
      setProgress({ kind: "done", percent: 100, detail: "local_done" });
      notifyDone(t("brand"), t("setup.notifyDoneBody"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6 text-gray-900">
      <div className="surface w-full max-w-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <BrandLogo variant="full" className="h-7 max-w-[9rem]" />
            <p className="mt-3 text-2xl font-semibold tracking-tight">{t("brand")}</p>
            <p className="mt-2 text-sm text-gray-500">{t("setup.intro")}</p>
          </div>
          <LocaleSwitch />
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded bg-gray-50 p-3">
            <dt className="text-gray-500">{t("setup.freeOn", { mount: snapshot.mount })}</dt>
            <dd className="mt-1 font-medium">{snapshot.freeLabel}</dd>
          </div>
          <div className="rounded bg-gray-50 p-3">
            <dt className="text-gray-500">{t("setup.localPack")}</dt>
            <dd className="mt-1 font-medium">
              {t("setup.packSizes", {
                min: snapshot.planMinimalLabel,
                full: snapshot.planFullLabel,
              })}
            </dd>
          </div>
        </dl>

        {/*
          Put the way out first. Someone whose PC cannot run the models has
          nothing to gain from reading the download options underneath, and
          finding that out only after picking through them is the worst way to
          learn it.
        */}
        <div className="mt-6 empty:mt-0">
          <CloudNudge onConfigured={() => void continueWithPresent()} />
        </div>

        {!snapshot.canFitMinimal ? (
          <div className="mt-6 rounded border border-warning-muted bg-warning-soft p-4 text-sm text-warning-ink">
            {t("setup.diskWarn")}
          </div>
        ) : (
          <ul className="mt-6 space-y-2">
            {snapshot.plan.roles.map((role) => {
              const disabled =
                role.role !== "text" &&
                selectedBytes + role.approxBytes > snapshot.freeBytes - 512 * 1024 * 1024 &&
                !roles.includes(role.role);
              return (
                <li key={role.role}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded border px-4 py-3 ${
                      roles.includes(role.role)
                        ? "border-gray-900 bg-gray-50"
                        : "border-gray-200"
                    } ${disabled || busy ? "opacity-40" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={roles.includes(role.role)}
                      disabled={disabled || busy || done}
                      onChange={() => toggleRole(role.role)}
                    />
                    <span>
                      <span className="font-medium">
                        {t(`setup.role.${role.role}`)}{" "}
                        <span className="text-gray-400">
                          (~{(role.approxBytes / 1024 / 1024).toFixed(0)} MB)
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500">
                        {t(`setup.roleDesc.${role.role}`)}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {/*
          Weights and the runtime that loads them are separate downloads, and
          having only the weights is the state that looks configured and then
          fails on the first call. Setup is where both get resolved.
        */}
        <div className="mt-6 rounded border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-800">{t("backend.title")}</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">{t("backend.setupHint")}</p>
          <div className="mt-3">
            <BackendSetupCard />
          </div>
        </div>

        {(busy || done) && (
          <div className="mt-6 rounded border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="font-medium text-gray-800">
                {done ? t("setup.status.done") : statusLabel(progress)}
              </p>
              {busy ? <Spinner className="h-4 w-4 text-gray-400" /> : null}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-gray-900 transition-[width] duration-300"
                style={{ width: `${done ? 100 : Math.max(percent ?? 0, busy ? 2 : 0)}%` }}
              />
            </div>
            {progress?.artifactId && !done ? (
              <p className="mt-2 truncate text-xs text-gray-500">{progress.artifactId}</p>
            ) : null}
            {done ? (
              <p className="mt-3 text-sm text-gray-700">{t("setup.localSaved")}</p>
            ) : null}
          </div>
        )}

        {snapshot.presentRoles.length > 0 ? (
          <p className="mt-4 rounded bg-gray-100 px-3 py-2 text-sm text-gray-600">
            {t("setup.alreadyHave", { roles: snapshot.presentRoles.join(", ") })}
          </p>
        ) : null}

        {error ? <p className="mt-4 text-sm text-destructive-ink">{error}</p> : null}

        <div className="mt-8 flex flex-wrap gap-3">
          {done ? (
            <button
              type="button"
              onClick={onComplete}
              className="btn-primary"
            >
              {t("setup.continue")}
            </button>
          ) : (
            <>
              {snapshot.presentRoles.includes("text") ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void continueWithPresent()}
                  className="btn-primary"
                >
                  {busy ? t("setup.working") : t("setup.useExisting")}
                </button>
              ) : null}
              {snapshot.canFitMinimal ? (
                <button
                  type="button"
                  disabled={busy || roles.length === 0}
                  onClick={() => void downloadLocal()}
                  className={snapshot.presentRoles.includes("text") ? "btn-secondary" : "btn-primary"}
                >
                  {busy ? t("setup.working") : t("setup.downloadLocal")}
                </button>
              ) : null}
            </>
          )}
        </div>
        <p className="mt-3 text-xs text-gray-400">
          {t("setup.modelsDir", { dir: snapshot.modelsDir })}
        </p>
      </div>
    </div>
  );
}
