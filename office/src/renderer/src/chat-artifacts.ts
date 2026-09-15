import type { ArtifactKind, ArtifactTextFormat } from "../../shared/office-api";

export interface ExtractedChatArtifact {
  title: string;
  body: string;
  kind: ArtifactKind;
  /** What the document should be saved as; markdown unless the body is markup. */
  format: ArtifactTextFormat;
}

/** Only explicit `artifact` fences become Library documents — not ordinary markdown. */
const ARTIFACT_FENCE = /```artifact(?:([^\n]*))?\r?\n([\s\S]*?)```/gi;

function titleFromBody(body: string, fallback: string): string {
  const titled = /^Title:\s*(.+)\s*$/im.exec(body);
  if (titled?.[1]?.trim()) return titled[1].trim().slice(0, 120);
  const heading = /^#\s+(.+)$/m.exec(body);
  if (heading?.[1]?.trim()) return heading[1].trim().slice(0, 120);
  // Markup has its own idea of a title, and it beats "<!DOCTYPE html>".
  const markup = /<title[^>]*>([^<]+)<\/title>/i.exec(body) ?? /<h1[^>]*>([^<]+)<\/h1>/i.exec(body);
  if (markup?.[1]?.trim()) return markup[1].trim().slice(0, 120);
  const line = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (line) return line.replace(/^#+\s*/, "").slice(0, 120);
  return fallback.slice(0, 120) || "Untitled";
}

function stripTitleDirective(body: string): string {
  return body.replace(/^Title:\s*.+\r?\n+/i, "").trim();
}

/**
 * A page asked for in chat should be a page on disk. The fence tag is the
 * intent when it is there (```artifact html); otherwise read the markup, since
 * models label these blocks inconsistently.
 */
function formatOf(info: string, body: string): ArtifactTextFormat {
  const tag = info.trim().toLowerCase();
  if (/\bhtml\b/.test(tag)) return "html";
  if (/\bsvg\b/.test(tag)) return "svg";
  const head = body.trimStart().slice(0, 200).toLowerCase();
  if (head.startsWith("<svg")) return "svg";
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) return "html";
  return "md";
}

/**
 * Pull explicit document blocks out of an assistant reply.
 * Only fenced `artifact` blocks are saved — normal chat markdown stays in the bubble.
 */
export function extractArtifactsFromAssistantText(text: string): {
  displayText: string;
  artifacts: ExtractedChatArtifact[];
} {
  const artifacts: ExtractedChatArtifact[] = [];
  let displayText = text;
  let match: RegExpExecArray | null;
  const fence = new RegExp(ARTIFACT_FENCE.source, ARTIFACT_FENCE.flags);
  const ranges: Array<{ start: number; end: number; body: string; info: string }> = [];

  while ((match = fence.exec(text)) !== null) {
    const raw = match[2] ?? "";
    if (raw.trim().length < 40) continue;
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
      body: raw,
      info: match[1] ?? "",
    });
  }

  if (ranges.length === 0) {
    return { displayText: text, artifacts: [] };
  }

  let cursor = 0;
  const parts: string[] = [];
  for (const range of ranges) {
    parts.push(text.slice(cursor, range.start));
    cursor = range.end;
    const body = stripTitleDirective(range.body);
    if (!body) continue;
    artifacts.push({
      title: titleFromBody(range.body, "Document"),
      body,
      kind: "other",
      format: formatOf(range.info, body),
    });
  }
  parts.push(text.slice(cursor));
  displayText = parts
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { displayText: displayText || text.trim(), artifacts };
}
