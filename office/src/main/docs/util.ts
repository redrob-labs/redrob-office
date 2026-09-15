import { createHash } from "node:crypto";

export function hashDocOps(tool: string, ops: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify({ tool, ops }))
    .digest("hex");
}

export function colToLetter(col: number): string {
  let n = col;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || "A";
}

export function letterToCol(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

export function parseA1(addr: string): { col: number; row: number } {
  const m = /^([A-Za-z]+)(\d+)$/.exec(addr.trim());
  if (!m) throw new Error(`Invalid A1 address: ${addr}`);
  return { col: letterToCol(m[1]!), row: Number(m[2]) };
}

export function cellAddr(col: number, row: number): string {
  return `${colToLetter(col)}${row}`;
}

export function summarizeSheetCells(
  cells: Array<{ addr: string; before: unknown; after: unknown }>,
  limit = 100,
): {
  cells: Array<{ addr: string; before: string | number | boolean | null; after: string | number | boolean | null }>;
  truncated: boolean;
  summaryRanges?: Array<{ range: string; count: number }>;
} {
  const norm = cells.map((c) => ({
    addr: c.addr,
    before: (c.before ?? null) as string | number | boolean | null,
    after: (c.after ?? null) as string | number | boolean | null,
  }));
  if (norm.length <= limit) {
    return { cells: norm, truncated: false };
  }
  return {
    cells: norm.slice(0, limit),
    truncated: true,
    summaryRanges: [
      {
        range: `${norm[0]?.addr ?? "?"}…${norm[norm.length - 1]?.addr ?? "?"}`,
        count: norm.length,
      },
    ],
  };
}
