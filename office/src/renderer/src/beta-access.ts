/** First-run access accepts only keys issued by console.redrob.ai. */
export function looksLikeRedrobKey(raw: string): boolean {
  const key = raw.trim();
  if (key.length < 20) return false;
  if (/\s/.test(key)) return false;
  return true;
}

/** Session flag so `dev:web` can reopen the gate without wiping mock setup. */
export const FORCE_BETA_GATE_KEY = "redrob.forceBetaGate";

export function forceBetaGateEnabled(): boolean {
  try {
    return sessionStorage.getItem(FORCE_BETA_GATE_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearForceBetaGate(): void {
  try {
    sessionStorage.removeItem(FORCE_BETA_GATE_KEY);
  } catch {
    /* ignore */
  }
}
