/**
 * Pure, side-effect-free helpers for scripts/ensure-electron.mjs, split out so
 * they can be unit tested without downloading Electron or touching the pnpm
 * store. The runnable script wires these to the real filesystem and
 * child_process; here we only decide, given facts, what should happen.
 */

/**
 * Decide whether a resolved Electron install already has a usable binary.
 *
 * @param {object} facts
 * @param {boolean} facts.pathFileExists whether path.txt exists
 * @param {string}  facts.pathFileContents trimmed contents of path.txt ("" if absent)
 * @param {boolean} facts.distBinaryExists whether dist/<pathFileContents> exists
 * @param {string=} facts.overrideDistPath value of ELECTRON_OVERRIDE_DIST_PATH
 * @returns {boolean}
 */
export function isBinaryPresent(facts) {
  const { pathFileExists, pathFileContents, distBinaryExists, overrideDistPath } = facts;
  if (!pathFileExists) return false;
  if (!pathFileContents || !pathFileContents.trim()) return false;
  // An explicit override dist path means the caller is pointing Electron at a
  // binary we do not manage; trust it and never re-download.
  if (overrideDistPath) return true;
  return distBinaryExists;
}

/**
 * Decide the action for one consumer given what resolution + the filesystem
 * report. Kept pure so the branch matrix is testable.
 *
 * @param {object} facts
 * @param {boolean} facts.resolved whether an electron package resolved from the consumer
 * @param {boolean} facts.binaryPresent result of isBinaryPresent()
 * @param {boolean} facts.installerExists whether install.js exists in that package
 * @returns {'skip-no-dep'|'ok-present'|'run-installer'|'fail-no-installer'}
 */
export function decideAction(facts) {
  if (!facts.resolved) return "skip-no-dep";
  if (facts.binaryPresent) return "ok-present";
  if (!facts.installerExists) return "fail-no-installer";
  return "run-installer";
}
