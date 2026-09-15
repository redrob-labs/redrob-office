import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile, copyFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { nowIso, nowMs } from "../../app-time.js";
import type { DocDiff, DocOp } from "../types.js";

export interface SnapshotEntry {
  id: string;
  path: string;
  at: string;
  label: string;
  opHash?: string;
  diff?: DocDiff;
  ops?: DocOp[];
}

export interface HistoryConfig {
  retentionMs: number;
}

const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export class DocHistoryStore {
  private root: string;
  private retentionMs: number;
  private stack: SnapshotEntry[] = [];

  constructor(userDataPath: string, retentionMs = DEFAULT_RETENTION_MS) {
    this.root = join(userDataPath, "doc-snapshots");
    this.retentionMs = retentionMs;
  }

  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await this.prune();
  }

  sessionDir(sessionId: string): string {
    return join(this.root, sessionId);
  }

  async beginSession(sessionId: string, sourcePath: string): Promise<SnapshotEntry> {
    const dir = this.sessionDir(sessionId);
    await mkdir(dir, { recursive: true });
    const id = `origin-${randomUUID().slice(0, 8)}`;
    const dest = join(dir, `${id}${extOf(sourcePath)}`);
    await copyFile(sourcePath, dest);
    const entry: SnapshotEntry = {
      id,
      path: dest,
      at: nowIso(),
      label: "origin",
    };
    this.stack = [entry];
    await writeFile(join(dir, "stack.json"), JSON.stringify(this.stack, null, 2), "utf8");
    return entry;
  }

  async pushOpSnapshot(
    sessionId: string,
    sourcePath: string,
    meta: { label: string; opHash: string; diff: DocDiff; ops: DocOp[] },
  ): Promise<SnapshotEntry> {
    const dir = this.sessionDir(sessionId);
    await mkdir(dir, { recursive: true });
    const id = `op-${randomUUID().slice(0, 8)}-${this.stack.length}`;
    const dest = join(dir, `${id}${extOf(sourcePath)}`);
    await copyFile(sourcePath, dest);
    const entry: SnapshotEntry = {
      id,
      path: dest,
      at: nowIso(),
      label: meta.label,
      opHash: meta.opHash,
      diff: meta.diff,
      ops: meta.ops,
    };
    this.stack.push(entry);
    await writeFile(join(dir, "stack.json"), JSON.stringify(this.stack, null, 2), "utf8");
    return entry;
  }

  async undo(sessionId: string, targetPath: string): Promise<SnapshotEntry | null> {
    const dir = this.sessionDir(sessionId);
    await this.loadStack(sessionId);
    if (this.stack.length <= 1) return null;
    this.stack.pop();
    const prev = this.stack[this.stack.length - 1];
    if (!prev) return null;
    await copyFile(prev.path, targetPath);
    await writeFile(join(dir, "stack.json"), JSON.stringify(this.stack, null, 2), "utf8");
    return prev;
  }

  async restore(sessionId: string, snapshotId: string, targetPath: string): Promise<SnapshotEntry> {
    await this.loadStack(sessionId);
    const idx = this.stack.findIndex((s) => s.id === snapshotId);
    if (idx < 0) throw new Error(`Snapshot not found: ${snapshotId}`);
    const entry = this.stack[idx]!;
    await copyFile(entry.path, targetPath);
    this.stack = this.stack.slice(0, idx + 1);
    await writeFile(
      join(this.sessionDir(sessionId), "stack.json"),
      JSON.stringify(this.stack, null, 2),
      "utf8",
    );
    return entry;
  }

  list(sessionId: string): SnapshotEntry[] {
    return [...this.stack];
  }

  async endSession(sessionId: string): Promise<void> {
    const dir = this.sessionDir(sessionId);
    await rm(dir, { recursive: true, force: true });
    this.stack = [];
  }

  async prune(): Promise<void> {
    const entries = await readdir(this.root, { withFileTypes: true }).catch(() => []);
    const cutoff = nowMs() - this.retentionMs;
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const stackPath = join(this.root, ent.name, "stack.json");
      try {
        const raw = await readFile(stackPath, "utf8");
        const stack = JSON.parse(raw) as SnapshotEntry[];
        const latest = stack[stack.length - 1]?.at;
        if (latest && Date.parse(latest) < cutoff) {
          await rm(join(this.root, ent.name), { recursive: true, force: true });
        }
      } catch {
        // ignore
      }
    }
  }

  private async loadStack(sessionId: string): Promise<void> {
    try {
      const raw = await readFile(join(this.sessionDir(sessionId), "stack.json"), "utf8");
      this.stack = JSON.parse(raw) as SnapshotEntry[];
    } catch {
      this.stack = [];
    }
  }
}

function extOf(p: string): string {
  const m = /\.[a-z0-9]+$/i.exec(p);
  return m?.[0] ?? "";
}

export async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // ignore
  }
}
