import { useSyncExternalStore } from "react";

/**
 * Whether anything in this app may look things up on the web.
 *
 * It was local state in the chat composer, so nothing outside that component
 * could read it - and the office floor, which now has its own search tools, has
 * to honour the same switch. A per-panel copy would also go stale the moment one
 * of them wrote, because the shell keeps visited tabs mounted.
 */
let current = true;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Read the persisted value once, the first time anything asks for it. */
function load(): void {
  loading ??= window.office
    .getSetupSnapshot()
    .then((setup) => {
      const stored = setup.state.webSearchEnabled;
      if (typeof stored === "boolean" && stored !== current) {
        current = stored;
        emit();
      }
    })
    .catch(() => undefined);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  load();
  return () => {
    listeners.delete(listener);
  };
}

/** Adopt a value written elsewhere. Does not persist: the caller already did. */
export function syncWebSearch(enabled: boolean): void {
  if (enabled === current) return;
  current = enabled;
  emit();
}

/** Change it here and write it through, so chat and the office move together. */
export function setWebSearchEnabled(enabled: boolean): void {
  if (enabled === current) return;
  current = enabled;
  emit();
  void window.office
    .saveLlmSettings({ webSearchEnabled: enabled })
    .catch(() => undefined);
}

export function useWebSearchEnabled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}
