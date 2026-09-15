/**
 * Extract https URLs from chat input for auto page-fetch.
 * Only https (matches main-process page-fetch policy).
 */
const HTTPS_URL_RE = /https:\/\/[^\s<>"'`)\]|,]+/gi;

export function extractHttpsUrls(text: string, limit = 3): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const matches = text.match(HTTPS_URL_RE) ?? [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;:!?]+$/g, "");
    let parsed: URL;
    try {
      parsed = new URL(cleaned);
    } catch {
      continue;
    }
    if (parsed.protocol !== "https:") continue;
    const href = parsed.toString();
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(href);
    if (out.length >= limit) break;
  }
  return out;
}
