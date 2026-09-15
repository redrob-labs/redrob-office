import { useEffect, useState } from "react";
import { useI18n } from "@redrob/ui";
import type { GenerateRubricResult } from "../../shared/office-api";
import { handleSubmitHotkey } from "./submit-hotkey";
import { estimateOperationMs, useWorkResult } from "./work-result";

export function RubricPanel({ workspaceId }: { workspaceId: string }): JSX.Element {
  const { t } = useI18n();
  const { setResult, startProgress, failProgress, clearProgress } = useWorkResult();
  const [jdText, setJdText] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setLocalResult] = useState<GenerateRubricResult | null>(null);
  const [saved, setSaved] = useState<string[]>([]);

  useEffect(() => {
    void window.office.listRubrics().then(setSaved).catch(() => setSaved([]));
  }, [result]);

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    const etaMs = await estimateOperationMs("generateRubric", 1_500);
    startProgress({
      operation: "generateRubric",
      title: t("rubric.resultTitle"),
      etaMs,
      steps: [
        { id: "draft", label: t("progress.rubric.draft"), status: "active" },
        { id: "save", label: t("progress.rubric.save"), status: "pending" },
      ],
    });
    try {
      const next = await window.office.generateRubric({
        jdText,
        workspaceId,
        ...(name.trim() ? { slug: name.trim() } : {}),
      });
      setLocalResult(next);
      const body = [
        `# ${next.rubric.id}`,
        "",
        ...next.rubric.axes.map((axis) => `## ${axis.label}\n${axis.guidance}\n`),
      ].join("\n");
      setResult({
        title: next.rubric.id,
        body,
        source: "template",
        meta: t("rubric.savedHint"),
      });
    } catch (err) {
      failProgress();
      clearProgress();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex flex-col gap-4"
      onKeyDown={(event) =>
        handleSubmitHotkey(event, !busy && jdText.trim().length > 0, () => void run())
      }
    >
      <p className="text-sm leading-relaxed text-gray-500">{t("rubric.body")}</p>
      <label className="block">
        <span className="field-label">{t("rubric.name")}</span>
        <input
          className="field-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("rubric.nameHint")}
        />
      </label>
      <label className="block">
        <span className="field-label">{t("rubric.jd")}</span>
        <textarea
          className="field-input min-h-48"
          value={jdText}
          onChange={(event) => setJdText(event.target.value)}
          placeholder={t("rubric.jdHint")}
        />
      </label>
      <button
        type="button"
        className="btn-primary self-start"
        disabled={busy || jdText.trim().length === 0}
        onClick={() => void run()}
      >
        {busy ? t("rubric.working") : t("rubric.generate")}
      </button>
      {error ? (
        <p className="rounded border border-destructive-muted bg-destructive-soft p-3 text-sm text-destructive-ink">{error}</p>
      ) : null}
      {saved.length > 0 ? (
        <p className="text-xs text-gray-400">{t("rubric.savedCount", { count: saved.length })}</p>
      ) : null}
    </div>
  );
}
