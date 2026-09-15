import type { QueuedRow } from "./queue/queue.js";

/**
 * How much channel history a seat gets with its orders.
 *
 * Enough to see what the person asked and what already shipped, short enough
 * that a local model still has room for tools. Without this, a lead that wanted
 * a spreadsheet filled had to paste every row into the REQUEST, and the same
 * dataset then travelled as chat, into the file, and out again when someone
 * asked to see it.
 */
const MAX_POSTS = 12;
const MAX_CHARS = 2_000;
const MAX_LINE = 240;

/** Soft ceiling on a lead's REQUEST instruction. Longer usually means a paste. */
export const REQUEST_SOFT_CAP = 1_500;

/**
 * An answer a seat already gave in this channel.
 *
 * These are not bus messages - a question's answer has no next desk to reach -
 * so they never appeared in the brief, which is how the manager lost its own
 * half of a conversation: it saw three of the person's lines in a row, could
 * not see what it had said between them, and started arguing about who asked
 * whom.
 */
export interface BriefAnswer {
  createdAt: number;
  /** The role that answered, so the line reads as that seat talking. */
  role: string;
  text: string;
}

/**
 * A compact transcript of recent channel work for the seat about to run.
 *
 * Skips the row that is about to be handled, so the assignee is not asked to
 * re-read its own orders twice. Prior answers are folded in by time, so a
 * back-and-forth reads as the conversation it was.
 */
export function buildChannelBrief(
  rows: readonly QueuedRow[],
  skipId?: string,
  answers: readonly BriefAnswer[] = [],
): string {
  const entries: Array<{ at: number; line: string }> = [];
  for (const row of rows.filter((item) => item.id !== skipId)) {
    const line = lineOf(row);
    if (line) entries.push({ at: row.createdAt, line });
  }
  for (const answer of answers) {
    const said = clip(answer.text);
    // Name the seat. Marking every answer "(you)" made every teammate's line
    // look like the current seat's own, so later speakers lost the thread.
    if (said) entries.push({ at: answer.createdAt, line: `${answer.role}: ${said}` });
  }
  // Newest last, so the line the current turn is answering sits at the bottom
  // right above the orders, and an older exchange it must not re-answer is
  // clearly behind it.
  entries.sort((a, b) => a.at - b.at);
  const lines = entries.slice(-MAX_POSTS).map((entry) => entry.line);
  if (lines.length === 0) return "";
  let text = lines.join("\n");
  if (text.length > MAX_CHARS) text = text.slice(text.length - MAX_CHARS);
  return [
    // Called it "background only" once, which taught the model to under-read it
    // and answer as if each person line were the first. For a conversation the
    // brief is the thread, and it is what "that" or "the one from last week"
    // point back at.
    "Recent channel context, oldest first. Each teammate is named on their own lines. Use it to resolve what the latest message refers to, and do not answer a turn you already answered:",
    text,
  ].join("\n");
}

function lineOf(row: QueuedRow): string | null {
  const who = row.message.origin === "human" ? "person" : row.from;
  const message = row.message;
  switch (message.type) {
    case "REQUEST": {
      // What a person said is the context that matters. Another seat's orders
      // are not: carried whole, they read as instructions to this seat, and a
      // turn was answering the wrong assignment because it was in the brief.
      const said = message.saidAs ?? (row.message.origin === "human" ? message.instruction : null);
      if (said) return `${who}: ${clip(said)}`;
      const label = message.needs.find((need) => need.label)?.label;
      return label ? `${who} asked ${message.to} for ${clip(label)}` : null;
    }
    case "DELIVER": {
      const file = message.artifactRef.label ?? message.artifactRef.id;
      return `${who} delivered ${clip(file)}: ${clip(message.claim)}`;
    }
    case "CHALLENGE":
      return `${who} challenged: ${clip(message.alternative)}`;
    case "BLOCK":
      return `${who} blocked: ${clip(message.reason)}`;
    case "ESCALATE":
      return `${who} needs a decision: ${clip(message.reason)}`;
    default:
      return null;
  }
}

function clip(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= MAX_LINE) return one;
  return `${one.slice(0, MAX_LINE - 1)}…`;
}

/**
 * Keep a lead's assignment short. The assignee already gets the channel brief,
 * so a wall of pasted rows is waste - and it is what made the office look like
 * it was typing the deliverable into chat.
 */
export function trimRequestInstruction(instruction: string): {
  text: string;
  trimmed: boolean;
} {
  const raw = instruction.trim();
  if (raw.length <= REQUEST_SOFT_CAP && !looksLikePastedTable(raw)) {
    return { text: raw, trimmed: false };
  }
  const firstParagraph = raw.split(/\n\n/)[0]?.trim() || raw;
  const short =
    firstParagraph.length > 400
      ? `${firstParagraph.slice(0, 399).trimEnd()}…`
      : firstParagraph;
  return {
    text: [
      short,
      "(The assignee already has the channel context; do not rely on a pasted dataset.)",
    ].join("\n\n"),
    trimmed: true,
  };
}

function looksLikePastedTable(text: string): boolean {
  const pipes = (text.match(/\|/g) ?? []).length;
  const newlines = (text.match(/\n/g) ?? []).length;
  return pipes >= 8 || (newlines >= 12 && text.length > 800);
}
