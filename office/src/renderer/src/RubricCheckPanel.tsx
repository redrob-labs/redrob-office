import { useState } from "react";
import { useI18n } from "@redrob/ui";
import { handleSubmitHotkey } from "./submit-hotkey";
import { useWorkResult } from "./work-result";
import { severityLabel } from "./schema-label";

/** Paste text and score it against a rubric (conform / code review / design checks). */
export function RubricCheckPanel({
  rubricId,
  titleKey,
  bodyKey,
}: {
  rubricId: string;
  titleKey: string;
  bodyKey: string;
}): JSX.Element {
  const { t } = useI18n();
  const { setResult } = useWorkResult();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = (await window.office.compareStructured(
        { text },
        rubricId,
      )) as {
        findings?: Array<{ severity: string; message: string; ruleId: string }>;
        timing?: { totalMs: number };
      };
      const findings = result.findings ?? [];
      const body =
        findings.length === 0
          ? t("rubricCheck.none")
          : findings
              .map(
                (finding) =>
                  `- **${severityLabel(t, finding.severity)}** (${finding.ruleId}): ${finding.message}`,
              )
              .join("\n");
      setResult({
        title: t(titleKey),
        body: `# ${t(titleKey)}\n\n${body}\n`,
        source: "model",
        ...(typeof result.timing?.totalMs === "number"
          ? { meta: `${Math.round(result.timing.totalMs)} ms · ${findings.length}` }
          : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex flex-col gap-4"
      onKeyDown={(event) =>
        handleSubmitHotkey(event, !busy && Boolean(text.trim()), () => void run())
      }
    >
      <p className="text-sm leading-relaxed text-gray-500">{t(bodyKey)}</p>
      <label className="block">
        <span className="field-label">{t("rubricCheck.paste")}</span>
        <textarea
          className="field-input min-h-40"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn-primary self-start disabled:opacity-50"
        disabled={busy || !text.trim()}
        onClick={() => void run()}
      >
        {busy ? t("rubricCheck.working") : t("rubricCheck.run")}
      </button>
      {error ? (
        <p className="rounded border border-destructive-muted bg-destructive-soft p-3 text-sm text-destructive-ink">{error}</p>
      ) : null}
    </div>
  );
}
