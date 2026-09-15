import type { BrowserWindow } from "electron";
import { watch, type FSWatcher } from "node:fs";
import type { DocFormat } from "../docs/types.js";

/**
 * Keeps the Documents tab in sync with the file on disk. Word, Excel, and
 * PowerPoint files are changed by the agent's document tools, and those writes
 * land here so the open preview refreshes.
 */

let reloadTargets: Set<BrowserWindow> = new Set();

export function registerDocUiWindow(win: BrowserWindow): void {
  reloadTargets.add(win);
  win.on("closed", () => {
    reloadTargets.delete(win);
  });
}

export function broadcastDocReloaded(payload: {
  path: string;
  sessionId?: string;
  format?: DocFormat;
}): void {
  for (const win of reloadTargets) {
    if (win.isDestroyed()) continue;
    win.webContents.send("office:docReloaded", payload);
  }
}

/** Called after tool commits so the open preview refreshes. */
export function notifyDocPathChanged(path: string, sessionId?: string): void {
  broadcastDocReloaded({ path, ...(sessionId ? { sessionId } : {}) });
}

type Watched = { watcher: FSWatcher; timer: NodeJS.Timeout | null; refs: number };

const watched = new Map<string, Watched>();

/** A tool may rewrite the file several times per save; coalesce the burst. */
const WRITE_SETTLE_MS = 400;

export function watchDocument(path: string): void {
  const existing = watched.get(path);
  if (existing) {
    existing.refs += 1;
    return;
  }
  let entry: Watched;
  try {
    const watcher = watch(path, () => {
      const current = watched.get(path);
      if (!current) return;
      if (current.timer) clearTimeout(current.timer);
      current.timer = setTimeout(() => {
        current.timer = null;
        broadcastDocReloaded({ path });
      }, WRITE_SETTLE_MS);
    });
    watcher.on("error", () => {
      unwatchDocument(path, true);
    });
    entry = { watcher, timer: null, refs: 1 };
  } catch {
    // Watching is a convenience; the renderer also refreshes on window focus.
    return;
  }
  watched.set(path, entry);
}

export function unwatchDocument(path: string, force = false): void {
  const entry = watched.get(path);
  if (!entry) return;
  entry.refs -= 1;
  if (!force && entry.refs > 0) return;
  if (entry.timer) clearTimeout(entry.timer);
  entry.watcher.close();
  watched.delete(path);
}
