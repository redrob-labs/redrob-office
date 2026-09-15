/**
 * The right-hand pane of the chat, the way Slack uses one: the conversation
 * stays where it is, and everything that needs room to explain itself - what
 * this channel is, its files, who is in it, what was pinned - opens beside it.
 *
 * A person and a file are opened from the transcript rather than from the bar,
 * so they are pane views without being tabs.
 */

/** The views reachable from the channel's tab bar, in bar order. */
export const CHAT_PANE_TABS = ["summary", "files", "members"] as const;

export type ChatPaneTab = (typeof CHAT_PANE_TABS)[number];

export type ChatPane =
  | { kind: ChatPaneTab }
  /** One teammate, opened from their name. */
  | { kind: "member"; memberId: string }
  /** A document, read beside the conversation it came out of. */
  | { kind: "artifact"; artifactId: string };

/** The heading shown at the top of the pane. */
export const CHAT_PANE_TITLE: Record<ChatPane["kind"], string> = {
  summary: "chat.paneSummary",
  files: "chat.paneFiles",
  members: "chat.paneMembers",
  member: "chat.paneMember",
  artifact: "chat.artifactPane",
};

/**
 * What the pane is showing, as one comparable value. A view opened from a
 * subject is only the same view for the same subject.
 */
export function chatPaneKey(pane: ChatPane): string {
  if (pane.kind === "member") return `member:${pane.memberId}`;
  if (pane.kind === "artifact") return `artifact:${pane.artifactId}`;
  return pane.kind;
}

/** True when `pane` is the view a given tab button stands for. */
export function isChatPaneOpen(
  pane: ChatPane | null,
  kind: ChatPane["kind"],
): boolean {
  return pane?.kind === kind;
}

/**
 * Clicking what is already open closes it, which is how every pane toggle in
 * Slack behaves; clicking a different person or file switches instead.
 */
export function toggleChatPane(
  current: ChatPane | null,
  next: ChatPane,
): ChatPane | null {
  return current && chatPaneKey(current) === chatPaneKey(next) ? null : next;
}

/**
 * Roving focus for the bar: one button is tabbable and the arrow keys move
 * between them. Returns null for keys the bar does not own.
 */
export function nextChatPaneTab(
  current: ChatPaneTab,
  key: string,
): ChatPaneTab | null {
  const index = CHAT_PANE_TABS.indexOf(current);
  if (index < 0) return null;
  const last = CHAT_PANE_TABS.length - 1;
  if (key === "ArrowRight")
    return CHAT_PANE_TABS[index === last ? 0 : index + 1]!;
  if (key === "ArrowLeft") return CHAT_PANE_TABS[index === 0 ? last : index - 1]!;
  if (key === "Home") return CHAT_PANE_TABS[0]!;
  if (key === "End") return CHAT_PANE_TABS[last]!;
  return null;
}
