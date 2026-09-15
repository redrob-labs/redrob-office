/**
 * Search everything this workspace already knows: notes, documents, past chats.
 *
 * A person asks "what did we decide about the pricing page" three weeks after
 * deciding it. The answer is in the workspace — a remembered fact, a document
 * somebody wrote, a message in a channel — and until now the only way to get it
 * back was to remember where it was. That is the part a computer should do.
 *
 * This is keyword retrieval over the three stores, not an embedding index, and
 * it is named that way on purpose: calling term overlap "semantic" sets an
 * expectation the ranking cannot meet, and the person discovers the difference
 * on the first paraphrased question. What it does do is find a passage whose
 * words match, say which store it came from, and quote enough of it to be
 * checked.
 */

export type BrainSource = "note" | "document" | "conversation";

export interface BrainPassage {
  /** Where this text lives, for the answer to point at. */
  source: BrainSource;
  /** A document title, a chat title, or the note itself. */
  title: string;
  text: string;
  /** Document id or session id, so a caller can open the thing. */
  ref?: string;
  updatedAt?: string;
}

export interface BrainHit extends BrainPassage {
  score: number;
  /** The part of the passage that matched, for a quotable answer. */
  excerpt: string;
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "what", "when", "where", "which",
  "was", "were", "did", "does", "have", "has", "had", "are", "you", "your", "our",
  "about", "from", "into", "how", "why", "who", "any", "all", "can", "will",
  "we", "us", "they", "them", "their", "she", "her", "his", "its", "my", "me",
  "is", "be", "been", "do", "of", "in", "on", "to", "at", "by", "or", "if", "as",
  "so", "not", "but", "than", "then", "there", "here", "just", "get", "got",
  // Asked "what did we decide about X", every word but X is furniture.
  "decide", "decided", "say", "said", "tell", "know",
]);

/** The words in a question that are worth matching on. */
export function queryTerms(query: string): string[] {
  const terms = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((term) => term.length > 1);
  const meaningful = terms.filter((term) => !STOP_WORDS.has(term));
  // A question made entirely of common words still deserves an attempt.
  return [...new Set(meaningful.length > 0 ? meaningful : terms)];
}

/**
 * How well a passage answers the question, and the part of it that did.
 *
 * Scoring counts distinct terms first and repeats second: a passage that
 * mentions both "pricing" and "page" beats one that says "pricing" six times,
 * because the first is about the subject and the second is a word.
 */
export function scorePassage(
  terms: readonly string[],
  passage: BrainPassage,
): { score: number; excerpt: string } {
  const haystack = `${passage.title}\n${passage.text}`;
  const lower = haystack.toLowerCase();
  let matched = 0;
  let repeats = 0;
  let titleHits = 0;
  let firstAt = -1;

  for (const term of terms) {
    const at = lower.indexOf(term);
    if (at === -1) continue;
    matched += 1;
    const whole = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const hits = lower.match(whole)?.length ?? 0;
    repeats += Math.min(hits, 5);
    if (passage.title.toLowerCase().includes(term)) titleHits += 1;
    if (firstAt === -1 || at < firstAt) firstAt = at;
  }
  if (matched === 0) return { score: 0, excerpt: "" };

  const coverage = matched / terms.length;
  const score = matched * 10 + coverage * 10 + repeats + titleHits * 4;
  return { score, excerpt: excerptAround(passage.text, terms, 240) };
}

/** The window of a passage a person would have highlighted. */
export function excerptAround(
  text: string,
  terms: readonly string[],
  width: number,
): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= width) return flat;
  const lower = flat.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const found = lower.indexOf(term);
    if (found !== -1 && (at === -1 || found < at)) at = found;
  }
  if (at === -1) return `${flat.slice(0, width)}…`;
  const start = Math.max(0, at - Math.floor(width / 3));
  const end = Math.min(flat.length, start + width);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

/** The best passages for a question, ranked, one entry per source item. */
export function rankPassages(
  query: string,
  passages: readonly BrainPassage[],
  limit = 8,
): BrainHit[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const hits: BrainHit[] = [];
  for (const passage of passages) {
    const { score, excerpt } = scorePassage(terms, passage);
    if (score <= 0) continue;
    hits.push({ ...passage, score, excerpt });
  }
  return hits
    .sort((a, b) => b.score - a.score || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, Math.max(1, limit));
}

/** How much of one document or conversation is worth reading into a passage. */
const MAX_PASSAGE_CHARS = 8_000;
const MAX_DOCUMENTS = 120;
const MAX_CONVERSATIONS = 60;

export function clipPassage(text: string): string {
  return text.length > MAX_PASSAGE_CHARS ? text.slice(0, MAX_PASSAGE_CHARS) : text;
}

/**
 * Pull the searchable text out of a saved chat.
 *
 * Sessions are stored as the renderer's own message array, so this reads
 * defensively: an unparseable session is skipped rather than failing a search
 * of everything else.
 */
export function conversationText(messagesJson: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(messagesJson);
  } catch {
    return "";
  }
  if (!Array.isArray(parsed)) return "";
  const lines: string[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== "object") continue;
    const message = raw as Record<string, unknown>;
    const content = message.content;
    if (typeof content !== "string" || !content.trim()) continue;
    const role = message.role === "user" ? "Asked" : "Answered";
    lines.push(`${role}: ${content.trim()}`);
  }
  return clipPassage(lines.join("\n"));
}

export interface BrainSearchSources {
  notes: () => Array<{ body: string; updatedAt?: string }>;
  documents: () => Promise<Array<{ id: string; title: string; body: string; createdAt?: string }>>;
  conversations: () => Array<{
    id: string;
    title: string;
    messagesJson: string;
    updatedAt?: string;
  }>;
}

/** Everything the workspace holds, as passages a query can be scored against. */
export async function collectPassages(
  sources: BrainSearchSources,
): Promise<BrainPassage[]> {
  const passages: BrainPassage[] = [];

  for (const note of sources.notes()) {
    const body = note.body.trim();
    if (!body) continue;
    passages.push({
      source: "note",
      title: "Remembered note",
      text: clipPassage(body),
      ...(note.updatedAt ? { updatedAt: note.updatedAt } : {}),
    });
  }

  const documents = await sources.documents();
  for (const document of documents.slice(0, MAX_DOCUMENTS)) {
    if (!document.body.trim() && !document.title.trim()) continue;
    passages.push({
      source: "document",
      title: document.title,
      text: clipPassage(document.body),
      ref: document.id,
      ...(document.createdAt ? { updatedAt: document.createdAt } : {}),
    });
  }

  for (const session of sources.conversations().slice(0, MAX_CONVERSATIONS)) {
    const text = conversationText(session.messagesJson);
    if (!text) continue;
    passages.push({
      source: "conversation",
      title: session.title || "Chat",
      text,
      ref: session.id,
      ...(session.updatedAt ? { updatedAt: session.updatedAt } : {}),
    });
  }
  return passages;
}

export async function searchWorkspace(input: {
  query: string;
  sources: BrainSearchSources;
  limit?: number;
  only?: BrainSource[];
}): Promise<BrainHit[]> {
  const passages = await collectPassages(input.sources);
  const scoped =
    input.only && input.only.length > 0
      ? passages.filter((passage) => input.only!.includes(passage.source))
      : passages;
  return rankPassages(input.query, scoped, input.limit ?? 8);
}
