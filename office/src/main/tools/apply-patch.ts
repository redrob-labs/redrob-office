import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { nowIso } from "../app-time.js";
import { assertAllowedPath } from "./path-policy.js";
import type { RegisteredTool, ToolResult } from "./types.js";

interface PatchSnapshot {
  id: string;
  path: string;
  previous: string | null;
  at: string;
}

const snapshots = new Map<string, PatchSnapshot>();
let snapshotSeq = 0;

/**
 * Minimal unified-diff applier for single-file patches produced by models.
 * Supports ---/+++ headers and @@ hunks with ' ', '+', '-' lines.
 */
export function applyUnifiedDiff(original: string, diff: string): string {
  const lines = original.split("\n");
  const diffLines = diff.replace(/\r\n/g, "\n").split("\n");
  let out = [...lines];
  let i = 0;

  while (i < diffLines.length) {
    const line = diffLines[i] ?? "";
    if (!line.startsWith("@@")) {
      i += 1;
      continue;
    }
    const m = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(line);
    if (!m) {
      i += 1;
      continue;
    }
    let oldLine = Number(m[1]) - 1;
    i += 1;
    const remove: string[] = [];
    const add: string[] = [];
    while (i < diffLines.length) {
      const row = diffLines[i] ?? "";
      if (row.startsWith("@@") || row.startsWith("diff ") || row.startsWith("---") || row.startsWith("+++")) {
        break;
      }
      if (row.startsWith("\\")) {
        i += 1;
        continue;
      }
      const tag = row[0];
      const body = row.slice(1);
      if (tag === " " || tag === undefined) {
        // context — verify loosely then advance
        remove.push(body);
        add.push(body);
      } else if (tag === "-") {
        remove.push(body);
      } else if (tag === "+") {
        add.push(body);
      }
      i += 1;
    }

    // Find matching region near oldLine
    let start = Math.max(0, oldLine);
    const slice = out.slice(start, start + remove.length);
    const matches =
      remove.length === 0 ||
      slice.length === remove.length &&
        slice.every((v, idx) => v === remove[idx]);
    if (!matches) {
      // search nearby
      const window = 40;
      let found = -1;
      for (let s = Math.max(0, oldLine - window); s <= Math.min(out.length, oldLine + window); s += 1) {
        const cand = out.slice(s, s + remove.length);
        if (
          remove.length === 0 ||
          (cand.length === remove.length && cand.every((v, idx) => v === remove[idx]))
        ) {
          found = s;
          break;
        }
      }
      if (found < 0) {
        throw new Error(`Patch hunk failed to match near line ${oldLine + 1}`);
      }
      start = found;
    }

    out = [...out.slice(0, start), ...add, ...out.slice(start + remove.length)];
  }

  return out.join("\n");
}

function extractTargetPath(diff: string): string | null {
  const plus = /^\+\+\+\s+(?:b\/)?(.+)$/m.exec(diff);
  if (plus?.[1] && plus[1] !== "/dev/null") return plus[1].trim();
  const minus = /^---\s+(?:a\/)?(.+)$/m.exec(diff);
  if (minus?.[1] && minus[1] !== "/dev/null") return minus[1].trim();
  return null;
}

export const applyPatchTool: RegisteredTool = {
  name: "apply_patch",
  description:
    "Apply a unified diff to a file inside the workspace. Prefer this over fs.write for edits. " +
    "Stores a snapshot so fs.patch.undo can revert. workspaceOnly=true by default.",
  risk: "high",
  inputSchema: z.object({
    path: z
      .string()
      .optional()
      .describe("Absolute path to patch; if omitted, taken from +++ header"),
    diff: z.string().min(1).describe("Unified diff text"),
    workspaceOnly: z
      .boolean()
      .optional()
      .describe("Reject paths outside allowed folders (default true)"),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    const workspaceOnly = input.workspaceOnly !== false;
    const fromDiff = extractTargetPath(input.diff);
    const rawPath = input.path || fromDiff;
    if (!rawPath) {
      return {
        ok: false,
        summary: "No target path",
        error: "Provide path or a +++ header in the diff",
      };
    }
    if (!workspaceOnly) {
      return {
        ok: false,
        summary: "workspaceOnly=false is not permitted",
        error: "Patches must stay inside the workspace",
      };
    }
    const path = assertAllowedPath(rawPath, ctx.allowedPaths, "apply_patch");
    let previous: string | null = null;
    try {
      previous = await readFile(path, "utf8");
    } catch {
      previous = null;
    }
    const next = applyUnifiedDiff(previous ?? "", input.diff);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, next, "utf8");

    snapshotSeq += 1;
    const id = `patch-${snapshotSeq}-${randomUUID().slice(0, 8)}`;
    snapshots.set(id, {
      id,
      path,
      previous,
      at: nowIso(),
    });
    // Persist snapshot under userData for process restarts within session
    try {
      const snapDir = join(ctx.userDataPath, "patch-snapshots");
      await mkdir(snapDir, { recursive: true });
      await writeFile(
        join(snapDir, `${id}.json`),
        JSON.stringify({ id, path, previous, at: snapshots.get(id)!.at }),
        "utf8",
      );
    } catch {
      // in-memory still works
    }

    return {
      ok: true,
      summary: `Applied patch to ${path} (undo id ${id})`,
      data: { path, undoId: id, bytes: Buffer.byteLength(next, "utf8") },
    };
  },
};

export const patchUndoTool: RegisteredTool = {
  name: "fs.patch.undo",
  description: "Undo a previous apply_patch using its undo id.",
  risk: "high",
  inputSchema: z.object({
    undoId: z.string().min(1),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    let snap = snapshots.get(input.undoId);
    if (!snap) {
      try {
        const raw = await readFile(
          join(ctx.userDataPath, "patch-snapshots", `${input.undoId}.json`),
          "utf8",
        );
        snap = JSON.parse(raw) as PatchSnapshot;
      } catch {
        return { ok: false, summary: "Unknown undo id", error: "Snapshot not found" };
      }
    }
    const path = assertAllowedPath(snap.path, ctx.allowedPaths, "fs.patch.undo");
    if (snap.previous == null) {
      // file was created by patch — wipe to empty rather than delete (safer)
      await writeFile(path, "", "utf8");
    } else {
      await writeFile(path, snap.previous, "utf8");
    }
    snapshots.delete(input.undoId);
    try {
      const { appendOfficeEvent } = await import("../audit/tool-audit.js");
      const { RealTimeSource } = await import("../office/time/index.js");
      await appendOfficeEvent({
        clock: new RealTimeSource(),
        event: "artifact.reverted",
        summary: `Reverted ${path}`,
        detail: { path, undoId: input.undoId },
      });
    } catch {
      // Audit is best-effort; the revert already succeeded.
    }
    return {
      ok: true,
      summary: `Reverted ${path}`,
      data: { path, undoId: input.undoId },
    };
  },
};
