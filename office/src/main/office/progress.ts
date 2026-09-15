import { basename } from "node:path";
import type { TaskStreamEvent } from "../tools/types.js";

/**
 * What a colleague says while the work is still going.
 *
 * An office goes quiet when someone takes a long time, and silence reads as
 * nothing happening. The runtime already knows what is happening — it streams
 * a status line for every model turn and a request for every tool call, and
 * the scheduler was collecting those into an array and dropping them. So the
 * updates are drawn from the work itself rather than asked for: no second
 * model call, no invention, and nothing to say that was not actually done.
 */

/** What someone can be in the middle of, in words a person would use. */
export type ActivityKind =
  "thinking" | "reading" | "writing" | "running" | "looking" | "handing";

export interface Activity {
  kind: ActivityKind;
  /** The file, query or command, when there is one worth naming. */
  target: string;
}

export const THINKING: Activity = { kind: "thinking", target: "" };

/**
 * Tools are namespaced by what they touch, and named by what they do, so the
 * namespace decides where a rule cannot be read off the verb. First match wins.
 */
const TOOL_RULES: ReadonlyArray<{ match: RegExp; kind: ActivityKind }> = [
  // Handing work to a colleague is the one tool call a person in the room most
  // wants to see, and it read as "running something" while it had no rule.
  { match: /^staff\./, kind: "handing" },
  { match: /^shell\./, kind: "running" },
  { match: /^app\./, kind: "running" },
  { match: /^net\./, kind: "looking" },
  // Ahead of the reading rule, which `web.search` would otherwise match on the
  // word "search" and report as reading a file.
  { match: /^web\./, kind: "looking" },
  { match: /(?:read|open|outline|list|search|preview)/i, kind: "reading" },
  {
    match: /(?:write|patch|add|insert|sort|chart|undo|close|create)/i,
    kind: "writing",
  },
];

/** The argument a person would recognise, preferred in this order. */
const TARGET_KEYS = [
  "path",
  "file",
  "filePath",
  "query",
  "url",
  "command",
  "name",
] as const;

const TARGET_MAX = 48;

/**
 * A URL carries non-Latin words percent-encoded, so the last segment of a
 * Korean Wikipedia link is `%EC%A4%91%EA%B0%84%EB%B3%B4%EA%B3%A0` rather than
 * 중간보고. Shown raw, the line reporting what a colleague is reading was
 * unreadable in the language it was about.
 */
function readable(text: string): string {
  if (!text.includes("%")) return text;
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

export function targetOf(args: Record<string, unknown>): string {
  for (const key of TARGET_KEYS) {
    const value = args[key];
    if (typeof value !== "string" || !value.trim()) continue;
    const trimmed = value.trim();
    // A path says more as its file name; a query or command says more whole.
    const short =
      key === "query" || key === "command"
        ? trimmed
        : readable(basename(trimmed));
    return short.length > TARGET_MAX
      ? `${short.slice(0, TARGET_MAX - 1)}…`
      : short;
  }
  return "";
}

function kindOfTool(name: string): ActivityKind {
  for (const rule of TOOL_RULES) {
    if (rule.match.test(name)) return rule.kind;
  }
  return "running";
}

/**
 * The latest thing worth reporting, or null for events that say nothing new.
 *
 * A tool call is the most informative moment there is — it names a file or a
 * command — so it wins over the generic "thinking" a model turn announces.
 */
export function activityOf(event: TaskStreamEvent): Activity | null {
  switch (event.kind) {
    case "tool_request":
      return { kind: kindOfTool(event.name), target: targetOf(event.args) };
    case "status":
      return THINKING;
    default:
      // Arriving prose used to count as "writing it up", which meant every
      // turn announced itself one beat before it answered: a greeting came with
      // "Manager is writing it up" over it. The answer is its own report.
      return null;
  }
}

export interface ProgressPace {
  /** How long a colleague may work in silence before saying anything. */
  progressQuietMs: number;
  /** How long between updates after the first one. */
  progressRepeatMs: number;
}

/**
 * The floor under an interruption, so a burst of six writes to one sheet does
 * not become six lines in the channel.
 */
export const PROGRESS_CHANGE_MIN_GAP_MS = 2_000;

/**
 * What makes two moments the same thing to say.
 *
 * Reaching for a new tool is the most informative event in a turn, so a change
 * of activity is said as it happens rather than waiting out the quiet period -
 * which is what left a seat looking idle for the half minute it was working.
 */
export function activityKey(activity: Activity): string {
  return `${activity.kind}:${activity.target}`;
}

/**
 * When the next update is due. The first one waits out the quiet period,
 * because narrating work that finishes in a moment is noise, not reassurance.
 */
export function nextUpdateAt(
  startedAt: number,
  lastUpdateAt: number | null,
  pace: ProgressPace,
): number {
  return lastUpdateAt === null
    ? startedAt + Math.max(0, pace.progressQuietMs)
    : lastUpdateAt + Math.max(1, pace.progressRepeatMs);
}

/** Whole minutes, rounded down, for "how long has this been going". */
export function elapsedMinutes(elapsedMs: number): number {
  return Math.max(0, Math.floor(elapsedMs / 60_000));
}

const PHRASE: Record<ActivityKind, string> = {
  thinking: "thinking it through",
  reading: "reading",
  writing: "writing it up",
  running: "running",
  looking: "looking something up",
  handing: "handing it to a colleague",
};

/**
 * The line written to the audit log. The channel builds its own from the
 * structured note so it can be translated; this is what a person reading the
 * log itself sees, and it has to stand on its own there.
 */
export function progressSummary(
  role: string,
  activity: Activity,
  elapsedMs: number,
): string {
  const what = activity.target
    ? `${PHRASE[activity.kind]} ${activity.target}`
    : PHRASE[activity.kind];
  const minutes = elapsedMinutes(elapsedMs);
  return minutes > 0
    ? `${role} is still ${what} (${minutes}m in)`
    : `${role} is ${what}`;
}
