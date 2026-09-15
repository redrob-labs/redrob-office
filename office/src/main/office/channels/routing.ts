import { randomUUID } from "node:crypto";
import type { ChannelEvent, ChannelEventStore } from "./events.js";
import { ASSISTANT_ID } from "../staff/team-members.js";

/**
 * After a restart the in-memory sticky map is empty. The event log still knows
 * who last spoke in the room — recover that so a plain follow-up does not snap
 * back to Redrob and claim it cannot open Chrome.
 */
export function stickyFromHistory(
  events: readonly ChannelEvent[],
  memberIds: readonly string[],
): string | null {
  const members = new Set(memberIds);
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!;
    if (event.authorId === "human" || event.authorId === "system") continue;
    if (!members.has(event.authorId)) continue;
    return event.authorId;
  }
  return null;
}

/**
 * Strip Korean call-outs so "장훈아" and "장훈야" still name 장훈.
 *
 * People talk to a seat the way they talk to a person: name first, particle
 * glued on. Matching only the bare spelling misses every ordinary Korean line.
 */
function bareCallName(raw: string): string {
  const token = raw.toLowerCase().replace(/\s+/g, "");
  // Longest first so "이여" is not left as a dangling "이" after a short cut.
  return token.replace(/(?:님|씨|아|야|이여)$/u, "");
}

/**
 * Whether a spoken token is this member's name, or a usable piece of it.
 *
 * Korean rooms often use the given name alone ("장훈") for someone listed as
 * "이장훈". A short leftover like one syllable is noise, so it never matches.
 */
function isHangul(text: string): boolean {
  return /^[\uAC00-\uD7A3]+$/u.test(text);
}

function nameMatchesToken(name: string, token: string): boolean {
  if (!name || !token || token.length < 2) return false;
  if (name === token) return true;
  const compact = name.replace(/\s+/g, "");
  if (compact === token) return true;
  // Given-name call in Hangul only: "장훈" reaches "이장훈". English names
  // stay exact — "write" must not steal a seat named Writer.
  if (
    isHangul(compact) &&
    isHangul(token) &&
    compact.length >= token.length + 1 &&
    compact.endsWith(token)
  ) {
    return true;
  }
  return false;
}

/**
 * Who should handle this line in a channel.
 *
 * 1. An @mention that names a member of the channel.
 * 2. A bare call to a member's name ("장훈아 뭐하냐") — people do not always
 *    reach for @ when the person is already in the room.
 * 3. Otherwise a single-member room goes to that member (assistant → chat.ts).
 * 4. Otherwise the channel's default member.
 */
export function mentionTarget(
  text: string,
  memberIds: readonly string[],
  namesById: ReadonlyMap<string, string>,
): string | null {
  const trimmed = text.trim();
  const resolve = (raw: string): string | null => {
    const token = bareCallName(raw);
    if (!token) return null;
    let best: { id: string; score: number } | null = null;
    for (const id of memberIds) {
      if (id.toLowerCase() === token) {
        return id;
      }
      const name = namesById.get(id)?.toLowerCase() ?? "";
      if (!nameMatchesToken(name, token)) continue;
      // Prefer the longest name that fits, so "이장훈" wins over a shorter
      // teammate who also ends in the same syllables.
      const score = name.replace(/\s+/g, "").length;
      if (!best || score > best.score) best = { id, score };
    }
    return best?.id ?? null;
  };

  const leading = /^@([^\s]+)/u.exec(trimmed);
  if (leading) {
    const hit = resolve(leading[1]!);
    if (hit) return hit;
  }
  // A name in the middle of a sentence still names someone: "이거 @writer 에게".
  for (const match of trimmed.matchAll(/(?:^|\s)@([\p{L}\p{N}_-]+)/gu)) {
    const hit = resolve(match[1]!);
    if (hit) return hit;
  }

  // No @: still look for a member being called by name. Leading token first —
  // "장훈아 뭐하냐" — then any later token that is clearly their name. Naming
  // Redrob out loud pulls the thread back to the assistant the same way.
  const words = trimmed.match(/[\p{L}\p{N}_-]+/gu) ?? [];
  for (const word of words) {
    const hit = resolve(word);
    if (hit) return hit;
  }
  return null;
}

export function resolveRecipient(input: {
  text: string;
  memberIds: readonly string[];
  defaultMemberId: string;
  namesById: ReadonlyMap<string, string>;
  explicitTo?: string | null;
  /**
   * Who last answered in this room.
   *
   * A follow-up with no name keeps talking to that person. Without this, every
   * plain line after `@이장훈` falls back to Redrob and the thread breaks.
   */
  stickyMemberId?: string | null;
}): { to: string; viaChat: boolean } {
  /**
   * The built-in assistant has no seat on the floor: it answers from the chat
   * path. Routing it anywhere else fails with "that seat is not on the floor",
   * which is what happened to every plain line in a room with other people in
   * it, because #general holds the whole workspace.
   */
  const answer = (to: string): { to: string; viaChat: boolean } => ({
    to,
    viaChat: to === ASSISTANT_ID,
  });

  if (input.explicitTo && input.memberIds.includes(input.explicitTo)) {
    return answer(input.explicitTo);
  }
  const mentioned = mentionTarget(input.text, input.memberIds, input.namesById);
  if (mentioned) {
    return answer(mentioned);
  }
  if (input.memberIds.length === 1) {
    return answer(input.memberIds[0]!);
  }
  // Keep talking to whoever last spoke, while they are still in the room.
  if (
    input.stickyMemberId &&
    input.memberIds.includes(input.stickyMemberId)
  ) {
    return answer(input.stickyMemberId);
  }
  const fallback = input.memberIds.includes(input.defaultMemberId)
    ? input.defaultMemberId
    : input.memberIds[0]!;
  return answer(fallback);
}

/** Append a user message event before any model call. */
export function appendUserMessage(
  events: ChannelEventStore,
  channelId: string,
  text: string,
): ChannelEvent {
  return events.append({
    id: `evt-${randomUUID()}`,
    channelId,
    authorId: "human",
    type: "message",
    payload: { role: "user", text },
  });
}

/** Append an assistant/teammate prose reply. */
export function appendAssistantMessage(
  events: ChannelEventStore,
  channelId: string,
  authorId: string,
  text: string,
  extra?: Record<string, unknown>,
): void {
  events.append({
    id: `evt-${randomUUID()}`,
    channelId,
    authorId,
    type: "message",
    payload: { role: "assistant", text, ...extra },
  });
}

export function appendDelegateEvent(
  events: ChannelEventStore,
  channelId: string,
  authorId: string,
  to: string,
  reason: string,
  details?: {
    task?: string;
    permission?: "read" | "write" | "full";
  },
): void {
  events.append({
    id: `evt-${randomUUID()}`,
    channelId,
    authorId,
    type: "delegate",
    payload: {
      to,
      reason,
      ...(details?.task ? { task: details.task } : {}),
      ...(details?.permission ? { permission: details.permission } : {}),
    },
  });
}
