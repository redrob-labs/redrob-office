import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { ArtifactView } from "../../shared/office-api.js";
import { saveArtifact } from "./artifacts.js";

/**
 * Bridges outside files into the artifact store. The app draws Markdown, Word,
 * Excel, PowerPoint, and Hangul (HWP/HWPX) files itself, so every format it can
 * show comes in as-is — there is no office suite in the loop to convert or
 * render anything.
 */

/**
 * Formats the Documents tab opens directly. Hangul files are laid out by the
 * @rhwp/core parser, so they no longer need an office suite on the way in.
 */
const NATIVE_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".docx",
  ".xlsx",
  ".pptx",
  ".hwp",
  ".hwpx",
]);

export function importableExtensions(): string[] {
  return [...NATIVE_EXTENSIONS].map((ext) => ext.slice(1));
}

function titleFor(filePath: string): string {
  return basename(filePath, extname(filePath)) || "Untitled";
}

/**
 * Copy a file into the artifact store. Every format the tab can show is stored
 * as-is; anything else is refused rather than converted. Returns null only when
 * the user picked nothing.
 */
export async function importDocumentFile(filePath: string): Promise<ArtifactView> {
  const ext = extname(filePath).toLowerCase();
  const title = titleFor(filePath);

  if (!NATIVE_EXTENSIONS.has(ext)) {
    throw new Error(`ERR_UNSUPPORTED_FORMAT: ${ext || basename(filePath)}`);
  }

  if (ext === ".md" || ext === ".markdown" || ext === ".txt") {
    const body = await readFile(filePath, "utf8");
    return saveArtifact({
      title,
      kind: "other",
      source: "template",
      body,
      contentFile: `${title}.md`,
      encoding: "utf8",
    });
  }
  return saveArtifact({
    title,
    kind: "other",
    source: "template",
    sourcePath: filePath,
    contentFile: `${title}${ext}`,
    encoding: "binary",
  });
}

/** Duplicate an artifact so the original stays untouched. */
export async function duplicateArtifactFile(
  artifact: { title: string; absolutePath: string; contentFile: string; encoding: string },
  copySuffix: string,
): Promise<ArtifactView> {
  const ext = extname(artifact.contentFile);
  const title = `${artifact.title} ${copySuffix}`.trim();
  if (artifact.encoding === "utf8") {
    return saveArtifact({
      title,
      kind: "other",
      source: "template",
      body: await readFile(artifact.absolutePath, "utf8"),
      contentFile: `${title}${ext || ".md"}`,
      encoding: "utf8",
    });
  }
  return saveArtifact({
    title,
    kind: "other",
    source: "template",
    sourcePath: artifact.absolutePath,
    contentFile: `${title}${ext}`,
    encoding: "binary",
  });
}
