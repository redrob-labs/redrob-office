/**
 * What the person is told when the chat engine cannot run the turn.
 *
 * The agent runs on Redrob Code, the only engine. There is no second loop to
 * swap onto, so a failure is a failure: the notice stays branded as Redrob, does
 * not name any third party, and never tells the model to give up its tools. The
 * checker below locks the "no degraded mode" rule in a test.
 */

/**
 * What the person is told when the agent engine cannot run the turn.
 *
 * Keep this branded as Redrob. Do not name the engine or any third party, and do
 * not say we "answered on" another loop. A missing or unreachable engine is a
 * failure the person can act on, not a quiet swap.
 */
export function redrobCodeUnavailableMessage(reason?: string): string {
  const detail = reason?.trim();
  if (detail) {
    return `Redrob could not complete this reply (${detail}). Check that the agent engine is installed and reachable, then try again.`;
  }
  return "Redrob could not complete this reply. Check that the agent engine is installed and reachable, then try again.";
}

/**
 * Phrases that quietly tell a model to give up on its tools. Any steering line
 * we emit must not match these: a run should be told to connect or retry, not to
 * pretend the capability is gone.
 */
const DEGRADED_PATTERNS: RegExp[] = [
  /\bwithout (?:your |any )?tools?\b/i,
  /\bno tools? (?:are )?available\b/i,
  /\btools? (?:are )?(?:disabled|unavailable|gone)\b/i,
  /\blimited mode\b/i,
  /\bdegraded mode\b/i,
  /\bcannot use (?:any )?tools?\b/i,
  /\bproceed without\b/i,
  /\bfall back to (?:plain )?(?:text|prose)\b/i,
];

/** True when a steering string tells the model to work as if its tools vanished. */
export function hasDegradedSteering(text: string): boolean {
  return DEGRADED_PATTERNS.some((pattern) => pattern.test(text));
}
