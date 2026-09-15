const MAX_TITLE = 40;

/** Fallback title from the first user message (no model call). */
export function deriveChatTitleFromUser(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.length > MAX_TITLE ? `${cleaned.slice(0, MAX_TITLE - 1)}…` : cleaned;
}

/**
 * Cheap local summary when the model title call fails or is skipped.
 * Prefer a short noun-phrase-ish slice of the user question.
 */
export function heuristicChatTitle(userText: string, _assistantText?: string): string {
  let text = userText.replace(/\s+/g, " ").trim();
  if (!text) return "";

  // Drop common chat fillers (KO/EN).
  text = text
    .replace(/^(please\s+|pls\s+|can you\s+|could you\s+|help me\s+)/i, "")
    .replace(/^(제발\s+|혹시\s+|저\s*|나\s*)?(알려줘|설명해\s*줘|말해\s*줘|찾아줘|검색해\s*줘)\s*/i, "")
    .replace(/\s*(해\s*줘|해주세요|부탁해|부탁드립니다)\.?$/i, "")
    .trim();

  // First sentence / clause.
  const sentence = text.split(/[?!.\n]|요\?|까\?/).map((s) => s.trim()).find(Boolean) || text;
  const compact = sentence.replace(/\s+/g, " ").trim();
  if (!compact) return deriveChatTitleFromUser(userText);
  return compact.length > MAX_TITLE ? `${compact.slice(0, MAX_TITLE - 1)}…` : compact;
}

/** Strip quotes/labels from a model-returned title. */
export function sanitizeGeneratedTitle(raw: string): string {
  let t = raw.replace(/\s+/g, " ").trim();
  t = t.replace(/^["'`「『]|["'`」』]$/g, "").trim();
  t = t.replace(/^(title|제목)\s*[:：]\s*/i, "").trim();
  t = t.split(/\r?\n/)[0]?.trim() || "";
  if (!t) return "";
  return t.length > MAX_TITLE ? `${t.slice(0, MAX_TITLE - 1)}…` : t;
}
