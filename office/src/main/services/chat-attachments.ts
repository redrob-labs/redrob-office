import { createHash, randomUUID } from "node:crypto";
import { basename, extname, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { BrowserWindow, dialog } from "electron";
import { decodeSourceFile, isIntakeExtension } from "@redrob/extract";

export interface ChatAttachment {
  id: string;
  name: string;
  text: string;
  truncated: boolean;
  charCount: number;
  /**
   * A picture, kept on disk for the model to look at. Text is empty for these:
   * there is nothing to decode, and the point of attaching one is that it is
   * seen rather than read.
   */
  image?: { path: string; mime: string };
}

const MAX_FILES = 5;
const MAX_CHARS_PER_FILE = 24_000;
const MAX_TOTAL_CHARS = 64_000;
/** Big enough for a full-screen screenshot, small enough to send as one. */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const IMAGE_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".bmp", "image/bmp"],
]);

/** Extra text types beyond intake (pdf/docx/txt/md/json). */
const EXTRA_TEXT_EXTENSIONS = new Set([
  ".csv",
  ".tsv",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".html",
  ".htm",
  ".css",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".swift",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".cs",
  ".sh",
  ".bash",
  ".zsh",
  ".sql",
  ".log",
  ".ini",
  ".cfg",
  ".conf",
  ".env",
  ".gitignore",
  ".dockerfile",
  ".markdown",
  ".rst",
  ".tex",
  ".r",
  ".php",
  ".vue",
  ".svelte",
]);

function attachmentId(path: string): string {
  return createHash("sha256").update(path).digest("hex").slice(0, 16);
}

function isChatTextExtension(extension: string): boolean {
  const ext = extension.toLowerCase();
  return isIntakeExtension(ext) || EXTRA_TEXT_EXTENSIONS.has(ext);
}

function imageTypeOf(name: string, declared?: string): string | null {
  const byExtension = IMAGE_TYPES.get(extname(name).toLowerCase());
  if (byExtension) return byExtension;
  // A screenshot off the clipboard arrives as "image.png" at best and as an
  // untitled blob at worst, so the type the browser gave it is the better
  // witness of what it actually is.
  if (declared && [...IMAGE_TYPES.values()].includes(declared)) return declared;
  return null;
}

async function decodeChatFile(path: string): Promise<string> {
  const ext = extname(path).toLowerCase();
  if (isIntakeExtension(ext)) {
    return decodeSourceFile(path);
  }
  if (EXTRA_TEXT_EXTENSIONS.has(ext) || ext === "") {
    return readFile(path, "utf8");
  }
  throw new Error(`Unsupported file type: ${ext || "unknown"}`);
}

/** Chars already spent across this batch, so one file cannot eat the budget. */
interface Budget {
  spent: number;
}

async function textAttachment(
  path: string,
  name: string,
  id: string,
  budget: Budget,
): Promise<ChatAttachment> {
  let raw = (await decodeChatFile(path)).replace(/\u0000/g, "");
  let truncated = false;
  if (raw.length > MAX_CHARS_PER_FILE) {
    raw = raw.slice(0, MAX_CHARS_PER_FILE);
    truncated = true;
  }
  if (budget.spent + raw.length > MAX_TOTAL_CHARS) {
    raw = raw.slice(0, Math.max(0, MAX_TOTAL_CHARS - budget.spent));
    truncated = true;
  }
  budget.spent += raw.length;
  return { id, name, text: raw, truncated, charCount: raw.length };
}

/**
 * Files that arrived without a path: dropped on the composer, or pasted.
 *
 * Electron 32 removed `File.path`, and a screenshot off the clipboard never had
 * one to begin with, so the bytes come across the bridge and are written down
 * here. A picture is kept, because it is what the model will be shown; anything
 * text-shaped is decoded and the staged copy is not worth keeping.
 */
export async function attachDroppedFiles(
  files: ReadonlyArray<{ name: string; type?: string; bytes: Uint8Array }>,
  userData: string,
): Promise<ChatAttachment[]> {
  const dir = join(userData, "attachments");
  await mkdir(dir, { recursive: true });
  const budget: Budget = { spent: 0 };
  const out: ChatAttachment[] = [];

  for (const file of files.slice(0, MAX_FILES)) {
    const name = basename(file.name || "attachment").trim() || "attachment";
    const mime = imageTypeOf(name, file.type);
    const ext = extname(name).toLowerCase();
    if (!mime && !isChatTextExtension(ext) && ext !== "") {
      throw new Error(`Unsupported file type for chat: ${name}`);
    }
    if (mime && file.bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`Image too large: ${name}`);
    }
    const id = randomUUID().slice(0, 16);
    const staged = join(dir, `${id}${ext || (mime === "image/png" ? ".png" : "")}`);
    await writeFile(staged, file.bytes);
    if (mime) {
      out.push({
        id,
        name,
        text: "",
        truncated: false,
        charCount: 0,
        image: { path: staged, mime },
      });
      continue;
    }
    out.push(await textAttachment(staged, name, id, budget));
    if (budget.spent >= MAX_TOTAL_CHARS) break;
  }

  return out;
}

export async function pickChatAttachments(
  sender?: Electron.WebContents,
): Promise<ChatAttachment[]> {
  const win =
    (sender ? BrowserWindow.fromWebContents(sender) : null) ??
    BrowserWindow.getFocusedWindow();
  const openOptions = {
    properties: ["openFile" as const, "multiSelections" as const],
    title: "Attach files to chat",
    filters: [
      {
        name: "Documents & text",
        extensions: [
          "txt",
          "md",
          "markdown",
          "json",
          "csv",
          "pdf",
          "docx",
          "ts",
          "tsx",
          "js",
          "jsx",
          "py",
          "yaml",
          "yml",
          "html",
          "css",
          "sql",
          "log",
        ],
      },
      { name: "PDF", extensions: ["pdf"] },
      { name: "Word", extensions: ["docx"] },
      // The picker used to refuse what a paste now accepts, so a screenshot
      // could be attached one way and not the other.
      { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] },
      { name: "All files", extensions: ["*"] },
    ],
  };
  await new Promise((resolve) => setImmediate(resolve));
  const result = win
    ? await dialog.showOpenDialog(win, openOptions)
    : await dialog.showOpenDialog(openOptions);
  if (result.canceled || result.filePaths.length === 0) return [];

  const selected = result.filePaths.slice(0, MAX_FILES);
  const out: ChatAttachment[] = [];
  const budget: Budget = { spent: 0 };

  for (const filePath of selected) {
    const name = basename(filePath);
    const ext = extname(filePath);
    const mime = imageTypeOf(name);
    if (mime) {
      // Already on disk and picked by hand, so it is read where it lies.
      out.push({
        id: attachmentId(filePath),
        name,
        text: "",
        truncated: false,
        charCount: 0,
        image: { path: filePath, mime },
      });
      continue;
    }
    if (!isChatTextExtension(ext) && ext !== "") {
      throw new Error(`Unsupported file type for chat: ${name}`);
    }
    out.push(
      await textAttachment(filePath, name, attachmentId(filePath), budget),
    );
    if (budget.spent >= MAX_TOTAL_CHARS) break;
  }

  return out;
}
