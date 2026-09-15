import { useEffect, useState } from "react";
import { useI18n } from "@redrob/ui";
import { handleSubmitHotkey } from "./submit-hotkey";
import { useWorkResult } from "./work-result";
import { slotLabel } from "./schema-label";

function previewValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** One output format of an otherwise identical template (same slots, different file). */
export interface DraftFormat {
  id: string;
  templateId: string;
}

export function SlotDraftPanel({
  templateId,
  titleKey,
  bodyKey,
  categoryId,
  artifactKind = "other",
  formats,
}: {
  templateId: string;
  titleKey: string;
  bodyKey: string;
  categoryId: string;
  artifactKind?: "jd" | "email" | "report" | "rubric" | "other";
  formats?: readonly DraftFormat[];
}): JSX.Element {
  const { t, locale } = useI18n();
  const { setResult } = useWorkResult();
  const [formatId, setFormatId] = useState<string>(formats?.[0]?.id ?? "");
  const activeTemplateId =
    formats?.find((format) => format.id === formatId)?.templateId ?? templateId;
  const [slots, setSlots] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<Array<{ id: string; description: string; required: boolean }>>(
    [],
  );
  const [useModel, setUseModel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [liveSlot, setLiveSlot] = useState<{ target: string; value: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void window.office.getTemplateSlots(activeTemplateId, locale).then((list) => {
      if (cancelled) return;
      setMeta(list);
      setSlots((prev) => {
        const next: Record<string, string> = {};
        for (const slot of list) {
          next[slot.id] = prev[slot.id] ?? "";
        }
        return next;
      });
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [activeTemplateId, locale]);

  useEffect(() => {
    return window.office.onSlotStream((event) => {
      if (event.operation !== "draftFromTemplate") return;
      setLiveSlot({
        target: event.streamTarget,
        value: previewValue(event.value),
      });
    });
  }, []);

  const ready =
    loaded &&
    meta.filter((slot) => slot.required).every((slot) => (slots[slot.id] ?? "").trim().length > 0);

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    setLiveSlot(null);
    try {
      const result = await window.office.draftFromTemplate({
        templateId: activeTemplateId,
        data: slots,
        useModel,
        categoryId,
        artifactKind,
        title: t(titleKey),
        locale,
      });
      const fileNote =
        result.contentFile && result.outputKind && result.outputKind !== "markdown"
          ? `\n\n---\n${t("draft.fileSaved", { file: result.contentFile })}`
          : "";
      setResult({
        title: t(titleKey),
        body: `${result.markdown}${fileNote}`,
        source: result.source,
        ...(result.outputKind ? { outputKind: result.outputKind } : {}),
        ...(result.contentFile ? { contentFile: result.contentFile } : {}),
        meta: [
          `${Math.round(result.timingMs)} ms`,
          result.outputKind && result.outputKind !== "markdown" ? result.outputKind : null,
          result.modelError ? t("draft.modelFallback") : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
      if (result.modelError) {
        setError(t("draft.modelFallbackDetail", { error: result.modelError }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setLiveSlot(null);
    }
  }

  return (
    <div
      className="flex flex-col gap-4"
      onKeyDown={(event) => handleSubmitHotkey(event, ready && !busy, () => void run())}
    >
      <p className="text-sm leading-relaxed text-gray-500">{t(bodyKey)}</p>
      {formats && formats.length > 1 ? (
        <label className="block">
          <span className="field-label">{t("draft.format")}</span>
          <select
            className="field-input"
            value={formatId}
            onChange={(event) => setFormatId(event.target.value)}
          >
            {formats.map((format) => (
              <option key={format.id} value={format.id}>
                {t(`draft.formatOption.${format.id}`)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {meta.map((slot) => (
        <label key={slot.id} className="block">
          <span className="field-label">
            {slotLabel(t, activeTemplateId, slot.id, slot.description, locale)}
            {slot.required ? "" : ` (${t("draft.optional")})`}
          </span>
          <textarea
            className="field-input min-h-20"
            value={slots[slot.id] ?? ""}
            onChange={(event) =>
              setSlots((prev) => ({ ...prev, [slot.id]: event.target.value }))
            }
          />
        </label>
      ))}
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={useModel}
          onChange={(event) => setUseModel(event.target.checked)}
        />
        {t("draft.useModel")}
      </label>
      <button
        type="button"
        className="btn-primary self-start disabled:opacity-50"
        disabled={!ready || busy}
        onClick={() => void run()}
      >
        {busy ? t("draft.working") : t("draft.run")}
      </button>
      {busy && useModel && liveSlot ? (
        <p className="truncate text-xs text-gray-500">
          {t("draft.slotStream", { target: liveSlot.target, value: liveSlot.value })}
        </p>
      ) : null}
      {error ? (
        <p className="rounded border border-destructive-muted bg-destructive-soft p-3 text-sm text-destructive-ink">{error}</p>
      ) : null}
    </div>
  );
}
