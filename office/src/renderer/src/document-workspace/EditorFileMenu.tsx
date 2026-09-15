import { useEffect, useRef, useState } from "react";
import { useI18n } from "@redrob/ui";
import type { ArtifactView } from "../../../shared/office-api";

/**
 * File menu for the editor chrome — blank notes only. Word/Excel/decks come
 * from chat (`doc.create`), not a format picker.
 */
export function EditorFileMenu({
  onCreated,
}: {
  onCreated: (artifact: ArtifactView) => void;
}): JSX.Element {
  const { t } = useI18n();
  const [fileOpen, setFileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!fileOpen) return;
    function onDocClick(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setFileOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [fileOpen]);

  async function createBlankNote(): Promise<void> {
    setBusy(true);
    setFileOpen(false);
    try {
      const artifact = await window.office.createDocument({ format: "md" });
      onCreated(artifact);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative flex items-center gap-1">
      <button
        type="button"
        className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
          fileOpen ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white" : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        }`}
        aria-expanded={fileOpen}
        aria-haspopup="menu"
        disabled={busy}
        onClick={() => setFileOpen((v) => !v)}
      >
        {t("documentWorkspace.menuFile")}
      </button>
      {fileOpen ? (
        <ul
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 min-w-[12rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-800 dark:bg-gray-900"
        >
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="flex w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
              onClick={() => void createBlankNote()}
            >
              {busy
                ? t("documentWorkspace.creating")
                : t("documentsPanel.blankNote")}
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

/** Empty editor home — ask chat for real drafts; blank note is the escape hatch. */
export function DocumentStartScreen({
  onCreated,
  className,
}: {
  onCreated: (artifact: ArtifactView) => void;
  className?: string;
}): JSX.Element {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function createBlankNote(): Promise<void> {
    setBusy(true);
    try {
      const artifact = await window.office.createDocument({ format: "md" });
      onCreated(artifact);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className ?? "flex min-h-0 flex-1 flex-col"}>
      <div className="flex items-center gap-3 border-b border-gray-200/80 px-1 pb-3 dark:border-gray-800">
        <EditorFileMenu onCreated={onCreated} />
        <p className="text-sm font-bold text-gray-900 dark:text-white">
          {t("documentWorkspace.startTitle")}
        </p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-10">
        <p className="max-w-md text-center text-sm text-gray-600 dark:text-gray-300">
          {t("documentWorkspace.startHint")}
        </p>
        <button
          type="button"
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.98] disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          disabled={busy}
          onClick={() => void createBlankNote()}
        >
          {busy ? t("documentWorkspace.creating") : t("documentsPanel.blankNote")}
        </button>
      </div>
    </div>
  );
}
