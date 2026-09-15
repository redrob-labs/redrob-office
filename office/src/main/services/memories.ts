/**
 * Parse pasted or file-based memory dumps into fact strings.
 * Supports plain text, Markdown, JSON, and simple CSV.
 */
export function parseMemoryImportText(raw: string, fileName?: string): string[] {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) return [];

  const ext = extensionOf(fileName);

  if (ext === "json" || text.startsWith("[") || text.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(text);
      const fromJson = bodiesFromJson(parsed);
      if (fromJson.length > 0) return fromJson;
    } catch {
      // Fall through.
    }
  }

  if (ext === "csv" || looksLikeCsv(text)) {
    const fromCsv = bodiesFromCsv(text);
    if (fromCsv.length > 0) return fromCsv;
  }

  if (ext === "md" || ext === "markdown" || looksLikeMarkdown(text)) {
    const fromMd = bodiesFromMarkdown(text);
    if (fromMd.length > 0) return fromMd;
  }

  return bodiesFromPlainLines(text);
}

function extensionOf(fileName?: string): string {
  if (!fileName) return "";
  const base = fileName.replace(/^.*[\\/]/, "").toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1) : "";
}

function looksLikeMarkdown(text: string): boolean {
  return (
    /^#{1,6}\s+\S/m.test(text) ||
    /^[-*+]\s+\S/m.test(text) ||
    /^\d+\.\s+\S/m.test(text) ||
    /```/.test(text) ||
    /\[[^\]]+\]\([^)]+\)/.test(text)
  );
}

function looksLikeCsv(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return false;
  const commas = lines.filter((line) => line.includes(",")).length;
  return commas >= Math.ceil(lines.length * 0.6);
}

function bodiesFromPlainLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => stripInlineMarkdown(line.replace(/^[-*•+]\s+/, "").replace(/^\d+\.\s+/, "")))
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function bodiesFromMarkdown(text: string): string[] {
  const withoutCode = text.replace(/```[\s\S]*?```/g, "\n");
  const listItems: string[] = [];
  for (const line of withoutCode.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:[-*+•]|\d+\.)\s+(.+)$/);
    if (!match?.[1]) continue;
    const body = stripInlineMarkdown(match[1]).trim();
    if (body) listItems.push(body);
  }
  if (listItems.length > 0) return dedupePreserveOrder(listItems);

  // No lists — treat non-heading paragraphs as facts.
  const paragraphs = withoutCode
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split(/\r?\n/)
        .map((line) => line.replace(/^#{1,6}\s+/, "").trim())
        .filter((line) => line.length > 0 && !/^[-*_]{3,}$/.test(line))
        .join(" "),
    )
    .map((block) => stripInlineMarkdown(block).trim())
    .filter((block) => block.length > 0 && block.length <= 500);

  return dedupePreserveOrder(paragraphs);
}

function bodiesFromCsv(text: string): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const rows = lines.map(splitCsvLine);
  const header = rows[0] ?? [];
  const bodyIndex = header.findIndex((cell) =>
    /^(body|content|text|memory|fact|value|메모|내용)$/i.test(cell.trim()),
  );

  const start = bodyIndex >= 0 ? 1 : 0;
  const column = bodyIndex >= 0 ? bodyIndex : 0;
  const out: string[] = [];
  for (let i = start; i < rows.length; i += 1) {
    const cell = rows[i]?.[column]?.trim() ?? "";
    if (cell) out.push(cell);
  }
  return dedupePreserveOrder(out);
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function bodiesFromJson(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => bodiesFromJson(item));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["memories", "memory", "items", "facts", "data"]) {
      if (key in record) return bodiesFromJson(record[key]);
    }
    for (const key of ["body", "content", "text", "memory", "fact", "value"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) {
        return [candidate.trim()];
      }
    }
  }
  return [];
}

// Searching the workspace lives in ./workspace-brain.ts, where it is reachable:
// what used to sit here was a ranking function nothing ever called.
