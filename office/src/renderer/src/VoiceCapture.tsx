import { useI18n } from "@redrob/ui";
import { AsrSetupCard } from "./AsrSetupCard";
import { Spinner } from "./Spinner";
import type { VoiceDictation } from "./use-voice-dictation";

/**
 * What dictation looks like while it is running, and what it says when the
 * transcriber is not installed. Both live here so every chat surface shows the
 * same thing rather than the one that happened to be built first.
 */

/** Sits above the composer while the mic is open. */
export function VoiceStatus({ voice }: { voice: VoiceDictation }): JSX.Element | null {
  const { t } = useI18n();
  if (!voice.armed) return null;

  if (voice.connecting) {
    return (
      <div
        className="mb-2 flex h-12 items-center justify-center gap-2.5 rounded border border-warning-muted bg-warning-soft px-4 text-foreground shadow-sm"
        role="status"
        aria-live="assertive"
      >
        <Spinner className="h-4 w-4 text-warning-ink" />
        <span className="text-sm font-semibold tracking-tight">{t("voice.micConnecting")}</span>
      </div>
    );
  }

  return (
    <div className="mb-2 space-y-1.5">
      {voice.justReady ? (
        <p
          className="text-center text-xs font-semibold text-brand-600"
          role="status"
          aria-live="polite"
        >
          {t("voice.micReady")}
        </p>
      ) : null}
      <div
        className="flex h-11 items-end justify-center gap-[3px] overflow-hidden rounded bg-brand-500/5 px-4 py-2 ring-1 ring-inset ring-brand-500/15"
        aria-label={t("voice.waveformAria")}
        role="img"
      >
        {voice.levels.map((level, index) => (
          <span
            key={index}
            className="w-[2.5px] shrink-0 rounded-full bg-brand-500"
            style={{
              height: `${Math.max(16, Math.round(level * 100))}%`,
              opacity: 0.35 + level * 0.65,
              transform: `scaleY(${0.85 + level * 0.2})`,
              transition: "height 70ms linear, opacity 70ms linear",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Raised when the transcriber is missing. Offers the install and then the
 * retry, rather than reporting an error code and leaving the mic dead.
 */
export function WhisperInstallDialog({ voice }: { voice: VoiceDictation }): JSX.Element | null {
  const { t } = useI18n();
  if (!voice.installOpen) return null;
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whisper-install-title"
    >
      <div className="max-h-[90%] w-full max-w-md overflow-auto rounded border border-gray-200 bg-white p-5 shadow-xl">
        <h3 id="whisper-install-title" className="text-base font-semibold text-gray-900">
          {t("asrSetup.neededTitle")}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{t("asrSetup.neededBody")}</p>
        <div className="mt-4">
          <AsrSetupCard active compact onReady={voice.markInstalled} />
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            className="btn-primary flex-1 disabled:opacity-40"
            disabled={!voice.readyToRetry}
            onClick={() => {
              voice.closeInstall();
              void voice.start();
            }}
          >
            {t("asrSetup.neededTryVoice")}
          </button>
          <button type="button" className="btn-secondary flex-1" onClick={voice.closeInstall}>
            {t("asrSetup.neededLater")}
          </button>
        </div>
      </div>
    </div>
  );
}
