import { useEffect, useRef, useState } from "react";
import { useI18n } from "@redrob/ui";
import type { ArtifactView } from "../../../shared/office-api";
import { MarkdownWorkbench, type WorkbenchMode } from "../MarkdownWorkbench";
import { shouldSyncMarkdownValue } from "./markdown-dirty-guard";

export function MarkdownEditor({
  artifact,
  onSaved,
  onDirtyChange,
  contentEpoch = 0,
  initialMode,
}: {
  artifact: ArtifactView;
  onSaved?: (next: ArtifactView) => void;
  onDirtyChange?: (dirty: boolean) => void;
  /** Bumped by the workspace after an intentional reload/save so body sync wins. */
  contentEpoch?: number;
  /** Passed through to the workbench; see its own note. */
  initialMode?: WorkbenchMode;
}): JSX.Element {
  const { t } = useI18n();
  const [value, setValue] = useState(artifact.body);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const previousArtifactIdRef = useRef<string | null>(null);
  const appliedEpochRef = useRef(0);

  useEffect(() => {
    if (contentEpoch === appliedEpochRef.current) return;
    appliedEpochRef.current = contentEpoch;
    previousArtifactIdRef.current = artifact.id;
    dirtyRef.current = false;
    setValue(artifact.body);
    setSaveStatus("idle");
    setSaveError(null);
    onDirtyChange?.(false);
  }, [contentEpoch, artifact.id, artifact.body, onDirtyChange]);

  useEffect(() => {
    const shouldSync = shouldSyncMarkdownValue({
      artifactId: artifact.id,
      previousArtifactId: previousArtifactIdRef.current,
      dirty: dirtyRef.current,
    });
    if (!shouldSync) {
      onDirtyChange?.(true);
      return;
    }
    previousArtifactIdRef.current = artifact.id;
    setValue(artifact.body);
    dirtyRef.current = false;
    setSaveStatus("idle");
    setSaveError(null);
    onDirtyChange?.(false);
  }, [artifact.id, artifact.body, onDirtyChange]);

  return (
    <>
      <MarkdownWorkbench
        value={value}
        {...(initialMode ? { initialMode } : {})}
        onChange={(next) => {
          setValue(next);
          setSaveStatus("idle");
          setSaveError(null);
          const dirty = next !== artifact.body;
          dirtyRef.current = dirty;
          onDirtyChange?.(dirty);
        }}
        onSave={async () => {
          setSaving(true);
          setSaveStatus("idle");
          try {
            const next = await window.office.updateArtifact({
              id: artifact.id,
              body: value,
              baseRevision: artifact.revision,
            });
            setSaveStatus("saved");
            dirtyRef.current = false;
            onDirtyChange?.(false);
            onSaved?.(next);
          } catch (error) {
            setSaveStatus("error");
            setSaveError(error instanceof Error ? error.message : String(error));
          } finally {
            setSaving(false);
          }
        }}
        saveLabel={t("documentWorkspace.save")}
        saving={saving}
        saveStatus={saveStatus}
        className="min-h-0"
      />
      {saveError ? (
        <p className="mt-2 rounded border border-warning-muted bg-warning-soft px-3 py-2 text-xs text-warning-ink">
          {saveError}
        </p>
      ) : null}
    </>
  );
}
