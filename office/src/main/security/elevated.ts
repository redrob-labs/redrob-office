/**
 * Elevated mode — single entrypoint that bypasses sandbox *mode* only.
 * Hard denylist and path checks still apply. Default disabled; each call
 * must be approved by the caller before invoking.
 */

export type ElevatedRunner<T> = () => Promise<T>;

let elevatedEnabled = false;

export function setElevatedEnabled(enabled: boolean): void {
  elevatedEnabled = Boolean(enabled);
}

export function isElevatedEnabled(): boolean {
  return elevatedEnabled;
}

export interface ElevatedCallMeta {
  tool: string;
  reason?: string;
}

/**
 * Run work with elevated=true audit context. Does NOT skip denylist.
 * Caller must have already obtained per-call user approval.
 */
export async function runElevated<T>(
  meta: ElevatedCallMeta,
  approved: boolean,
  runner: ElevatedRunner<T>,
): Promise<{ elevated: true; result: T }> {
  if (!elevatedEnabled) {
    throw new Error("Elevated mode is disabled");
  }
  if (!approved) {
    throw new Error(`Elevated call to ${meta.tool} was not approved`);
  }
  const result = await runner();
  return { elevated: true, result };
}
