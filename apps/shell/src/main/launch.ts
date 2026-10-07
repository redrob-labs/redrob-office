/**
 * Whether the launch screen plays: once per app session, never again on a
 * renderer reload. `GENOFFICE_LAUNCH=skip` turns it off for tooling that
 * captures Home (the visual suite).
 */
export function shouldShowLaunch({ shown, env }: { shown: boolean; env?: string }): boolean {
  if (env === 'skip') return false
  return !shown
}
