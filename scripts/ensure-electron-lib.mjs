/**
 * Pure, side-effect-free helpers for scripts/ensure-electron.mjs, split out so
 * they can be unit tested without downloading Electron or touching the pnpm
 * store. The runnable script wires these to the real filesystem and
 * child_process; here we only decide, given facts, what should happen.
 */

/**
 * The platform-specific executable name Electron's own install.js writes into
 * path.txt. Mirroring it lets us detect a path.txt left by a different-platform
 * cache (or a corrupt one) instead of trusting any non-empty string.
 *
 * @param {NodeJS.Platform} platform
 * @returns {string}
 */
export function expectedPathTxt(platform) {
  if (platform === "darwin") return "Electron.app/Contents/MacOS/Electron";
  if (platform === "win32") return "electron.exe";
  return "electron";
}

/**
 * Decide whether a resolved Electron install already has a usable binary that
 * matches the expected platform layout AND version. This mirrors what
 * electron's install.js guarantees after a successful install:
 *   - path.txt exists and holds the platform's executable path,
 *   - dist/<path.txt> exists,
 *   - dist/version equals the electron package.json version.
 * A mismatch on any of these means the cached binary is stale / wrong / partial
 * and must be (re)installed.
 *
 * ELECTRON_OVERRIDE_DIST_PATH points Electron at an externally-managed binary;
 * we honor it ONLY when that path actually exists on disk (validated by the
 * caller and passed as `overrideDistExists`), never blindly.
 *
 * @param {object} facts
 * @param {boolean} facts.pathFileExists whether path.txt exists
 * @param {string}  facts.pathFileContents trimmed contents of path.txt ("" if absent)
 * @param {boolean} facts.distBinaryExists whether dist/<pathFileContents> exists
 * @param {string}  facts.expectedPathTxt expected path.txt value for this platform
 * @param {string=} facts.distVersion trimmed contents of dist/version ("" if absent)
 * @param {string=} facts.packageVersion the electron package.json version
 * @param {string=} facts.overrideDistPath value of ELECTRON_OVERRIDE_DIST_PATH
 * @param {boolean=} facts.overrideDistExists whether that override path exists on disk
 * @returns {{ present: boolean, reason: string }}
 */
export function inspectBinary(facts) {
  const {
    pathFileExists,
    pathFileContents,
    distBinaryExists,
    expectedPathTxt: expected,
    distVersion,
    packageVersion,
    overrideDistPath,
    overrideDistExists,
  } = facts;

  // An explicit override dist path wins, but only if it actually exists.
  if (overrideDistPath) {
    if (overrideDistExists) return { present: true, reason: "override-dist-path" };
    return { present: false, reason: "override-dist-path-missing" };
  }

  if (!pathFileExists) return { present: false, reason: "no-path-txt" };
  const contents = (pathFileContents || "").trim();
  if (!contents) return { present: false, reason: "empty-path-txt" };
  if (expected && contents !== expected) {
    return { present: false, reason: "path-txt-platform-mismatch" };
  }
  if (!distBinaryExists) return { present: false, reason: "no-dist-binary" };
  // Version check: electron's install.js writes dist/version = "v<major.minor.patch>".
  // Only enforce when we know both sides; a missing dist/version from an older
  // install is treated as a mismatch so we re-materialize a known-good tree.
  if (packageVersion) {
    const wanted = normalizeVersion(packageVersion);
    const have = normalizeVersion(distVersion || "");
    if (!have) return { present: false, reason: "no-dist-version" };
    if (have !== wanted) return { present: false, reason: "version-mismatch" };
  }
  return { present: true, reason: "ok" };
}

/** Strip a leading "v" and surrounding whitespace so "v43.6.0" == "43.6.0". */
function normalizeVersion(v) {
  return String(v || "").trim().replace(/^v/, "");
}

/**
 * Back-compat boolean wrapper around inspectBinary for callers/tests that only
 * need present/absent.
 * @param {Parameters<typeof inspectBinary>[0]} facts
 * @returns {boolean}
 */
export function isBinaryPresent(facts) {
  return inspectBinary(facts).present;
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
