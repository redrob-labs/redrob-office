/**
 * Facts about an AI session, for the Redrob Console's insights.
 *
 * A fact is a count, a flag or a time, never text: what the person wrote, what came back, what a tool
 * read or wrote, and the document itself stay in the editor. The loop emits one fact per thing that
 * happened, and the shell turns a session's facts into the console's labels (apps/shell/src/main/insights).
 *
 * The session id is a random id made for one stretch of conversation and for nothing else, so it can
 * be the id the console knows the session by. Each model request of the session carries it as
 * x-redrob-session, which lets the console join the session to its own record of cost and model.
 */

/** Which editor ran the session. All of them report as Redrob Office. */
export type InsightSurface = 'docs' | 'sheets' | 'slides' | 'pdf' | 'markdown'

export type InsightFact =
  /** The person sent a message. `context`: the open document, a selection or an image went with it. */
  | { kind: 'message'; context: boolean; readOnly: boolean }
  /** A tool ran. `changed`: it changed the document, sheet or deck. */
  | { kind: 'tool'; changed: boolean; failed: boolean }
  /** The run finished with an answer. */
  | { kind: 'answer' }
  /** The person stopped the run. */
  | { kind: 'stopped' }

export type InsightRecord = InsightFact & {
  sessionId: string
  surface: InsightSurface
  /** Milliseconds since the epoch, on this machine. */
  at: number
}

/** A session ends after this long with nothing happening, the same window Cowork uses. */
export const INSIGHT_SESSION_QUIET_MS = 15 * 60_000
