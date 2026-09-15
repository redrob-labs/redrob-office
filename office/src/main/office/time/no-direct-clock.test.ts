import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Blocks direct wall-clock reads from creeping back in.
 *
 * This is the recurrence guard for the TimeSource rule. It is a test rather
 * than a lint rule because the repo has no ESLint setup, and standing one up
 * for a single rule would add a toolchain that nothing else needs; this runs in
 * the same `vitest run` everything else already runs in.
 *
 * `Date.now()` and zero-argument `new Date()` read ambient wall time, which is
 * what makes a replayed or virtual-clock run write timestamps that contradict
 * the rest of the same run. `new Date(x)` is not matched and is fine: it
 * formats an instant that was already read from a clock.
 */

const SRC = join(fileURLToPath(new URL("../../../", import.meta.url)));

/**
 * The clock has to be read somewhere. These are the only places allowed to do
 * it, and each exists so that nothing else has to.
 */
const CLOCK_IMPLEMENTATIONS = new Set([
  join("main", "office", "time", "index.ts"),
  join("main", "app-time.ts"),
  join("renderer", "src", "clock.ts"),
]);

/** Assertions about wall time are the one legitimate reason to read it. */
const TEST_FILE = /\.test\.tsx?$/;

const BANNED = /Date\.now\(\)|new Date\(\)/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "out" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("TimeSource", () => {
  it("is the only way source code reads the clock", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file);
      if (CLOCK_IMPLEMENTATIONS.has(rel) || TEST_FILE.test(rel)) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (BANNED.test(line)) offenders.push(`${rel.split(sep).join("/")}:${index + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
