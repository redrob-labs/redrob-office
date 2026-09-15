import type { FloorChannelPost } from "../../shared/office-api";

/** The `from` the Floor puts on anything intake publishes. */
export const INTAKE_ID = "floor-intake";

/**
 * How long a gap can be before the next message from the same person starts a
 * new block. Slack's own window, and the reason a conversation reads as turns
 * rather than as one wall of repeated nameplates.
 */
export const GROUP_WINDOW_MS = 5 * 60_000;

export type FloorRow =
  /** A day boundary. Slack draws one whenever the calendar date changes. */
  | { kind: "date"; id: string; at: number }
  /** Something the office did to itself, centred and unattributed. */
  | { kind: "note"; id: string; post: FloorChannelPost; text: string }
  /**
   * What a colleague is in the middle of, while they are still in the middle
   * of it. Only the newest one in a run survives: what someone was doing two
   * minutes ago stops being news the moment they say what they are doing now.
   */
  | { kind: "progress"; id: string; post: FloorChannelPost }
  /**
   * A colleague saying what they are about to do, before they do it. A line they
   * said, so it stays where they said it: the status row above is a spinner that
   * the next update overwrites, which is no use for "I am searching for this".
   */
  | { kind: "said"; id: string; post: FloorChannelPost }
  /**
   * A line the office speaks from the message catalog: a hello answered, or a
   * question about what the reader actually wants. Laid out as a message rather
   * than a centred note, because a colleague talking to you is not the building
   * announcing itself. The words are not carried on the post, only what kind of
   * line it is, so the channel can word it in the reader's language.
   */
  | { kind: "spoken"; id: string; post: FloorChannelPost }
  | {
      kind: "message";
      id: string;
      post: FloorChannelPost;
      /**
       * Follows another message from the same sender inside the window, so the
       * avatar and nameplate are dropped and the time moves to the hover
       * gutter.
       */
      grouped: boolean;
      /** Written by the reader, not yet confirmed by the main process. */
      sending: boolean;
    };

/** A colleague saying what they are doing, rather than delivering anything. */
export function isProgress(post: FloorChannelPost): boolean {
  return post.type === "task.progress";
}

/** Said out loud to the room, rather than shown as a spinner. */
export function isSaid(post: FloorChannelPost): boolean {
  return isProgress(post) && post.progress?.spoken === true;
}

/** Audit events that stand for a sentence the channel words itself. */
const SPOKEN_EVENTS: ReadonlySet<string> = new Set([
  "floor.greeted",
  "floor.needsGoal",
  "floor.glitch",
  "floor.answered",
]);

/**
 * Spoken events whose words the office wrote, rather than standing for a line
 * the catalog owns. An answer is the only one: it is the reply itself, already
 * in the language the question was asked in.
 */
export function saysItsOwnWords(post: FloorChannelPost): boolean {
  return post.type === "floor.answered";
}

/** The office speaking for itself, which reads as a person rather than a notice. */
export function isSpoken(post: FloorChannelPost): boolean {
  return SPOKEN_EVENTS.has(post.type);
}

/** Intake speaking for itself is the office handing work over, not a person. */
export function isNote(post: FloorChannelPost): boolean {
  return (
    post.kind === "system" ||
    (post.from === INTAKE_ID && post.origin !== "human")
  );
}

/** Local calendar day, so a divider lands where the reader's midnight is. */
function dayOf(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Whoever the line is attributed to. A person's own messages are attributed to
 * them rather than to the intake desk they technically travel through,
 * otherwise every message a reader sent would group with the office's notes.
 */
export function senderKey(post: FloorChannelPost): string {
  return post.origin === "human" ? "human" : post.from;
}

export interface BuildRowsInput {
  posts: readonly FloorChannelPost[];
  /** Lines the composer has accepted but the main process has not confirmed. */
  sending?: readonly FloorChannelPost[];
}

/**
 * Turns a flat list of posts into what Slack actually draws: date dividers,
 * centred notes, and messages where a run from one sender keeps a single
 * nameplate.
 */
export function buildFloorRows({
  posts,
  sending = [],
}: BuildRowsInput): FloorRow[] {
  const all = [...posts, ...sending].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
  const sendingIds = new Set(sending.map((post) => post.id));
  const rows: FloorRow[] = [];
  let previousDay = "";
  // Only a message can be grouped onto, so a note or a divider between two
  // messages from the same sender correctly breaks the run.
  let previous: FloorChannelPost | null = null;

  for (const post of all) {
    const day = dayOf(post.createdAt);
    if (day !== previousDay) {
      rows.push({ kind: "date", id: `date-${day}`, at: post.createdAt });
      previousDay = day;
      previous = null;
    }

    if (isSaid(post)) {
      // Said before the tool runs, so a standing "still going" above it is
      // already answered by it.
      const stale = rows.findIndex(
        (row) =>
          row.kind === "progress" && senderKey(row.post) === senderKey(post),
      );
      if (stale >= 0) rows.splice(stale, 1);
      rows.push({ kind: "said", id: post.id, post });
      previous = null;
      continue;
    }

    if (isProgress(post)) {
      const last = rows[rows.length - 1];
      // A newer update from the same person replaces theirs rather than
      // stacking under it, so the channel carries a status and not a log.
      if (
        last?.kind === "progress" &&
        senderKey(last.post) === senderKey(post)
      ) {
        rows[rows.length - 1] = { kind: "progress", id: post.id, post };
      } else {
        rows.push({ kind: "progress", id: post.id, post });
      }
      previous = null;
      continue;
    }

    // Checked before `isNote`, which would otherwise claim it: these arrive as
    // system posts but are not the office's own notices.
    if (isSpoken(post)) {
      rows.push({ kind: "spoken", id: post.id, post });
      previous = null;
      continue;
    }

    if (isNote(post)) {
      rows.push({ kind: "note", id: post.id, post, text: post.body });
      previous = null;
      continue;
    }

    // Saying the thing retires the status. "Writing it up" left standing above
    // the delivered work claims someone is still doing what they just finished.
    const stale = rows.findIndex(
      (row) => row.kind === "progress" && senderKey(row.post) === senderKey(post),
    );
    if (stale >= 0) rows.splice(stale, 1);

    const grouped =
      previous !== null &&
      senderKey(previous) === senderKey(post) &&
      post.createdAt - previous.createdAt < GROUP_WINDOW_MS;

    rows.push({
      kind: "message",
      id: post.id,
      post,
      grouped,
      sending: sendingIds.has(post.id),
    });
    previous = post;
  }

  return rows;
}
