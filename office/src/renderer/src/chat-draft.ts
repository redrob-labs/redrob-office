const CHAT_DRAFT_EVENT = "office:chatDraft";

/** Held until ChatPanel applies it — survives a brief unmount or late listener. */
let pendingChatDraft: string | null = null;

/**
 * Hand the chat box a sentence to send.
 *
 * A flow the assistant can run is no use if the only way to learn that is to
 * read a tool description, so the Workflows tab writes the request for the
 * person and lets them read it before pressing send.
 */
export function requestChatDraft(text: string): void {
  const body = text.trim();
  if (!body) return;
  pendingChatDraft = body;
  window.dispatchEvent(new CustomEvent(CHAT_DRAFT_EVENT, { detail: body }));
}

/** Consume a draft that arrived before Chat was listening. */
export function takePendingChatDraft(): string | null {
  const body = pendingChatDraft;
  pendingChatDraft = null;
  return body;
}

const OPEN_CHAT_EVENT = "office:openChat";

/** Draft a chat message and switch the shell to Chat. */
export function openChatWithDraft(text: string): void {
  requestChatDraft(text);
  window.dispatchEvent(new Event(OPEN_CHAT_EVENT));
}

export function onOpenChat(handler: () => void): () => void {
  window.addEventListener(OPEN_CHAT_EVENT, handler);
  return () => window.removeEventListener(OPEN_CHAT_EVENT, handler);
}

export function onChatDraft(handler: (text: string) => void): () => void {
  const listener = (event: Event): void => {
    const detail = (event as CustomEvent<string>).detail;
    if (typeof detail === "string" && detail.trim()) handler(detail);
  };
  window.addEventListener(CHAT_DRAFT_EVENT, listener);
  return () => window.removeEventListener(CHAT_DRAFT_EVENT, listener);
}
