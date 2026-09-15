import { useEffect, useRef, useState } from "react";
import { useI18n } from "@redrob/ui";
import { nowMs } from "./clock";
import { useWorkResult } from "./work-result";
import { MarkdownWorkbench } from "./MarkdownWorkbench";

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function StepMark({ status }: { status: string }): JSX.Element {
  if (status === "done") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-[0.625rem] font-bold text-white">
        ✓
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[0.625rem] font-bold text-destructive-foreground">
        !
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="relative flex h-5 w-5 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand-500/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
      </span>
    );
  }
  return (
    <span className="h-5 w-5 rounded-full ring-1 ring-inset ring-gray-200" />
  );
}

function downloadTextFile(title: string, body: string, ext: string): void {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "result";
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${base}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ResultPane(): JSX.Element {
  const { t } = useI18n();
  const { result, progress, liveBody, cancelProgress, setResult } = useWorkResult();
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => nowMs());
  const [draftBody, setDraftBody] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!progress) return;
    setNow(nowMs());
    const timer = window.setInterval(() => setNow(nowMs()), 500);
    return () => window.clearInterval(timer);
  }, [progress]);

  useEffect(() => {
    setDraftBody(result?.body ?? "");
    setSaveStatus("idle");
  }, [result?.title, result?.body, result?.meta]);

  async function copy(): Promise<void> {
    const text = draftBody || result?.body;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const saveRef = useRef<() => Promise<void>>(async () => undefined);
  saveRef.current = async (): Promise<void> => {
    if (!result) return;
    setSaving(true);
    setSaveStatus("idle");
    try {
      const kind = result.outputKind ?? "markdown";
      if (kind === "html") {
        downloadTextFile(result.title, draftBody, "html");
      } else {
        downloadTextFile(result.title, draftBody, "md");
      }
      if (draftBody !== result.body) {
        setResult({ ...result, body: draftBody });
      }
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus("idle"), 1600);
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const handler = (event: Event): void => {
      if (event.defaultPrevented) return;
      void saveRef.current();
    };
    window.addEventListener("office:saveResult", handler);
    return () => window.removeEventListener("office:saveResult", handler);
  }, []);

  const elapsedMs = progress ? Math.max(0, now - progress.startedAt) : 0;
  const remainingMs =
    progress?.etaMs != null ? Math.max(0, progress.etaMs - elapsedMs) : null;
  const overtime = progress?.etaMs != null && elapsedMs > progress.etaMs;
  const binaryKind =
    result?.outputKind &&
    ["pptx", "docx", "hwpx", "hwp"].includes(result.outputKind);

  return (
    <aside
      className="surface flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-tour="result"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-5 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-400">{t("shell.result")}</p>
          <p className="truncate text-sm font-semibold text-gray-800">
            {progress ? progress.title : (result?.title ?? t("shell.resultEmptyTitle"))}
          </p>
        </div>
        {result && !progress ? (
          <button type="button" className="btn-secondary shrink-0" onClick={() => void copy()}>
            {copied ? t("jd.copied") : t("jd.copy")}
          </button>
        ) : null}
        {progress ? (
          <button type="button" className="btn-secondary shrink-0" onClick={() => cancelProgress()}>
            {t("progress.cancel")}
          </button>
        ) : null}
        {progress ? (
          <span className="shrink-0 rounded bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
            {t("progress.inProgress")}
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        {progress ? (
          <div className="space-y-5">
            <div className="rounded bg-gray-50 p-4 ring-1 ring-inset ring-gray-300">
              <p className="text-sm text-gray-600">
                {overtime
                  ? t("progress.stillWorking", { elapsed: formatDuration(elapsedMs) })
                  : remainingMs != null
                    ? t("progress.eta", {
                        elapsed: formatDuration(elapsedMs),
                        remaining: formatDuration(remainingMs),
                      })
                    : t("progress.elapsed", { elapsed: formatDuration(elapsedMs) })}
              </p>
              {progress.etaMs != null ? (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-[width] duration-500"
                    style={{
                      width: `${Math.min(95, Math.round((elapsedMs / progress.etaMs) * 100))}%`,
                    }}
                  />
                </div>
              ) : (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-200">
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-500/80" />
                </div>
              )}
            </div>

            <ol className="space-y-3">
              {progress.steps.map((step) => (
                <li key={step.id} className="flex items-start gap-3">
                  <StepMark status={step.status} />
                  <div className="min-w-0 pt-0.5">
                    <p
                      className={`text-sm font-medium ${
                        step.status === "active"
                          ? "text-gray-900"
                          : step.status === "done"
                            ? "text-gray-500"
                            : step.status === "error"
                              ? "text-destructive-ink"
                              : "text-gray-400"
                      }`}
                    >
                      {step.label}
                    </p>
                    {step.status === "active" ? (
                      <p className="mt-0.5 text-xs text-gray-400">{t("progress.workingStep")}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>

            {liveBody ? (
              <div className="border-t border-gray-200 pt-5">
                <p className="mb-2 text-xs font-medium text-gray-400">{t("jd.liveDraft")}</p>
                <MarkdownWorkbench value={liveBody} readOnly />
              </div>
            ) : null}
          </div>
        ) : result ? (
          <>
            {result.source || result.meta ? (
              <p className="mb-3 text-xs text-gray-400">
                {[
                  result.source === "model"
                    ? t("shell.resultFromModel")
                    : result.source === "template"
                      ? t("shell.resultFromTemplate")
                      : null,
                  result.meta,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
            {binaryKind ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">{t("workbench.binaryHint")}</p>
                {result.contentFile ? (
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => void window.office.revealArtifactsFolder()}
                  >
                    {t("workbench.openArtifacts")}
                  </button>
                ) : null}
                <MarkdownWorkbench
                  value={draftBody}
                  readOnly
                  {...(result.outputKind ? { outputKind: result.outputKind } : {})}
                />
              </div>
            ) : (
              <MarkdownWorkbench
                value={draftBody}
                onChange={setDraftBody}
                {...(result.outputKind ? { outputKind: result.outputKind } : {})}
                onSave={() => void saveRef.current()}
                saving={saving}
                saveStatus={saveStatus}
              />
            )}
          </>
        ) : (
          <div className="flex h-full min-h-40 items-center justify-center text-center">
            <p className="text-sm text-gray-400">{t("shell.resultHint")}</p>
          </div>
        )}
      </div>
    </aside>
  );
}
