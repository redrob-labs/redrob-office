/**
 * Redrob route constants and the honest-failure rules every AI path keeps.
 *
 * Office no longer calls Console itself. Every turn runs on the bundled Redrob engine
 * (./engine-turn.ts), which holds the credential and makes the model call; Office names a
 * model and never holds a key (redrob-office/AGENTS.md, 2026-09-22). What is left here is
 * the default route and the "no degraded mode" rule.
 */

/**
 * Console's API base. Office does not send inference here (the engine does); it is the
 * fixed value `resolveEndpoint` reports and the base of the public pricing catalogue.
 * Never overridden from settings or the UI.
 */
export const REDROB_CONSOLE_API_BASE = 'https://console.redrob.ai/api/backend/v1'

/**
 * Console's wire id for automatic routing, and the product route name. The engine names
 * the same model `redrob/auto`, which is Office's default.
 */
export const REDROB_ENGINE_MODEL = 'auto'
export const REDROB_ENGINE_ROUTE = 'redrob/auto'

/**
 * What the person is told when Redrob cannot run the turn. Names no engine or third
 * party, and never claims a silent swap onto another loop.
 */
export function redrobEngineUnavailableMessage(reason?: string): string {
  const detail = reason?.trim()
  if (detail) return `Redrob could not complete this reply (${detail}). Check Redrob in Settings and try again.`
  return 'Redrob could not complete this reply. Check Redrob in Settings and try again.'
}

/**
 * Phrases that quietly tell a model to give up on its tools. Any steering copy the AI
 * layer emits must not match these: a run should be told to connect or retry, not to
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
]

/** True when a steering string tells the model to work as if its tools vanished. */
export function hasDegradedSteering(text: string): boolean {
  return DEGRADED_PATTERNS.some((pattern) => pattern.test(text))
}
