import { useEffect, useRef, useState } from "react";
import { useI18n } from "@redrob/ui";
import { handleSubmitHotkey } from "./submit-hotkey";
import { useWorkResult } from "./work-result";
import { MarkdownWorkbench } from "./MarkdownWorkbench";

type Mode = "edit" | "fill";

export function DocumentEditPanel(): JSX.Element {
  const { t } = useI18n();
  const { setResult } = useWorkResult();
  const [mode, setMode] = useState<Mode>("edit");
  const [path, setPath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [markdown, setMarkdown] = useState("");
  const [formLabels, setFormLabels] = useState<string[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveActionRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    setError(null);
  }, [mode]);

  async function pickAndOpen(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const picked = await window.office.pickDocumentFile();
      if (!picked) {
        setBusy(false);
        return;
      }
      const opened = await window.office.openDocumentForEdit(picked);
      setPath(opened.path);
      setFileName(opened.fileName);
      setMarkdown(opened.parsed.markdown);
      const labels = opened.parsed.formFields.map((field) => field.label);
      setFormLabels(labels);
      setFormValues(Object.fromEntries(labels.map((label) => [label, ""])));
      setResult({
        title: opened.fileName,
        body: opened.parsed.markdown,
        meta: [opened.parsed.fileType, t("documentEdit.opened")].join(" · "),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function savePatch(): Promise<void> {
    if (!path) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.office.savePatchedDocument({
        originalPath: path,
        editedMarkdown: markdown,
        title: fileName,
        categoryId: "legal",
      });
      const skipNote =
        result.skippedReasons.length > 0
          ? `\n\n${t("documentEdit.skipped", { count: result.skippedReasons.length })}`
          : "";
      setResult({
        title: fileName,
        body: `${result.markdown}${skipNote}\n\n---\n${t("draft.fileSaved", { file: result.contentFile })}`,
        source: "template",
        meta: [
          `${Math.round(result.timingMs)} ms`,
          t("documentEdit.applied", { count: result.applied }),
        ].join(" · "),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveFill(): Promise<void> {
    if (!path) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.office.fillOpenedForm({
        originalPath: path,
        values: formValues,
        title: fileName,
        categoryId: "legal",
      });
      setResult({
        title: fileName,
        body: [
          t("documentEdit.filled", { count: result.filledLabels.length }),
          result.unmatchedLabels.length > 0
            ? t("documentEdit.unmatched", { labels: result.unmatchedLabels.join(", ") })
            : null,
          "",
          "---",
          t("draft.fileSaved", { file: result.contentFile }),
        ]
          .filter((line) => line !== null)
          .join("\n"),
        source: "template",
        meta: `${Math.round(result.timingMs)} ms`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const canRun = Boolean(path) && !busy;

  saveActionRef.current = async (): Promise<void> => {
    if (!path || busy) return;
    await (mode === "edit" ? savePatch() : saveFill());
  };

  useEffect(() => {
    const handler = (event: Event): void => {
      if (!path || busy) return;
      event.preventDefault();
      void saveActionRef.current();
    };
    // Capture so document patch wins over ResultPane download when both are mounted.
    window.addEventListener("office:saveResult", handler, true);
    return () => window.removeEventListener("office:saveResult", handler, true);
  }, [path, busy]);

  return (
    <div
      className="flex flex-col gap-4"
      onKeyDown={(event) =>
        handleSubmitHotkey(event, canRun, () => {
          void (mode === "edit" ? savePatch() : saveFill());
        })
      }
    >
      <p className="text-sm leading-relaxed text-gray-500">{t("documentEdit.body")}</p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn-secondary text-xs ${mode === "edit" ? "bg-gray-100" : ""}`}
          onClick={() => setMode("edit")}
        >
          {t("documentEdit.modeEdit")}
        </button>
        <button
          type="button"
          className={`btn-secondary text-xs ${mode === "fill" ? "bg-gray-100" : ""}`}
          onClick={() => setMode("fill")}
        >
          {t("documentEdit.modeFill")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => void pickAndOpen()}
        >
          {busy ? t("documentEdit.working") : t("documentEdit.pick")}
        </button>
        {fileName ? (
          <span className="truncate text-sm text-gray-600">{fileName}</span>
        ) : (
          <span className="text-sm text-gray-400">{t("documentEdit.noFile")}</span>
        )}
      </div>

      {mode === "edit" ? (
        <div>
          <span className="field-label">{t("documentEdit.markdown")}</span>
          <MarkdownWorkbench
            value={markdown}
            onChange={setMarkdown}
            readOnly={!path || busy}
            {...(path ? { onSave: () => void savePatch() } : {})}
            saving={busy}
          />
        </div>
      ) : formLabels.length === 0 ? (
        <p className="text-sm text-gray-400">{t("documentEdit.noFields")}</p>
      ) : (
        formLabels.map((label) => (
          <label key={label} className="block">
            <span className="field-label">{label}</span>
            <input
              className="field-input"
              value={formValues[label] ?? ""}
              disabled={busy}
              onChange={(event) =>
                setFormValues((prev) => ({ ...prev, [label]: event.target.value }))
              }
            />
          </label>
        ))
      )}

      <button
        type="button"
        className="btn-primary self-start disabled:opacity-50"
        disabled={!canRun || (mode === "edit" && !markdown.trim())}
        onClick={() => void (mode === "edit" ? savePatch() : saveFill())}
      >
        {busy
          ? t("documentEdit.working")
          : mode === "edit"
            ? t("documentEdit.savePatch")
            : t("documentEdit.saveFill")}
      </button>

      {error ? (
        <p className="rounded border border-destructive-muted bg-destructive-soft p-3 text-sm text-destructive-ink">{error}</p>
      ) : null}
    </div>
  );
}
