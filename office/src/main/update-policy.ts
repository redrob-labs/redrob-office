import type { UpdateStatusEvent } from "../shared/office-api.js";

/** Electron can report fractional or out-of-range progress during retries. */
export function updateDownloadPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Status to show when a check resolves before Electron emits its event. */
export function checkedUpdateStatus(
  currentVersion: string,
  offeredVersion?: string,
): UpdateStatusEvent {
  if (!offeredVersion || offeredVersion === currentVersion) {
    return { kind: "current", version: currentVersion };
  }
  return { kind: "available", version: offeredVersion };
}
