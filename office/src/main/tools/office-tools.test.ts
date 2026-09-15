import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __closeOfficeToolStore,
  memoryManageTool,
  settingsUpdateTool,
} from "./office-tools.js";
import type { ToolContext } from "./types.js";

let dir: string;
let ctx: ToolContext;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "redrob-office-tools-"));
  ctx = { allowedPaths: [dir], userDataPath: dir };
});

afterEach(async () => {
  __closeOfficeToolStore();
  await rm(dir, { recursive: true, force: true });
});

describe("memory.manage", () => {
  it("adds, lists, updates and deletes a memory", async () => {
    const added = await memoryManageTool.handler(
      { action: "add", body: "Prefers concise answers" },
      ctx,
    );
    expect(added.ok).toBe(true);
    const id = (added.data as { memory: { id: string } }).memory.id;

    const listed = await memoryManageTool.handler({ action: "list" }, ctx);
    expect(listed.ok).toBe(true);
    expect(listed.summary).toContain("Prefers concise answers");

    const updated = await memoryManageTool.handler(
      { action: "update", id, body: "Prefers very short answers" },
      ctx,
    );
    expect(updated.ok).toBe(true);
    expect(updated.summary).toContain("very short");

    const deleted = await memoryManageTool.handler({ action: "delete", id }, ctx);
    expect(deleted.ok).toBe(true);

    const empty = await memoryManageTool.handler({ action: "list" }, ctx);
    expect(empty.summary).toContain("No memories");
  });

  it("rejects add without a body", async () => {
    const result = await memoryManageTool.handler({ action: "add" }, ctx);
    expect(result.ok).toBe(false);
  });
});

describe("settings.update", () => {
  it("reads current settings when given no fields", async () => {
    const result = await settingsUpdateTool.handler({}, ctx);
    expect(result.ok).toBe(true);
    expect(result.summary).toContain("route=");
    expect((result.data as { webSearchEnabled: boolean }).webSearchEnabled).toBe(true);
  });

  it("changes a user-facing toggle", async () => {
    const result = await settingsUpdateTool.handler(
      { webSearchEnabled: false },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.summary).toContain("webSearch=false");
    expect((result.data as { webSearchEnabled: boolean }).webSearchEnabled).toBe(false);

    const readBack = await settingsUpdateTool.handler({}, ctx);
    expect((readBack.data as { webSearchEnabled: boolean }).webSearchEnabled).toBe(false);
  });
});
