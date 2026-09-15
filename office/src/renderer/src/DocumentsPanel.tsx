import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@redrob/ui";
import type {
  ArtifactKind,
  ArtifactMeta,
  ArtifactView,
} from "../../shared/office-api";
import { PanelResizeHandle, usePanelWidths } from "./panel-widths";
import { DocumentWorkspace } from "./document-workspace";
import { Spinner } from "./Spinner";

const PANEL_SPECS = {
  list: { default: 320, min: 220, max: 560 },
} as const;

const KIND_ORDER: readonly ArtifactKind[] = [
  "report",
  "email",
  "jd",
  "rubric",
  "other",
];

function extensionOf(meta: ArtifactMeta): string {
  return meta.contentFile.split(".").pop()?.toLowerCase() ?? "";
}

function formatBadge(meta: ArtifactMeta): string {
  const ext = extensionOf(meta);
  if (ext === "docx") return "W";
  if (ext === "xlsx") return "X";
  if (ext === "pptx") return "P";
  if (ext === "hwp" || ext === "hwpx") return "H";
  if (ext === "html" || ext === "htm") return "</>";
  if (ext === "svg") return "Svg";
  return "Md";
}

function formatWhen(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Open, browse, and edit files. New drafts come from chat; blank notes are the escape hatch. */
export function DocumentsPanel({
  openArtifactId,
  onOpened,
}: {
  /** Artifact another surface (chat/workflow) asked us to open. */
  openArtifactId?: string | null;
  onOpened?: () => void;
}): JSX.Element {
  const { t, locale } = useI18n();
  const { style, beginResize, reset } = usePanelWidths("documents", PANEL_SPECS);
  const [kind, setKind] = useState<ArtifactKind | "all">("all");
  const [items, setItems] = useState<ArtifactMeta[]>([]);
  const [selected, setSelected] = useState<ArtifactView | null>(null);
  const [busy, setBusy] = useState(false);
  const [creatingBlank, setCreatingBlank] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<ArtifactMeta[]> => {
    setBusy(true);
    setError(null);
    try {
      const list = await window.office.listArtifacts();
      setItems(list);
      return list;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return [];
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * Only offer filters for kinds actually on the shelf. A "Job post" chip in
   * front of someone who has never written one just makes the app look like it
   * came from somewhere else.
   */
  const kinds: Array<ArtifactKind | "all"> = [
    "all",
    ...KIND_ORDER.filter((candidate) =>
      items.some((item) => item.kind === candidate),
    ),
  ];
  const shown = kind === "all" ? items : items.filter((item) => item.kind === kind);

  const open = useCallback(
    async (id: string): Promise<void> => {
      setError(null);
      try {
        const full = await window.office.getArtifact(id);
        if (!full) {
          setError(t("artifacts.missing"));
          setSelected(null);
          return;
        }
        setSelected(full);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [t],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return window.office.onLocalDataWiped(() => {
      setSelected(null);
      void refresh();
    });
  }, [refresh]);

  useEffect(() => {
    if (!openArtifactId) return;
    void open(openArtifactId).then(() => onOpened?.());
  }, [openArtifactId, open, onOpened]);

  async function createBlankNote(): Promise<void> {
    setCreatingBlank(true);
    setError(null);
    try {
      const artifact = await window.office.createDocument({ format: "md" });
      setSelected(artifact);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingBlank(false);
    }
  }

  async function importFile(): Promise<void> {
    setImporting(true);
    setError(null);
    try {
      const artifact = await window.office.importDocument();
      if (artifact) {
        setSelected(artifact);
        await refresh();
      }
    } catch (err) {
      setError(
        t("documentsPanel.importFailed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setImporting(false);
    }
  }

  async function remove(id: string): Promise<void> {
    if (!window.confirm(t("documentsPanel.deleteConfirm"))) return;
    try {
      await window.office.deleteArtifact(id);
      if (selected?.id === id) setSelected(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-1 overflow-hidden">
      <aside className="pane flex flex-col overflow-hidden" style={style("list")}>
        <div className="shrink-0 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <button
            type="button"
            className="w-full rounded bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
            disabled={importing}
            onClick={() => void importFile()}
          >
            {importing ? <Spinner className="mr-1.5 h-3 w-3" /> : null}
            {importing ? t("documentsPanel.importing") : t("documentsPanel.import")}
          </button>
          <button
            type="button"
            className="mt-1.5 w-full rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            disabled={creatingBlank}
            onClick={() => void createBlankNote()}
          >
            {creatingBlank ? (
              <Spinner className="mr-1.5 h-3 w-3" />
            ) : null}
            {creatingBlank
              ? t("documentWorkspace.creating")
              : t("documentsPanel.blankNote")}
          </button>
          <p className="mt-1.5 text-[0.6875rem] leading-snug text-gray-400 dark:text-gray-500">
            {t("documentsPanel.createHint")}
          </p>
          <div
            className="mt-2.5 flex flex-wrap gap-1"
            role="listbox"
            aria-label={t("artifacts.filter")}
          >
            {kinds.map((item) => (
              <button
                key={item}
                type="button"
                role="option"
                aria-selected={kind === item}
                className={`rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold transition-all ${
                  kind === item
                    ? "bg-gray-900 text-white shadow-sm dark:bg-blue-600 dark:text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
                onClick={() => {
                  setKind(item);
                  setSelected(null);
                }}
              >
                {item === "all"
                  ? t("artifacts.all")
                  : t(`artifacts.kind.${item}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 py-2 dark:border-gray-800">
          <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
            {busy ? <Spinner className="h-3 w-3 text-gray-400" /> : null}
            {busy
              ? t("documentsPanel.loading")
              : t("documentsPanel.count", { count: shown.length })}
          </p>
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-[0.6875rem] text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            onClick={() => void refresh()}
          >
            {t("documentsPanel.refresh")}
          </button>
        </div>

        <ul
          className="min-h-0 flex-1 overflow-auto py-1"
          role="listbox"
          aria-label={t("documentsPanel.list")}
        >
          {shown.length === 0 && !busy ? (
            <li className="px-4 py-8 text-center text-xs leading-relaxed text-gray-400 dark:text-gray-500">
              {t("documentsPanel.empty")}
            </li>
          ) : (
            shown.map((item) => {
              const active = selected?.id === item.id;
              return (
                <li key={item.id} className="group relative">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => void open(item.id)}
                    className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors ${
                      active ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                    }`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-gray-100 text-[0.625rem] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {formatBadge(item)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {item.title}
                      </span>
                      <span className="truncate text-[0.6875rem] text-gray-500 dark:text-gray-400">
                        {t(`artifacts.kind.${item.kind}`)} ·{" "}
                        {formatWhen(item.createdAt, locale)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={t("documentsPanel.delete")}
                    title={t("documentsPanel.delete")}
                    onClick={() => void remove(item.id)}
                    className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded px-1.5 py-0.5 text-[0.6875rem] text-gray-500 hover:bg-gray-200 hover:text-gray-800 group-hover:block dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                  >
                    {t("documentsPanel.delete")}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="shrink-0 border-t border-gray-200 p-3 dark:border-gray-800">
          <button
            type="button"
            className="btn-secondary w-full text-xs"
            onClick={() =>
              void window.office.revealArtifactsFolder().catch((err: unknown) => {
                setError(err instanceof Error ? err.message : String(err));
              })
            }
          >
            {t("documentsPanel.openFolder")}
          </button>
        </div>
      </aside>

      <PanelResizeHandle
        label={t("shell.resizePanel")}
        onResizeStart={(event) => beginResize("list", event)}
        onReset={() => reset("list")}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card">
        {error ? (
          <p
            className="m-4 shrink-0 rounded border border-destructive-muted bg-destructive-soft p-3 text-sm text-destructive-ink"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col px-6 py-4">
          <DocumentWorkspace
            artifact={selected}
            onCreated={(artifact) => {
              setSelected(artifact);
              void refresh();
            }}
            onArtifactUpdated={(next) => {
              setSelected(next);
              setItems((prev) =>
                prev.map((item) =>
                  item.id === next.id ? { ...item, title: next.title } : item,
                ),
              );
            }}
            className="flex min-h-0 flex-1 flex-col"
          />
        </div>
      </div>
    </div>
  );
}
