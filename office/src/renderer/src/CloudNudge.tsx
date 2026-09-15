import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@redrob/ui";
import type { LocalCapability, LocalShortfall } from "../../shared/office-api";
import {
  REDROB_CONSOLE_API_BASE,
  REDROB_CONSOLE_URL,
} from "../../shared/office-api";
import { DeviceConnectPanel, useDeviceConnect } from "./DeviceConnect";
import { Spinner } from "./Spinner";

function gigabytes(bytes: number): string {
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

function gibibytes(mib: number): string {
  return `${(mib / 1024).toFixed(1)} GB`;
}

function megabytesAsGb(mb: number): string {
  return `${(mb / 1000).toFixed(0)} GB`;
}

/** One line naming what is missing, with the numbers rather than an adjective. */
function shortfallLine(
  shortfall: LocalShortfall,
  t: (path: string, vars?: Record<string, string | number>) => string,
): string {
  switch (shortfall.id) {
    case "platform":
      return t("cloudNudge.reasonPlatform");
    case "gpu":
      return t("cloudNudge.reasonGpu");
    case "disk":
      return t("cloudNudge.reasonDisk", {
        need: gigabytes(shortfall.need),
        have: gigabytes(shortfall.have),
      });
    case "vram":
      return t("cloudNudge.reasonVram", {
        need: gibibytes(shortfall.need),
        have: gibibytes(shortfall.have),
      });
    case "ram":
      return t("cloudNudge.reasonRam", {
        need: megabytesAsGb(shortfall.need),
        have: megabytesAsGb(shortfall.have),
      });
  }
}

/**
 * Steers a machine that cannot do the work on device towards the cloud.
 *
 * It appears only when local inference genuinely cannot run and no cloud key
 * is set yet: a warning about a slow-but-working PC is not a reason to ask
 * anyone for an API key, and a machine that already has one has nothing left
 * to decide. The key field is here rather than a link to Settings because the
 * one thing that unblocks the person is one paste.
 */
export function CloudNudge({
  onConfigured,
  compact = false,
}: {
  /** Fired once a key is saved and the route is pointed at the cloud. */
  onConfigured?: (() => void) | undefined;
  /** Drops the heading, for panels that already have one. */
  compact?: boolean;
}): JSX.Element | null {
  const { t } = useI18n();
  const [capability, setCapability] = useState<LocalCapability | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /**
   * Connecting stores the key in the main process, so there is nothing to save
   * here: the nudge has served its purpose and gets out of the way.
   */
  const onConnected = useCallback((): void => {
    setSaved(true);
    onConfigured?.();
  }, [onConfigured]);
  const connect = useDeviceConnect(onConnected);

  useEffect(() => {
    let cancelled = false;
    void window.office
      .getLocalCapability()
      .then((next) => {
        if (!cancelled) setCapability(next);
      })
      .catch(() => {
        // Not knowing the hardware is not a reason to nag about it.
        if (!cancelled) setCapability(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const blocking = capability?.shortfalls.filter((item) => item.severity === "blocking") ?? [];
  if (!capability || capability.runnable || capability.cloudConfigured || saved) return null;

  async function save(): Promise<void> {
    const key = apiKey.trim();
    if (!key || busy) return;
    setBusy(true);
    setError(null);
    try {
      await window.office.saveLlmSettings({
        inferenceRoute: "openai",
        llmProviders: {
          openai: { apiKey: key, baseUrl: REDROB_CONSOLE_API_BASE },
        },
      });
      setSaved(true);
      onConfigured?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded border border-warning-muted bg-warning-soft p-4">
      {compact ? null : (
        <p className="text-sm font-semibold text-warning-ink">{t("cloudNudge.title")}</p>
      )}
      <ul className="mt-1 flex flex-col gap-0.5">
        {blocking.map((item) => (
          <li key={item.id} className="text-xs leading-relaxed text-foreground">
            {shortfallLine(item, t)}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-foreground">{t("cloudNudge.body")}</p>
      <div className="mt-3">
        <DeviceConnectPanel state={connect} compact />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="password"
          autoComplete="off"
          className="min-w-0 flex-1 rounded border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-warning"
          placeholder={t("cloudNudge.keyPlaceholder")}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void save();
          }}
        />
        <button
          type="button"
          className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-xs"
          disabled={!apiKey.trim() || busy}
          onClick={() => void save()}
        >
          {busy ? <Spinner className="h-3 w-3" /> : null}
          {t("cloudNudge.use")}
        </button>
        <button
          type="button"
          className="btn-secondary px-3 py-2 text-xs"
          onClick={() => {
            void window.office.openExternal(REDROB_CONSOLE_URL);
          }}
        >
          {t("cloudNudge.getKey")}
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{t("cloudNudge.privacy")}</p>
      {error ? <p className="mt-2 text-xs text-destructive-ink">{error}</p> : null}
    </section>
  );
}
