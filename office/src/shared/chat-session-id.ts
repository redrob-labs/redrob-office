/**
 * Chat session ids carry which room (or person) they belong to.
 *
 * The Floor deletes channels in one store and chat transcripts live in another.
 * Without the room in the id, a hard refresh after deleting a channel can open
 * that transcript under whatever room is left — usually #general.
 */

export const GENERAL_CHANNEL_ID = "general";

export const ROOM_SESSION_PREFIX = "chat-ch~";
export const DM_SESSION_PREFIX = "chat-dm-";

export function roomSessionId(channelId: string): string {
  return `${ROOM_SESSION_PREFIX}${channelId}`;
}

export function dmSessionId(memberId: string): string {
  return `${DM_SESSION_PREFIX}${memberId}`;
}

export function dmMemberOfSession(sessionId: string): string | null {
  return sessionId.startsWith(DM_SESSION_PREFIX)
    ? sessionId.slice(DM_SESSION_PREFIX.length)
    : null;
}

export function dmChannelIdOf(memberId: string): string {
  return `dm-${memberId}`;
}

/** Which channel's transcript a stored chat session belongs to. */
export function channelIdOfSession(sessionId: string): string {
  const memberId = dmMemberOfSession(sessionId);
  if (memberId) return dmChannelIdOf(memberId);
  if (!sessionId.startsWith(ROOM_SESSION_PREFIX)) return GENERAL_CHANNEL_ID;
  const rest = sessionId.slice(ROOM_SESSION_PREFIX.length);
  const cut = rest.indexOf("~");
  const channelId = cut === -1 ? rest : rest.slice(0, cut);
  return channelId || GENERAL_CHANNEL_ID;
}

/** True when this transcript belongs to the given room (including legacy ids). */
export function sessionBelongsToChannel(
  sessionId: string,
  channelId: string,
): boolean {
  return channelIdOfSession(sessionId) === channelId;
}
