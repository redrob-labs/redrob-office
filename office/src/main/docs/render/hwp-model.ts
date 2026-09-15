/**
 * Reads a Hangul word-processor file (HWP or HWPX) and lays it out into one SVG
 * per page, using the @rhwp/core WebAssembly parser. This is the office-suite
 * free path for Korean documents: the same SVG pages feed the in-app preview
 * and the Electron PDF export, so nothing outside the app draws them.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

interface HwpDocumentInstance {
  pageCount(): number;
  renderPageSvg(page: number): string;
  free(): void;
}

interface RhwpModule {
  default: (init: { module_or_path: Uint8Array }) => Promise<unknown>;
  HwpDocument: new (data: Uint8Array) => HwpDocumentInstance;
}

// The WASM keeps global state once initialised, so the module is loaded once
// and reused for every document.
let ready: Promise<RhwpModule> | null = null;

async function loadRhwp(): Promise<RhwpModule> {
  ready ??= (async () => {
    const mod = (await import("@rhwp/core")) as unknown as RhwpModule;
    const wasm = await readFile(require.resolve("@rhwp/core/rhwp_bg.wasm"));
    await mod.default({ module_or_path: wasm });
    return mod;
  })();
  return ready;
}

/** One SVG string per page, laid out by the parser. */
export async function readHwpPages(path: string): Promise<string[]> {
  const mod = await loadRhwp();
  const data = new Uint8Array(await readFile(path));
  const doc = new mod.HwpDocument(data);
  try {
    const count = doc.pageCount();
    const pages: string[] = [];
    for (let i = 0; i < count; i += 1) pages.push(doc.renderPageSvg(i));
    return pages;
  } finally {
    doc.free();
  }
}
