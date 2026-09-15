import { useEffect, useRef, useState } from "react";
import { useI18n } from "@redrob/ui";
import { MarkdownBody } from "./MarkdownBody";
import { HtmlPreview } from "./HtmlPreview";

export type WorkbenchMode = "edit" | "preview";

function looksLikeHtml(source: string): boolean {
  const head = source.trimStart().slice(0, 200).toLowerCase();
  return (
    head.startsWith("<!doctype html") ||
    head.startsWith("<html") ||
    (head.startsWith("<") && /<(?:html|head|body|div|section|article)\b/.test(head))
  );
}

/**
 * Edit / preview workbench for markdown (and HTML preview when content is HTML).
 */
export function MarkdownWorkbench({
  value,
  onChange,
  outputKind,
  readOnly,
  className,
  onSave,
  saveLabel,
  saving,
  saveStatus,
  initialMode,
}: {
  value: string;
  onChange?: (next: string) => void;
  /** When "html" or content looks like HTML, preview uses a sandboxed iframe. */
  outputKind?: string | null;
  readOnly?: boolean;
  className?: string;
  /**
   * Which half to open on. A surface that already draws the page beside this
   * one asks for "edit", so the two panes are the source and the page rather
   * than the page twice.
   */
  initialMode?: WorkbenchMode;
  onSave?: () => void | Promise<void>;
  saveLabel?: string;
  saving?: boolean;
  saveStatus?: "idle" | "saved" | "error";
}): JSX.Element {
  const { t } = useI18n();
  const [mode, setMode] = useState<WorkbenchMode>(
    readOnly ? "preview" : (initialMode ?? "preview"),
  );
  const editable = Boolean(onChange) && !readOnly;
  const htmlMode = outputKind === "html" || (!outputKind && looksLikeHtml(value));
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editable) setMode("preview");
  }, [editable]);

  return (
    <div ref={rootRef} className={className}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {editable ? (
          <div className="flex rounded-lg border border-gray-200 bg-gray-100/70 p-0.5 text-xs dark:border-gray-800 dark:bg-gray-800/80">
            <button
              type="button"
              className={`rounded-md px-3 py-1 font-semibold transition-all ${
                mode === "edit" ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white" : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              }`}
              onClick={() => setMode("edit")}
            >
              {t("workbench.edit")}
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1 font-semibold transition-all ${
                mode === "preview" ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white" : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              }`}
              onClick={() => setMode("preview")}
            >
              {htmlMode ? t("workbench.htmlPreview") : t("workbench.preview")}
            </button>
          </div>
        ) : null}
        {onSave ? (
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-xs transition-all hover:bg-gray-50 active:scale-[0.98] disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            disabled={saving}
            onClick={() => void onSave()}
          >
            {saving
              ? t("workbench.saving")
              : saveStatus === "saved"
                ? t("workbench.saved")
                : (saveLabel ?? t("workbench.save"))}
          </button>
        ) : null}
        {saveStatus === "error" ? (
          <span className="text-xs text-destructive-ink" role="alert">
            {t("workbench.saveFailed")}
          </span>
        ) : null}
      </div>

      {mode === "edit" && editable ? (
        <textarea
          className="field-input min-h-[24rem] w-full font-mono text-sm leading-relaxed"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          spellCheck={false}
        />
      ) : htmlMode ? (
        <HtmlPreview source={value} />
      ) : (
        <MarkdownBody source={value} />
      )}
    </div>
  );
}
