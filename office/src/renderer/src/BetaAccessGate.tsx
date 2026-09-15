import { useCallback, useEffect, useState } from "react";
import { LocaleSwitch, useI18n } from "@redrob/ui";
import type { EngineStatusView, SetupSnapshot } from "../../shared/office-api";
import {
  REDROB_CONSOLE_API_BASE,
  REDROB_CONSOLE_URL,
} from "../../shared/office-api";
import { BrandLogo } from "./BrandLogo";
import { DeviceConnectPanel, useDeviceConnect } from "./DeviceConnect";
import { ExternalLinkIcon } from "./icons";
import {
  clearForceBetaGate,
  looksLikeRedrobKey,
} from "./beta-access";
import { Spinner } from "./Spinner";

interface BetaAccessGateProps {
  snapshot: SetupSnapshot;
  onComplete: () => void;
}

type GateStep = "key" | "engine";

function hasCloudRoute(snapshot: SetupSnapshot): boolean {
  return Boolean(snapshot.state.llmProviders?.openai?.apiKey);
}

/**
 * Front door: a workspace connection, then a check that the agent engine is ready.
 * The engine ships with the app, so there is nothing to install; the second step
 * only confirms it is reachable before the workspace opens.
 *
 * The first step leads with connecting, because the console can issue this PC a
 * key on its own and asking someone to carry a secret between two windows is the
 * step people got wrong. Pasting one is still here, one click away, for a machine
 * with no browser to hand or a key that came from a colleague.
 */
export function BetaAccessGate({
  snapshot,
  onComplete,
}: BetaAccessGateProps): JSX.Element {
  const { t } = useI18n();
  const [step, setStep] = useState<GateStep>(() =>
    hasCloudRoute(snapshot) ? "engine" : "key",
  );
  const [apiKey, setApiKey] = useState("");
  const [pasting, setPasting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);
  const [engineStatus, setEngineStatus] = useState<EngineStatusView | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.betaGate = "1";
    return () => {
      delete root.dataset.betaGate;
    };
  }, []);

  const refreshEngine = useCallback(async (): Promise<EngineStatusView> => {
    const status = await window.office.getEngineStatus();
    setEngineStatus(status);
    return status;
  }, []);

  useEffect(() => {
    if (step !== "engine") return;
    void refreshEngine().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [step, refreshEngine]);

  const finishOnboarding = useCallback(async (): Promise<void> => {
    await window.office.applySetup({
      mode: "local",
      packTier: snapshot.plan.tier,
      rolesToDownload: [],
      remoteConsent: false,
    });
    clearForceBetaGate();
    setEntered(true);
    onComplete();
  }, [onComplete, snapshot.plan.tier]);

  /**
   * The key is already stored by the time this runs: the main process wrote it
   * where a pasted one goes before answering. So there is nothing to save here,
   * only the same engine check the paste path does.
   */
  const onConnected = useCallback((): void => {
    setError(null);
    void (async () => {
      try {
        const status = await refreshEngine();
        if (status.available) {
          await finishOnboarding();
          return;
        }
        setStep("engine");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [finishOnboarding, refreshEngine]);

  const connect = useDeviceConnect(onConnected);

  async function continueWithKey(): Promise<void> {
    const key = apiKey.trim();
    if (!looksLikeRedrobKey(key) || busy) {
      setError(t("betaAccess.keyInvalid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await window.office.saveLlmSettings({
        inferenceRoute: "openai",
        llmProviders: {
          openai: { apiKey: key, baseUrl: REDROB_CONSOLE_API_BASE },
        },
      });
      const status = await refreshEngine();
      if (status.available) {
        await finishOnboarding();
        return;
      }
      setStep("engine");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function continueWithEngine(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const status = await refreshEngine();
      if (!status.available) {
        throw new Error(status.reason ?? t("betaAccess.engineFailed"));
      }
      await finishOnboarding();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="beta-gate relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10 text-gray-900">
      <div className="beta-gate-atmosphere" aria-hidden />
      <div className="beta-gate-panel relative z-10 w-full max-w-md">
        <div className="flex items-start justify-between gap-4">
          <BrandLogo variant="full" className="h-8 max-w-[10rem] beta-gate-fade" />
          <LocaleSwitch />
        </div>

        <p className="beta-gate-fade beta-gate-fade-delay-1 mt-8 text-xs font-medium uppercase tracking-wide text-gray-500">
          {step === "key"
            ? t("betaAccess.stepKey")
            : t("betaAccess.stepEngine")}
        </p>

        <h1 className="beta-gate-fade beta-gate-fade-delay-1 mt-3 text-[2rem] font-semibold tracking-tight text-foreground">
          {t("brand")}
        </h1>

        {step === "key" ? (
          <>
            <p className="beta-gate-fade beta-gate-fade-delay-2 mt-3 text-base leading-relaxed text-gray-600">
              {t("betaAccess.headline")}
            </p>
            <p className="beta-gate-fade beta-gate-fade-delay-3 mt-2 text-sm leading-relaxed text-gray-500">
              {t("betaAccess.body")}
            </p>

            <div className="beta-gate-fade beta-gate-fade-delay-4 mt-6">
              <DeviceConnectPanel state={connect} disabled={busy || entered} />
            </div>

            {pasting ? (
              <>
                <label className="beta-gate-fade mt-6 block">
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    {t("betaAccess.keyLabel")}
                  </span>
                  <input
                    type="password"
                    autoComplete="off"
                    autoFocus
                    spellCheck={false}
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white/90 px-3 py-3 text-sm text-gray-900 outline-none ring-brand-600/30 transition focus:border-brand-600 focus:ring-2"
                    placeholder={t("betaAccess.keyPlaceholder")}
                    value={apiKey}
                    disabled={busy || entered}
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      if (error) setError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void continueWithKey();
                    }}
                  />
                </label>

                <button
                  type="button"
                  className="btn-secondary mt-4 flex w-full items-center justify-center gap-2 py-3"
                  disabled={!apiKey.trim() || busy || entered}
                  onClick={() => void continueWithKey()}
                >
                  {busy ? <Spinner className="h-4 w-4" /> : null}
                  {busy ? t("betaAccess.working") : t("betaAccess.continue")}
                </button>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-700"
                    onClick={() => {
                      setPasting(false);
                      setApiKey("");
                      setError(null);
                    }}
                  >
                    {t("deviceConnect.connectInstead")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-xs text-gray-500 underline underline-offset-2 hover:text-gray-700"
                    onClick={() => {
                      void window.office.openExternal(REDROB_CONSOLE_URL);
                    }}
                  >
                    <ExternalLinkIcon className="h-3.5 w-3.5" />
                    {t("betaAccess.getKey")}
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="mt-4 text-xs text-gray-500 underline underline-offset-2 hover:text-gray-700"
                disabled={busy || entered}
                onClick={() => {
                  connect.cancel();
                  setPasting(true);
                }}
              >
                {t("deviceConnect.pasteInstead")}
              </button>
            )}

            <p className="beta-gate-fade beta-gate-fade-delay-5 mt-6 text-xs leading-relaxed text-gray-500">
              {t("betaAccess.privacy")}
            </p>
          </>
        ) : (
          <>
            <p className="beta-gate-fade beta-gate-fade-delay-2 mt-3 text-base leading-relaxed text-gray-600">
              {t("betaAccess.engineHeadline")}
            </p>
            <p className="beta-gate-fade beta-gate-fade-delay-3 mt-2 text-sm leading-relaxed text-gray-500">
              {t("betaAccess.engineBody")}
            </p>

            {engineStatus?.available ? (
              <p className="mt-6 text-sm text-success-ink">
                {t("betaAccess.engineReady")}
              </p>
            ) : (
              <p className="mt-6 text-sm text-gray-600">
                {engineStatus?.reason ?? t("betaAccess.engineMissing")}
              </p>
            )}

            <button
              type="button"
              className="btn-primary beta-gate-fade beta-gate-fade-delay-5 mt-6 flex w-full items-center justify-center gap-2 py-3"
              disabled={busy || entered}
              onClick={() => void continueWithEngine()}
            >
              {busy ? <Spinner className="h-4 w-4" /> : null}
              {busy
                ? t("betaAccess.working")
                : engineStatus?.available
                  ? t("betaAccess.engineContinue")
                  : t("betaAccess.engineRetry")}
            </button>

            <button
              type="button"
              className="mt-3 w-full text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline"
              disabled={busy}
              onClick={() => {
                setStep("key");
                setError(null);
              }}
            >
              {t("betaAccess.backToKey")}
            </button>
          </>
        )}

        {error ? (
          <p className="mt-3 text-sm text-destructive-ink" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
