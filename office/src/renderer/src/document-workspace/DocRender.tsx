import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import { useI18n } from "@redrob/ui";
import type { DocRenderModel } from "../../../shared/office-api";
import { XLSX_STYLE, xlsxHtmlBody } from "../../../shared/docview/xlsx-html";
import { PPTX_STYLE, pptxHtmlBody } from "../../../shared/docview/pptx-html";
import { HWP_STYLE, hwpHtmlBody } from "../../../shared/docview/hwp-html";
import { MarkdownBody } from "../MarkdownBody";
import { Spinner } from "../Spinner";

/**
 * Draws a document the app understands without an office suite: markdown as
 * itself, a spreadsheet as its grid and charts, a deck as its slides, and Word
 * through docx-preview. The very same drawing the PDF export prints.
 */
export function DocRender({
  path,
  /** Bumped when the file on disk changes, to read and draw it again. */
  reloadToken,
}: {
  path: string;
  reloadToken: number;
}): JSX.Element {
  const { t } = useI18n();
  const [model, setModel] = useState<DocRenderModel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    void window.office
      .docRenderModel(path)
      .then((next) => {
        if (!cancelled) setModel(next);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, reloadToken]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/50">
      {error ? (
        <p
          className="m-3 rounded-lg border border-destructive-muted bg-destructive-soft p-3 text-xs text-destructive-ink"
          role="alert"
        >
          {t("documentsPanel.previewFailed", { error })}
        </p>
      ) : null}
      {busy && !model ? (
        <p className="flex items-center gap-1.5 p-4 text-xs text-gray-500 dark:text-gray-400">
          <Spinner className="h-3 w-3 text-gray-400" />
          {t("documentsPanel.previewBuilding")}
        </p>
      ) : null}
      {model ? <ModelView model={model} /> : null}
    </div>
  );
}

function ModelView({ model }: { model: DocRenderModel }): JSX.Element {
  if (model.kind === "md") {
    return (
      <div className="min-h-0 flex-1 overflow-auto bg-card p-6">
        <MarkdownBody source={model.text} className="markdown-body max-w-3xl text-sm" />
      </div>
    );
  }
  if (model.kind === "html") {
    return <LiveHtmlView html={model.html} />;
  }
  if (model.kind === "docx") {
    return <DocxView base64={model.base64} />;
  }
  if (model.kind === "xlsx") {
    return <HtmlView style={XLSX_STYLE} body={xlsxHtmlBody(model.sheets)} />;
  }
  if (model.kind === "pptx") {
    return <HtmlView style={PPTX_STYLE} body={pptxHtmlBody(model.slides)} />;
  }
  if (model.kind === "hwp") {
    return (
      <HtmlView
        style={(model.fontCss ?? "") + HWP_STYLE}
        body={hwpHtmlBody(model.pages)}
      />
    );
  }
  return (
    <p className="p-4 text-xs text-gray-500 dark:text-gray-400">
      This file can’t be shown here ({model.reason}).
    </p>
  );
}

/**
 * A generated web page, shown as the page it is.
 *
 * The frame gets `allow-scripts` but not `allow-same-origin`, so it runs on an
 * opaque origin: a deck's arrow keys and slide counter work, while the page
 * cannot reach this window, the app's storage, or the person's files. It fills
 * the panel so a slide sized in `vh` is laid out the way it was meant to be.
 */
function LiveHtmlView({ html }: { html: string }): JSX.Element {
  const { t } = useI18n();
  return (
    <iframe
      title={t("workbench.htmlPreview")}
      className="min-h-0 w-full flex-1 border-0 bg-white"
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={html}
    />
  );
}

/**
 * The app's own drawing, inline. The classes are namespaced (.doc-xlsx,
 * .doc-pptx), so the scoped style block does not leak into the rest of the app,
 * and there is no frame to fall foul of the page's content policy.
 */
function HtmlView({ style, body }: { style: string; body: string }): JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-card p-6">
      <style>{style}</style>
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </div>
  );
}

function DocxView({ base64 }: { base64: string }): JSX.Element {
  const host = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    el.innerHTML = "";
    const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    void renderAsync(new Blob([bytes]), el, undefined, {
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
    }).catch(() => {
      if (!cancelled && el) el.textContent = "";
    });
    return () => {
      cancelled = true;
    };
  }, [base64]);
  return (
    <div
      ref={host}
      className="min-h-0 flex-1 overflow-auto bg-gray-200 p-4 [&_.docx-wrapper]:!bg-transparent [&_.docx-wrapper]:!p-0 [&_section.docx]:!mx-auto [&_section.docx]:!mb-4 [&_section.docx]:!shadow"
    />
  );
}
