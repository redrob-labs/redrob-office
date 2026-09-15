/**
 * Turn failure classification for the agent engine.
 *
 * A turn that fails can fail two ways that call for different copy: the model
 * provider is throttling (retrying cannot help, and the person should know their
 * model was rate-limited), or a turn that did real work then ran out of time
 * (whatever it produced is on disk and worth a look before starting over). These
 * are engine-neutral: they read the error text, not any one runtime's internals.
 */

/** A turn that failed, carrying how much had already been done. */
export class TurnError extends Error {
  readonly toolsRan: number;

  constructor(cause: unknown, toolsRan: number) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "TurnError";
    this.toolsRan = toolsRan;
  }
}

const THROTTLE_LINE =
  /rate[- ]?limit|rate limited|429|quota|insufficient[_ ]quota|too many requests|overloaded|capacity/i;

/** A turn that ended without an answer, for reasons that could be either. */
export const GAVE_UP = /timed out|socket closed|1006|terminated|aborted/i;

/** Whether this failure belongs to the model provider rather than the engine. */
export function isUpstreamModelFailure(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return THROTTLE_LINE.test(text);
}

/**
 * What to tell the person, in their own chat, when their model is throttled.
 * Naming the model and the provider matters: the next thing they can do about it
 * is switch models or wait, and neither is obvious from "something went wrong".
 */
export function upstreamThrottleMessage(model: string, provider: string): string {
  return (
    `${provider} is rate-limiting ${model} right now, so this turn could not run. ` +
    "Nothing was changed. Try again in a moment, or pick a different model in Settings."
  );
}

/**
 * A turn that did real work and then ran out of time. There is nowhere to fall
 * back to, so the question is only what to tell the person: whatever the turn
 * already did is done, and a re-run would risk redoing or discarding it, so the
 * copy points at what is already there rather than silently retrying.
 */
export function workDoneBeforeGivingUp(error: unknown, toolsRan: number): boolean {
  if (toolsRan < 1) return false;
  const text = error instanceof Error ? error.message : String(error);
  return GAVE_UP.test(text);
}

export function turnRanOutOfTimeMessage(toolsRan: number): string {
  const steps = toolsRan === 1 ? "1 step" : `${toolsRan} steps`;
  return (
    `That turn ran ${steps} and then the model stopped responding, so it never finished. ` +
    "Whatever it had already done is done - worth a look in your documents before asking again, " +
    "in case you would rather start from what is there."
  );
}
