/**
 * userData directory naming + one-time, non-destructive migration.
 *
 * The product has been renamed twice: "AI Office" -> "GenOffice" -> "Redrob
 * Office". Each rename changes the userData directory Electron derives from the
 * app's productName (packaged) or the dev-profile name (unpacked), which would
 * otherwise strand a user's settings, chat history, and local data in the old
 * directory. On first launch under the new name we COPY the most recent prior
 * directory into the new one, but only when the new one is missing or empty, so
 * we never overwrite live data and the migration is idempotent.
 *
 * The functions here are pure decisions over filesystem facts; the caller does
 * the actual `app.setPath` and `cpSync`. This keeps the migration unit-testable
 * without Electron or a real disk.
 */

/** Current dev-profile userData directory basename (unpacked runs). */
export const DEV_USER_DATA_DIR = 'Redrob Office Dev'

/**
 * Prior dev-profile directory basenames, newest-first. Used to migrate an
 * existing dev profile forward once. "GenOffice Dev" is the immediately
 * previous name.
 */
export const LEGACY_DEV_USER_DATA_DIRS = ['GenOffice Dev'] as const

/**
 * Prior PACKAGED userData directory basenames, newest-first. Electron derives
 * the packaged dir from productName, so the current one is "Redrob"; the two
 * prior product names were "GenOffice" and "AI Office".
 */
export const LEGACY_PACKAGED_USER_DATA_DIRS = ['GenOffice', 'AI Office'] as const

export interface DirProbe {
  /** true when the directory exists */
  exists: (dir: string) => boolean
  /** number of entries in the directory (0 when empty or unreadable) */
  entryCount: (dir: string) => number
}

/** A target directory is migratable-into when it does not exist or is empty. */
export function targetIsEmpty(target: string, probe: DirProbe): boolean {
  if (!probe.exists(target)) return true
  return probe.entryCount(target) === 0
}

/**
 * Decide the single source directory to copy into `target`, or null when no
 * migration should run.
 *
 * Returns null when: the target already has data (never overwrite / idempotent),
 * or none of the candidate legacy dirs exist. Otherwise returns the first
 * candidate (highest priority / newest) that exists and is non-empty.
 *
 * @param target       the current userData directory (absolute)
 * @param candidates   legacy directories to migrate from, in priority order
 *                     (newest-first), as absolute paths
 * @param probe        filesystem facts
 */
export function planUserDataMigration(
  target: string,
  candidates: readonly string[],
  probe: DirProbe,
): string | null {
  if (!targetIsEmpty(target, probe)) return null
  for (const candidate of candidates) {
    if (candidate === target) continue
    if (probe.exists(candidate) && probe.entryCount(candidate) > 0) return candidate
  }
  return null
}
