/**
 * Leave a message in a channel that will still be there tomorrow.
 *
 * A channel's transcript is a stored chat session; the live event log a room
 * also has is only read by a chat that happens to be open at that second. Work
 * that runs while nobody is looking — a scheduled skill, most obviously — has
 * to be written into the transcript, or it reports into a room that forgets it
 * before anybody walks in.
 */
import { getChatSession, listChatSessions, saveChatSession } from "@redrob/store";
import { channelIdOfSession, roomSessionId } from "../../shared/chat-session-id.js";
import { nowIso } from "../app-time.js";
import { toolStore } from "../tools/tool-store.js";

/**
 * Which transcript this room reads back.
 *
 * Rooms opened before rooms were chats have generated session ids, so the
 * newest session belonging to the channel wins over the canonical name — the
 * same rule the chat pane uses, because writing anywhere else puts the report
 * in a transcript the room does not open.
 */
export function transcriptIdForChannel(
  sessions: readonly { id: string; updatedAt: string }[],
  channelId: string,
): string {
  const own = roomSessionId(channelId);
  if (sessions.some((session) => session.id === own)) return own;
  const legacy = sessions
    .filter((session) => channelIdOfSession(session.id) === channelId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return legacy?.id ?? own;
}

/** One assistant message, in the shape the chat pane stores and reads. */
export function transcriptWith(
  messagesJson: string,
  input: { text: string; authorId: string; at: string },
): string {
  let messages: unknown[] = [];
  try {
    const parsed = JSON.parse(messagesJson) as unknown;
    if (Array.isArray(parsed)) messages = parsed;
  } catch {
    messages = [];
  }
  return JSON.stringify([
    ...messages,
    {
      id: `sched-${messages.length + 1}-${input.at}`,
      kind: "chat",
      role: "assistant",
      content: input.text,
      authorId: input.authorId,
      at: input.at,
    },
  ]);
}

/** Write one assistant message into a channel's stored transcript. */
export function appendChannelReport(input: {
  userData: string;
  channelId: string;
  text: string;
  authorId?: string;
  /** Used only when the transcript does not exist yet. */
  title?: string;
}): { sessionId: string } {
  const store = toolStore(input.userData);
  const sessionId = transcriptIdForChannel(listChatSessions(store, 200), input.channelId);
  const existing = getChatSession(store, sessionId);
  saveChatSession(store, {
    id: sessionId,
    ...(existing ? {} : { title: input.title ?? input.channelId }),
    messagesJson: transcriptWith(existing?.messagesJson ?? "[]", {
      text: input.text,
      authorId: input.authorId ?? "assistant",
      at: nowIso(),
    }),
  });
  return { sessionId };
}
