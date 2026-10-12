// UI-ONLY BUILD: the AI assistant transport is backend (the remote Redrob
// Console engine). It is intentionally absent in this extraction, so this
// module keeps the exported surface the rest of ai-provider imports but never
// performs a network request: aiFetch rejects with a labelled error that flows
// up into the AI panel's existing "engine unavailable" notice. Restore the
// original (a wrapper over platform fetch with a rescue retry) to re-enable.

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

let rescueFetch: FetchLike | null = null

// Kept for API compatibility; the injected rescue fetch is never used here.
export function setRescueFetch(fn: FetchLike | null): void {
  rescueFetch = fn
  void rescueFetch
}

export const AI_BACKEND_DISABLED_MESSAGE =
  'AI is unavailable in this build: the Redrob Console engine is not included in the UI-only extraction.'

export async function aiFetch(_url: string, _init: RequestInit): Promise<Response> {
  return Promise.reject(new Error(AI_BACKEND_DISABLED_MESSAGE))
}
