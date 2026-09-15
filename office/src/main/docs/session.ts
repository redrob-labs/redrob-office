import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { DocxAdapter } from "./adapters/docx-adapter.js";
import { PptxAdapter } from "./adapters/pptx-adapter.js";
import { XlsxAdapter, ensureSheet } from "./adapters/xlsx-adapter.js";
import { DocHistoryStore } from "./history/snapshot-store.js";
import { wrapExternalUntrustedContent } from "../security/untrusted.js";
import type { DocumentAdapter, DocDiff, DocFormat, DocOp } from "./types.js";

export interface DocSession {
  id: string;
  format: DocFormat;
  path: string;
  adapter: DocumentAdapter;
  history: DocHistoryStore;
  /** Set once a write actually lands, so closing can say when none did. */
  wrote?: boolean;
}

const sessions = new Map<string, DocSession>();
let historyFactory: (() => DocHistoryStore) | null = null;
let retentionMs = 7 * 24 * 60 * 60 * 1000;

export function configureDocSessions(userDataPath: string, retention?: number): void {
  if (retention != null) retentionMs = retention;
  historyFactory = () => new DocHistoryStore(userDataPath, retentionMs);
}

function detectFormat(path: string): DocFormat {
  const ext = extname(path).toLowerCase();
  if (ext === ".xlsx") return "xlsx";
  if (ext === ".docx") return "docx";
  if (ext === ".pptx") return "pptx";
  throw new Error(`Unsupported document format: ${ext}`);
}

function createAdapter(format: DocFormat): DocumentAdapter {
  if (format === "xlsx") return new XlsxAdapter();
  if (format === "docx") return new DocxAdapter();
  return new PptxAdapter();
}

export async function openDocSession(
  path: string,
  userDataPath: string,
): Promise<DocSession> {
  const format = detectFormat(path);
  const adapter = createAdapter(format);
  await adapter.open(path);
  const id = randomUUID();
  const history = historyFactory?.() ?? new DocHistoryStore(userDataPath, retentionMs);
  await history.init();
  await history.beginSession(id, path);
  const session: DocSession = { id, format, path, adapter, history };
  sessions.set(id, session);
  return session;
}

export function getDocSession(id: string): DocSession {
  const s = sessions.get(id);
  if (!s) throw new Error(`Document session not found: ${id}`);
  return s;
}

export async function closeDocSession(id: string, keepSnapshots = false): Promise<void> {
  const s = sessions.get(id);
  if (!s) return;
  await s.adapter.close();
  if (!keepSnapshots) await s.history.endSession(id);
  sessions.delete(id);
}

/**
 * Transactional apply: snapshot already taken at open;
 * preview → (caller approves) → apply → save → push undo snapshot.
 * On failure, restore origin/last snapshot.
 */
export async function commitDocOps(
  sessionId: string,
  tool: string,
  ops: DocOp[],
  opts: { dryRun: boolean; expectedHash?: string },
): Promise<{ diff: DocDiff; opHash: string; applied: boolean }> {
  const session = getDocSession(sessionId);
  const preview = await session.adapter.previewOps(ops);
  if (opts.expectedHash && opts.expectedHash !== preview.opHash) {
    throw new Error("Document op hash mismatch — approval plan drifted");
  }
  if (opts.dryRun) {
    return { diff: preview.diff, opHash: preview.opHash, applied: false };
  }

  try {
    const applied = await session.adapter.applyOps(ops);
    if (applied.opHash !== preview.opHash) {
      throw new Error("Op hash changed between preview and apply");
    }
    await session.adapter.save();
    session.wrote = true;
    await session.history.pushOpSnapshot(sessionId, session.path, {
      label: tool,
      opHash: applied.opHash,
      diff: applied.diff,
      ops,
    });
    try {
      const { notifyDocPathChanged } = await import("../services/doc-ui.js");
      notifyDocPathChanged(session.path, sessionId);
    } catch {
      // UI bridge optional during tests
    }
    return { diff: applied.diff, opHash: applied.opHash, applied: true };
  } catch (err) {
    // Roll back to last good snapshot
    const stack = session.history.list(sessionId);
    const last = stack[stack.length - 1];
    if (last) {
      await session.history.restore(sessionId, last.id, session.path);
      await session.adapter.close();
      await session.adapter.open(session.path);
    }
    throw err;
  }
}

export async function undoDocSession(sessionId: string): Promise<DocDiff | null> {
  const session = getDocSession(sessionId);
  const prev = await session.history.undo(sessionId, session.path);
  if (!prev) return null;
  await session.adapter.close();
  await session.adapter.open(session.path);
  return prev.diff ?? null;
}

export function wrapDocRead(source: string, payload: unknown): string {
  return wrapExternalUntrustedContent(source, JSON.stringify(payload));
}

export { ensureSheet };
