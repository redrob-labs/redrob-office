import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@redrob/ui";
import type { ArtifactView } from "../../../shared/office-api";
import { MarkdownEditor } from "./MarkdownEditor";
import { SpreadsheetEditor } from "./SpreadsheetEditor";
import { DocumentStartScreen, EditorFileMenu } from "./EditorFileMenu";
import { DocRender } from "./DocRender";
import { decideMarkdownArtifactUpdate } from "./markdown-dirty-guard";

export type WorkspaceFormat = "md" | "spreadsheet" | "office";

/**
 * Markdown is edited in place; Word, Excel, and PowerPoint are edited through
 * the document tools and shown here drawn by the app itself — no office suite
 * in the loop to view them or to export a PDF.
 */
function extensionOf(artifact: ArtifactView): string {
  const name = artifact.contentFile || artifact.absolutePath || "";
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function formatFromArtifact(artifact: ArtifactView): WorkspaceFormat | null {
  const ext = extensionOf(artifact);
  if (ext === "xlsx") return "spreadsheet";
  if (ext === "docx" || ext === "pptx") return "office";
  if (ext === "hwp" || ext === "hwpx") return "office";
  if (artifact.encoding === "utf8") return "md";
  return null;
}

export function DocumentWorkspace({
  artifact: given,
  onArtifactUpdated,
  onCreated,
  className,
}: {
  artifact: ArtifactView | null;
  onArtifactUpdated?: (next: ArtifactView) => void;
  onCreated?: (next: ArtifactView) => void;
  className?: string;
}): JSX.Element {
  const { t } = useI18n();
  const [reloadToken, setReloadToken] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  /** Only bumped on save, so typing does not re-render the preview mid-keystroke. */
  const [savedToken, setSavedToken] = useState(0);
  const [externalConflict, setExternalConflict] = useState(false);
  /** Forces MarkdownEditor to adopt artifact.body after an intentional reload. */
  const [markdownContentEpoch, setMarkdownContentEpoch] = useState(0);
  const markdownDirty = useRef(false);
  /**
   * The document as it is now, not as it was when it was handed over. A task
   * makes a document and then fills it in, and a view that never looked again
   * showed an empty page beside a chat message describing its contents.
   */
  const [artifact, setArtifact] = useState<ArtifactView | null>(given);
  const artifactRef = useRef(artifact);
  artifactRef.current = artifact;
  useEffect(() => {
    const decision = decideMarkdownArtifactUpdate({
      current: artifactRef.current,
      incoming: given,
      markdownDirty: markdownDirty.current,
      source: "given-prop",
    });
    if (decision.action === "ignore") return;
    if (decision.action === "keep-local") {
      if (decision.conflict) setExternalConflict(true);
      return;
    }
    setArtifact(given);
    markdownDirty.current = false;
    setExternalConflict(false);
  }, [given]);
  // Callers pass this inline; holding it steady keeps the watcher subscribed
  // rather than torn down and rebuilt on every render.
  const notifyUpdated = useRef(onArtifactUpdated);
  useEffect(() => {
    notifyUpdated.current = onArtifactUpdated;
  }, [onArtifactUpdated]);

  const format = artifact ? formatFromArtifact(artifact) : null;
  const isHtml = artifact ? ["html", "htm"].includes(extensionOf(artifact)) : false;

  const handleCreated = useCallback(
    (next: ArtifactView) => {
      onCreated?.(next);
      onArtifactUpdated?.(next);
    },
    [onCreated, onArtifactUpdated],
  );

  const path = artifact?.absolutePath;
  const artifactId = artifact?.id;

  // A web page is opened to be looked at, not to be read as source, so its
  // rendered half is already showing when it opens.
  useEffect(() => {
    if (isHtml) setPreviewOpen(true);
  }, [isHtml, path]);

  useEffect(() => {
    if (!path) return;
    return window.office.onDocReloaded((payload) => {
      if (payload.path !== path) return;
      setReloadToken((n) => n + 1);
      const decision = decideMarkdownArtifactUpdate({
        current: artifactRef.current,
        incoming: artifactRef.current,
        markdownDirty: markdownDirty.current,
        source: "watcher-reload",
      });
      if (decision.action === "keep-local") {
        if (decision.conflict) setExternalConflict(true);
        return;
      }
      // The rendered page follows the file on its own; the text does not, so
      // read it back before showing it again.
      if (!artifactId) return;
      void window.office
        .getArtifact(artifactId)
        .then((next) => {
          if (!next) return;
          setArtifact(next);
          notifyUpdated.current?.(next);
        })
        .catch(() => undefined);
    });
  }, [path, artifactId]);

  // A task working through the document tools writes behind our back, so
  // re-render whenever the watcher reports a write and whenever the user comes
  // back to Office.
  useEffect(() => {
    if (!path) return;
    void window.office.watchDocument(path);
    const onFocus = (): void => setReloadToken((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      void window.office.unwatchDocument(path);
    };
  }, [path]);

  const handleMdSaved = useCallback(
    (next: ArtifactView) => {
      markdownDirty.current = false;
      setExternalConflict(false);
      setArtifact(next);
      onArtifactUpdated?.(next);
      setSavedToken((n) => n + 1);
      setMarkdownContentEpoch((n) => n + 1);
    },
    [onArtifactUpdated],
  );

  const handleMarkdownDirty = useCallback((dirty: boolean) => {
    markdownDirty.current = dirty;
    if (!dirty) setExternalConflict(false);
  }, []);

  const reloadMarkdown = useCallback(async (): Promise<void> => {
    if (!artifactId) return;
    const next = await window.office.getArtifact(artifactId);
    if (!next) return;
    markdownDirty.current = false;
    setExternalConflict(false);
    setArtifact(next);
    setMarkdownContentEpoch((n) => n + 1);
    notifyUpdated.current?.(next);
  }, [artifactId]);

  if (!artifact) {
    return (
      <DocumentStartScreen
        onCreated={handleCreated}
        className={className ?? "flex min-h-0 flex-1 flex-col"}
      />
    );
  }

  if (!format) {
    return (
      <div className={className ?? "flex min-h-0 flex-1 flex-col"}>
        <EditorChrome title={artifact.title} onCreated={handleCreated} />
        <p className="mt-4 text-sm text-destructive-ink" role="alert">
          {t("documentWorkspace.unsupported")}
        </p>
      </div>
    );
  }

  return (
    <div className={className ?? "flex min-h-0 flex-1 flex-col"}>
      <EditorChrome
        title={artifact.title}
        onCreated={handleCreated}
        artifact={artifact}
        {...(format === "md"
          ? {
              previewOpen,
              onTogglePreview: () => setPreviewOpen((open) => !open),
            }
          : {})}
      />
      {format === "office" ? (
        <div className="flex min-h-0 flex-1 flex-col pt-3">
          <DocRender path={artifact.absolutePath} reloadToken={reloadToken} />
        </div>
      ) : format === "spreadsheet" ? (
        <div className="flex min-h-0 flex-1 flex-col pt-3">
          <SpreadsheetEditor
            artifact={artifact}
            onSaved={(next) => {
              setArtifact(next);
              notifyUpdated.current?.(next);
              setReloadToken((token) => token + 1);
            }}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col pt-3">
          {externalConflict ? (
            <div
              className="mb-2 flex shrink-0 items-center gap-3 rounded border border-warning-muted bg-warning-soft px-3 py-2 text-xs text-warning-ink"
              role="alert"
            >
              <span className="min-w-0 flex-1">
                {t("documentWorkspace.changedWhileEditing")}
              </span>
              <button
                type="button"
                className="btn-secondary shrink-0 text-xs"
                onClick={() => void reloadMarkdown()}
              >
                {t("documentWorkspace.reload")}
              </button>
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 gap-3">
            <div className="min-h-0 min-w-0 flex-1 overflow-auto">
              <MarkdownEditor
                artifact={artifact}
                onSaved={handleMdSaved}
                onDirtyChange={handleMarkdownDirty}
                contentEpoch={markdownContentEpoch}
                {...(isHtml ? { initialMode: "edit" as const } : {})}
              />
            </div>
            {previewOpen ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <DocRender
                  path={artifact.absolutePath}
                  reloadToken={savedToken + reloadToken}
                />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function EditorChrome({
  title,
  onCreated,
  artifact,
  previewOpen,
  onTogglePreview,
}: {
  title: string;
  onCreated: (artifact: ArtifactView) => void;
  artifact?: ArtifactView;
  previewOpen?: boolean;
  onTogglePreview?: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const [exporting, setExporting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [serving, setServing] = useState(false);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Only a page has anything to gain from a URL; a spreadsheet does not.
  const isWebPage = /\.html?$/i.test(artifact?.absolutePath ?? "");

  async function openExternally(): Promise<void> {
    if (!artifact) return;
    setOpening(true);
    setNotice(null);
    try {
      await window.office.openDocumentExternally(artifact.absolutePath);
      setNotice(t("documentsPanel.openedExternally"));
    } catch (err) {
      setNotice(
        t("documentsPanel.previewFailed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setOpening(false);
    }
  }

  async function exportPdf(): Promise<void> {
    if (!artifact) return;
    setExporting(true);
    setNotice(null);
    try {
      const result = await window.office.exportDocumentPdf({
        path: artifact.absolutePath,
        suggestedName: artifact.title,
      });
      if (result === null) return;
      setNotice(
        result.ok
          ? t("documentsPanel.exported", { path: result.path })
          : t("documentsPanel.previewFailed", { error: result.reason }),
      );
    } catch (err) {
      setNotice(
        t("documentsPanel.previewFailed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setExporting(false);
    }
  }

  async function serveLive(): Promise<void> {
    if (!artifact) return;
    setServing(true);
    setNotice(null);
    try {
      const { url } = await window.office.servePageLocally(
        artifact.absolutePath,
      );
      setLiveUrl(url);
    } catch (err) {
      setNotice(
        t("documentsPanel.previewFailed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setServing(false);
    }
  }

  return (
    <div className="shrink-0 border-b border-gray-200/80 pb-3 dark:border-gray-800">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <EditorFileMenu onCreated={onCreated} />
          <div className="min-w-0">
            <p className="truncate text-base font-bold tracking-tight text-gray-900 dark:text-white">
              {title}
            </p>
          </div>
        </div>

        {artifact ? (
          <div className="flex shrink-0 items-center gap-2">
            {isWebPage ? (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-blue-600 dark:hover:bg-blue-500"
                disabled={serving}
                onClick={() => void serveLive()}
              >
                {serving
                  ? t("documentsPanel.serving")
                  : t("documentsPanel.serveLive")}
              </button>
            ) : null}
            {onTogglePreview ? (
              <button
                type="button"
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                aria-pressed={previewOpen === true}
                onClick={onTogglePreview}
              >
                {previewOpen
                  ? t("documentsPanel.previewHide")
                  : t("documentsPanel.preview")}
              </button>
            ) : (
              <button
                type="button"
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-brand-700 active:scale-[0.98] dark:bg-blue-600 dark:hover:bg-blue-500"
                disabled={opening}
                onClick={() => void openExternally()}
              >
                {opening
                  ? t("documentsPanel.opening")
                  : t("documentsPanel.openExternally")}
              </button>
            )}
            <button
              type="button"
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              disabled={exporting}
              onClick={() => void exportPdf()}
            >
              {exporting
                ? t("documentsPanel.exporting")
                : t("documentsPanel.exportPdf")}
            </button>
          </div>
        ) : null}
      </div>
      {liveUrl ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded bg-success-soft px-3 py-1.5 text-xs text-success-ink">
          <span className="min-w-0 truncate">
            <a
              href={liveUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline"
            >
              {liveUrl}
            </a>
            <span className="ml-2 opacity-80">
              {t("documentsPanel.serveLiveScope")}
            </span>
          </span>
          <button
            type="button"
            className="shrink-0 text-[0.625rem] font-bold uppercase tracking-wide text-success-ink underline"
            onClick={() => {
              void navigator.clipboard.writeText(liveUrl);
              setCopied(true);
            }}
          >
            {copied ? t("documentsPanel.linkCopied") : t("documentsPanel.copyLink")}
          </button>
        </div>
      ) : null}
      {notice && !liveUrl ? (
        <p className="mt-1.5 truncate text-xs text-gray-500 dark:text-gray-400">{notice}</p>
      ) : null}
    </div>
  );
}
