import { randomUUID } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  type Dirent,
  type Stats,
} from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative as relative_,
  resolve,
  sep,
} from "node:path";
import ExcelJS from "exceljs";
import { defaultArtifactsDir } from "@redrob/kernel";
import { nowIso } from "../app-time.js";

export type ArtifactKind = "jd" | "email" | "report" | "rubric" | "other";
export type ArtifactEncoding = "utf8" | "binary";

export interface ArtifactMeta {
  id: string;
  kind: ArtifactKind;
  title: string;
  categoryId?: string;
  createdAt: string;
  source?: "model" | "template";
  /** Relative filename under the artifact folder */
  contentFile: string;
  encoding: ArtifactEncoding;
  mimeType?: string;
}

export interface ArtifactView extends ArtifactMeta {
  /** UTF-8 text body; empty string when encoding is binary. */
  body: string;
  /** Absolute path to the content file on disk. */
  absolutePath: string;
  /** File mtime captured when the body was read; used for optimistic saves. */
  revision: string;
}

export class ArtifactConflictError extends Error {
  readonly code = "artifact_conflict";

  constructor() {
    super("This document changed since you opened it. Reload it before saving.");
    this.name = "ArtifactConflictError";
  }
}

export interface SaveArtifactInput {
  kind: ArtifactKind;
  title: string;
  /** UTF-8 text body (required when bytes/sourcePath are omitted). */
  body?: string;
  /** Binary payload; implies encoding binary. */
  bytes?: Uint8Array;
  /** Copy an existing file into the artifact folder. */
  sourcePath?: string;
  categoryId?: string;
  source?: "model" | "template";
  contentFile?: string;
  mimeType?: string;
  encoding?: ArtifactEncoding;
}

let artifactsRoot: string | null = null;

/**
 * Documents live in the redrob folder, beside the models, rather than under
 * the app's own settings directory. Anything saved at the old address is moved
 * across on the way past, once, so nobody has to go looking for their work.
 *
 * `root` exists so a caller that is not the app — a test or a bench harness —
 * can say where documents go. Without it the second argument was silently the
 * real folder, and `pnpm test` left blank documents on the developer's shelf.
 */
export function configureArtifacts(userDataPath: string, root?: string): string {
  artifactsRoot = root ?? defaultArtifactsDir();
  mkdirSync(artifactsRoot, { recursive: true });
  adoptLegacyArtifacts(join(userDataPath, "artifacts"), artifactsRoot);
  return artifactsRoot;
}

function adoptLegacyArtifacts(from: string, to: string): void {
  if (from === to || !existsSync(from)) return;
  let moved = 0;
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const target = join(to, entry.name);
    if (existsSync(target)) continue;
    try {
      renameSync(join(from, entry.name), target);
      moved += 1;
    } catch {
      // A document that will not move is left where it is rather than lost.
    }
  }
  if (moved > 0) {
    // eslint-disable-next-line no-console
    console.log(`[artifacts] moved ${moved} document(s) to ${to}`);
  }
}

function rootDir(): string {
  if (!artifactsRoot) throw new Error("Artifacts directory is not configured.");
  return artifactsRoot;
}

function artifactDir(id: string): string {
  return join(rootDir(), id);
}

function metaPath(id: string): string {
  return join(artifactDir(id), "meta.json");
}

function guessMime(
  contentFile: string,
  encoding: ArtifactEncoding,
): string | undefined {
  const ext = extname(contentFile).toLowerCase();
  switch (ext) {
    case ".md":
      return "text/markdown; charset=utf-8";
    case ".html":
    case ".htm":
      return "text/html; charset=utf-8";
    case ".svg":
      return "image/svg+xml; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".hwpx":
      return "application/hwp+zip";
    case ".hwp":
      return "application/x-hwp";
    default:
      return encoding === "binary"
        ? "application/octet-stream"
        : "text/plain; charset=utf-8";
  }
}

function normalizeMeta(parsed: ArtifactMeta): ArtifactMeta | null {
  if (!parsed?.id || !parsed.kind || !parsed.title || !parsed.contentFile)
    return null;
  return {
    ...parsed,
    encoding: parsed.encoding === "binary" ? "binary" : "utf8",
  };
}

export async function saveArtifact(
  input: SaveArtifactInput,
): Promise<ArtifactView> {
  const id = randomUUID();
  const dir = artifactDir(id);
  await mkdir(dir, { recursive: true });

  const hasBytes = input.bytes !== undefined;
  const hasSource = Boolean(input.sourcePath?.trim());
  const hasBody = input.body !== undefined;

  if (!hasBytes && !hasSource && !hasBody) {
    throw new Error("saveArtifact requires body, bytes, or sourcePath.");
  }

  const encoding: ArtifactEncoding =
    input.encoding ?? (hasBytes || hasSource ? "binary" : "utf8");

  let contentFile = input.contentFile?.trim();
  if (!contentFile) {
    if (hasSource) contentFile = basename(input.sourcePath!);
    else contentFile = encoding === "binary" ? "content.bin" : "content.md";
  }

  const createdAt = nowIso();
  const mimeType = input.mimeType ?? guessMime(contentFile, encoding);
  const meta: ArtifactMeta = {
    id,
    kind: input.kind,
    title: input.title.trim() || "Untitled",
    createdAt,
    contentFile,
    encoding,
    ...(mimeType ? { mimeType } : {}),
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.source ? { source: input.source } : {}),
  };

  const absolutePath = join(dir, contentFile);
  if (hasSource) {
    await copyFile(input.sourcePath!, absolutePath);
  } else if (hasBytes) {
    await writeFile(absolutePath, input.bytes!);
  } else {
    await writeFile(absolutePath, input.body ?? "", "utf8");
  }

  await writeFile(metaPath(id), `${JSON.stringify(meta, null, 2)}\n`, "utf8");

  const body =
    encoding === "utf8"
      ? hasBody
        ? (input.body ?? "")
        : await readFile(absolutePath, "utf8")
      : "";

  const revision = String((await stat(absolutePath)).mtimeMs);
  return { ...meta, body, absolutePath, revision };
}

/**
 * A document that is just a file in the documents folder.
 *
 * The folder is the thing a person opens, so what is in it should be what they
 * see: a task that writes report.xlsx there has written a document, and asking
 * it to bury the file in a folder named after a uuid so the app can recognise
 * it is the app's problem, not theirs. These carry no meta file — everything
 * about them is in the name and the file itself.
 */
const LOOSE_PREFIX = "file:";

const DOCUMENT_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".html",
  ".htm",
  ".svg",
  ".json",
  ".csv",
  ".docx",
  ".xlsx",
  ".pptx",
  ".pdf",
  ".hwp",
  ".hwpx",
]);

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".html",
  ".htm",
  ".svg",
  ".json",
  ".csv",
]);

export function looseArtifactId(fileName: string): string {
  return `${LOOSE_PREFIX}${fileName}`;
}

function looseFileName(id: string): string | null {
  if (!id.startsWith(LOOSE_PREFIX)) return null;
  const name = id.slice(LOOSE_PREFIX.length);
  // A name with a path in it would reach out of the folder.
  if (!name || name !== basename(name)) return null;
  return name;
}

export function isDocumentFileName(name: string): boolean {
  if (!name || name.startsWith(".") || name.startsWith("~$")) return false;
  return DOCUMENT_EXTENSIONS.has(extname(name).toLowerCase());
}

async function looseMeta(name: string): Promise<ArtifactMeta | null> {
  if (!isDocumentFileName(name)) return null;
  let info: Stats;
  try {
    info = await stat(join(rootDir(), name));
  } catch {
    return null;
  }
  if (!info.isFile()) return null;
  const encoding: ArtifactEncoding = TEXT_EXTENSIONS.has(
    extname(name).toLowerCase(),
  )
    ? "utf8"
    : "binary";
  return {
    id: looseArtifactId(name),
    // A file dropped in the folder says nothing about what kind of thing it is,
    // and calling a web page a "Report" in the list is worse than saying little.
    kind: "other",
    title: basename(name, extname(name)),
    createdAt: info.birthtime.toISOString(),
    contentFile: name,
    encoding,
    ...(guessMime(name, encoding)
      ? { mimeType: guessMime(name, encoding)! }
      : {}),
  };
}

async function loadMeta(id: string): Promise<ArtifactMeta | null> {
  const loose = looseFileName(id);
  if (loose) return looseMeta(loose);
  try {
    const raw = await readFile(metaPath(id), "utf8");
    const parsed = JSON.parse(raw) as ArtifactMeta;
    return normalizeMeta(parsed);
  } catch {
    return null;
  }
}

/** Where an artifact's content sits, whether it is a folder or a loose file. */
function contentPathFor(id: string, contentFile: string): string {
  const loose = looseFileName(id);
  return loose ? join(rootDir(), loose) : join(artifactDir(id), contentFile);
}

export async function getArtifact(id: string): Promise<ArtifactView | null> {
  const meta = await loadMeta(id);
  if (!meta) return null;
  const absolutePath = contentPathFor(id, meta.contentFile);
  try {
    const revision = String((await stat(absolutePath)).mtimeMs);
    if (meta.encoding === "binary") {
      return { ...meta, body: "", absolutePath, revision };
    }
    const body = await readFile(absolutePath, "utf8");
    return { ...meta, body, absolutePath, revision };
  } catch {
    return null;
  }
}

/** Update UTF-8 artifact body in place (markdown / text editors). */
export async function updateArtifact(input: {
  id: string;
  body: string;
  title?: string;
  baseRevision?: string;
}): Promise<ArtifactView> {
  const meta = await loadMeta(input.id);
  if (!meta) throw new Error(`Artifact not found: ${input.id}`);
  if (meta.encoding !== "utf8") {
    throw new Error("Only utf8 artifacts can be updated via body");
  }
  const absolutePath = contentPathFor(input.id, meta.contentFile);
  if (input.baseRevision !== undefined) {
    const currentRevision = String((await stat(absolutePath)).mtimeMs);
    if (currentRevision !== input.baseRevision) {
      throw new ArtifactConflictError();
    }
  }
  await writeFile(absolutePath, input.body, "utf8");
  const next: ArtifactMeta = {
    ...meta,
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
  };
  // A loose file is named by its file name; there is no meta beside it to
  // disagree with, and renaming the document means renaming the file.
  if (!input.id.startsWith(LOOSE_PREFIX)) {
    await writeFile(
      metaPath(input.id),
      `${JSON.stringify(next, null, 2)}\n`,
      "utf8",
    );
  }
  const revision = String((await stat(absolutePath)).mtimeMs);
  return { ...next, body: input.body, absolutePath, revision };
}

/** Update only the cells the person changed, preserving formulas/styles elsewhere. */
export async function updateSpreadsheetArtifact(input: {
  id: string;
  sheet: string;
  changes: Array<{ row: number; column: number; value: string }>;
  baseRevision?: string;
}): Promise<ArtifactView> {
  const meta = await loadMeta(input.id);
  if (!meta) throw new Error(`Artifact not found: ${input.id}`);
  if (extname(meta.contentFile).toLowerCase() !== ".xlsx") {
    throw new Error("Only .xlsx artifacts can be edited as a grid");
  }
  const absolutePath = contentPathFor(input.id, meta.contentFile);
  if (input.baseRevision !== undefined) {
    const currentRevision = String((await stat(absolutePath)).mtimeMs);
    if (currentRevision !== input.baseRevision) {
      throw new ArtifactConflictError();
    }
  }
  if (input.changes.length > 10_000) {
    throw new Error("Too many spreadsheet cells in one save");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(absolutePath);
  const sheet = workbook.getWorksheet(input.sheet);
  if (!sheet) throw new Error(`Sheet not found: ${input.sheet}`);
  for (const change of input.changes) {
    if (
      !Number.isInteger(change.row) ||
      !Number.isInteger(change.column) ||
      change.row < 1 ||
      change.column < 1
    ) {
      throw new Error("Spreadsheet cell coordinates must be positive integers");
    }
    const trimmed = change.value.trim();
    sheet.getCell(change.row, change.column).value =
      trimmed !== "" && /^-?(?:\d+|\d*\.\d+)$/.test(trimmed)
        ? Number(trimmed)
        : change.value;
  }
  const bytes = await workbook.xlsx.writeBuffer();
  // Write via a sibling temp file then rename so a concurrent docRenderModel /
  // watcher read never observes a truncated zip mid-save.
  const tmp = join(
    dirname(absolutePath),
    `.${basename(absolutePath)}.tmp-${randomUUID().slice(0, 8)}.xlsx`,
  );
  await writeFile(tmp, new Uint8Array(bytes));
  await rename(tmp, absolutePath);
  const next = await getArtifact(input.id);
  if (!next) throw new Error(`Artifact disappeared after save: ${input.id}`);
  return next;
}

export async function listArtifacts(
  kind?: ArtifactKind,
): Promise<ArtifactMeta[]> {
  let entries: Dirent[] = [];
  try {
    entries = await readdir(rootDir(), { withFileTypes: true });
  } catch {
    return [];
  }
  const items: ArtifactMeta[] = [];
  for (const entry of entries) {
    const meta = entry.isDirectory()
      ? await loadMeta(entry.name)
      : await looseMeta(entry.name);
    if (!meta) continue;
    if (kind && meta.kind !== kind) continue;
    items.push(meta);
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteArtifact(id: string): Promise<boolean> {
  const meta = await loadMeta(id);
  if (!meta) return false;
  const loose = looseFileName(id);
  await rm(loose ? join(rootDir(), loose) : artifactDir(id), {
    recursive: true,
    force: true,
  });
  return true;
}

/** Delete every artifact under the artifacts root. Returns how many folders removed. */
export async function wipeAllArtifacts(): Promise<number> {
  let entries: string[] = [];
  try {
    entries = await readdir(rootDir());
  } catch {
    return 0;
  }
  let removed = 0;
  for (const id of entries) {
    try {
      await rm(join(rootDir(), id), { recursive: true, force: true });
      removed += 1;
    } catch {
      // continue
    }
  }
  return removed;
}

export function artifactsDirPath(): string {
  return rootDir();
}

/**
 * The document a path belongs to, when it is one of ours.
 *
 * A task now works inside the documents folder, so the file it hands back is
 * often the document itself. Recognising that is what stops a delivery from
 * becoming a second copy of it.
 */
export function artifactIdForPath(path: string): string | null {
  if (!artifactsRoot) return null;
  const relative = relative_(artifactsRoot, resolve(path));
  if (!relative || relative.startsWith("..") || isAbsolute(relative)) {
    return null;
  }
  const head = relative.split(sep)[0];
  if (!head) return null;
  // A file sitting in the folder is a document in its own right.
  if (head === relative) {
    return isDocumentFileName(head) && existsSync(join(artifactsRoot, head))
      ? looseArtifactId(head)
      : null;
  }
  if (!existsSync(join(artifactsRoot, head, "meta.json"))) return null;
  return head;
}

export function artifactContentPath(id: string, contentFile: string): string {
  return contentPathFor(id, contentFile);
}

/** Stream helper for future export/upload paths. */
export function openArtifactStream(
  id: string,
  contentFile: string,
): ReturnType<typeof createReadStream> {
  return createReadStream(join(artifactDir(id), contentFile));
}
