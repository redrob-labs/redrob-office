import { useState } from "react";
import { useI18n } from "@redrob/ui";
import type { ArtifactView } from "../../../shared/office-api";

export type NewDocFormat = "md" | "docx" | "xlsx" | "pptx";

/** Escape hatch: one blank Markdown note. Prefer asking chat for real drafts. */
export function NewDocumentMenu({
  onCreated,
  className,
}: {
  onCreated: (artifact: ArtifactView) => void;
  className?: string;
}): JSX.Element {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createBlankNote(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const artifact = await window.office.createDocument({ format: "md" });
      onCreated(artifact);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        type="button"
        className="btn-secondary text-xs"
        disabled={busy}
        onClick={() => void createBlankNote()}
      >
        {busy ? t("documentWorkspace.creating") : t("documentsPanel.blankNote")}
      </button>
      {error ? (
        <p className="absolute right-0 top-full mt-1 whitespace-nowrap text-[0.6875rem] text-destructive-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
