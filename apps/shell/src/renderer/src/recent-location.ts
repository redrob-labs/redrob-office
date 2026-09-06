/**
 * Presentation-only display of a recent file's parent folder (the Location
 * column on Home).
 *
 * The legacy default save folder was `<Documents>/GenOffice`; it is now
 * `<Documents>/Redrob Office`. Files created before the rename keep their real
 * path on disk (we never move a user's files, and never rewrite a stored path),
 * but the Location column must not advertise the old brand. So this is a pure,
 * presentation-only alias: when the parent folder is EXACTLY the legacy default
 * name, show the current one instead. Any other folder name is shown verbatim,
 * including a folder that merely contains the substring "GenOffice" or a nested
 * path segment, so real user folders are never rewritten. The caller keeps the
 * real path for operations and shows it in the row tooltip.
 */

/** The immediate parent folder name of a path, matching the historical logic. */
export function parentDir(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 2] ?? ''
}

/** Exact legacy default save folder basename and its current replacement. */
export const LEGACY_SAVE_DIR = 'GenOffice'
export const CURRENT_SAVE_DIR = 'Redrob Office'

/** The parent folder name to DISPLAY, with the legacy default aliased. */
export function displayParentDir(path: string): string {
  const dir = parentDir(path)
  return dir === LEGACY_SAVE_DIR ? CURRENT_SAVE_DIR : dir
}
