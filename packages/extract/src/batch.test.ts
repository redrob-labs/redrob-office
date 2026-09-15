import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { runBatch } from "./batch.js";

describe("runBatch", () => {
  it("isolates item errors and persists progress", async () => {
    const directory = await mkdtemp(join(tmpdir(), "redrob-batch-test-"));
    const result = await runBatch(["good", "bad"], "T4", join(directory, "state.json"), async (id) => {
      if (id === "bad") throw new Error("unreadable");
      return id.toUpperCase();
    });
    expect(result.results.get("good")).toBe("GOOD");
    expect(result.errors.get("bad")?.message).toBe("unreadable");
    expect(result.state.completed).toEqual(["good"]);
    expect(result.state.failed.bad).toBe("unreadable");
  });
});
