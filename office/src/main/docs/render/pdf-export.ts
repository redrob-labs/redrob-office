/**
 * Turn a document into a PDF with Electron's own printer instead of an office
 * suite. The same drawing the preview shows is loaded into a window nobody
 * sees and printed to paper. Word is laid out by docx-preview in that window;
 * the rest is the app's own HTML.
 */
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { BrowserWindow } from "electron";
import type { DocRenderModel } from "../../../shared/doc-render.js";
import { wrapPage } from "../../../shared/docview/page.js";
import { buildRenderModel } from "./model.js";
import { modelStyleAndBody } from "./page-html.js";

const require = createRequire(import.meta.url);

function resolveUmd(): { jszip: string; docx: string } | null {
  // Both ship a browser UMD build. docx-preview's exports map only exposes the
  // entry, so resolve that and reach the UMD sitting beside it. The docx UMD
  // looks up a global JSZip, so its bundle has to load first.
  try {
    const docxEntry = require.resolve("docx-preview");
    const docx = join(dirname(docxEntry), "docx-preview.min.js");
    const jszip = require.resolve("jszip/dist/jszip.min.js");
    return { jszip, docx };
  } catch {
    return null;
  }
}

async function docxPage(base64: string): Promise<string> {
  const umd = resolveUmd();
  if (!umd) throw new Error("docx-preview missing");
  const { readFile } = await import("node:fs/promises");
  const [jszip, docx] = await Promise.all([
    readFile(umd.jszip, "utf8"),
    readFile(umd.docx, "utf8"),
  ]);
  // The library draws into #c; __done resolves once the page is laid out, and
  // the printer waits on it before it takes the shot.
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
html,body{margin:0;padding:0;background:#fff}
.docx-wrapper{background:#fff!important;padding:0!important}
.docx-wrapper>section.docx{box-shadow:none!important;border:0!important;margin:0!important;width:auto!important;min-height:0!important;padding:0!important}
</style>
</head><body><div id="c"></div>
<script>${jszip}</script>
<script>${docx}</script>
<script>
const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), function(ch){return ch.charCodeAt(0);});
// Let the paper set the width; the document's own page box would otherwise
// float a small card on a grey field.
window.__done = docx.renderAsync(new Blob([bytes]), document.getElementById('c'), null, { inWrapper: true, ignoreWidth: true, ignoreHeight: true });
</script></body></html>`;
}

async function pageFor(
  model: DocRenderModel,
): Promise<{ html: string; landscape: boolean; waitDone: boolean } | null> {
  if (model.kind === "docx") {
    return { html: await docxPage(model.base64), landscape: false, waitDone: true };
  }
  // A web page prints as itself: it already carries its own style, and wrapping
  // it in the app's page shell would fight it.
  if (model.kind === "html") {
    return { html: model.html, landscape: false, waitDone: false };
  }
  const parts = modelStyleAndBody(model);
  if (!parts) return null;
  return {
    html: wrapPage(parts.style, parts.body),
    landscape: model.kind === "pptx",
    waitDone: false,
  };
}

export async function renderDocumentToPdf(
  sourcePath: string,
  targetPath: string,
): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  const model = await buildRenderModel(sourcePath);
  if (model.kind === "unsupported") {
    return { ok: false, reason: `ERR_UNSUPPORTED_FORMAT: ${model.reason}` };
  }
  const workDir = await mkdtemp(join(tmpdir(), "redrob-pdf-"));
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: false, sandbox: false, javascript: true },
  });
  try {
    const page = await pageFor(model);
    if (!page) return { ok: false, reason: "ERR_UNSUPPORTED_FORMAT" };
    const htmlPath = join(workDir, "page.html");
    await writeFile(htmlPath, page.html, "utf8");
    await win.loadFile(htmlPath);
    if (page.waitDone) {
      await win.webContents.executeJavaScript(
        "window.__done.then(function(){return true;})",
      );
    }
    // One frame so fonts and SVGs settle before the shot.
    await new Promise((resolve) => setTimeout(resolve, 60));
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      landscape: page.landscape,
      margins: { marginType: "default" },
    });
    await writeFile(targetPath, pdf);
    return { ok: true, path: targetPath };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    win.destroy();
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
