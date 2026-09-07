#!/usr/bin/env node
/**
 * Ensure every Electron install used by the workspace has its platform binary.
 *
 * Why this exists
 * ---------------
 * The monorepo's editor apps share the Electron version used by `@genoffice/shell`.
 * pnpm gates package build scripts, and on a fresh
 * `pnpm install --frozen-lockfile` an Electron package can end up WITHOUT its
 * downloaded binary (no `dist/` and no `path.txt`). Electron's own `index.js`
 * only re-downloads at require time, so `pnpm dev` for the shell then dies with
 * `Error: Electron uninstall...` before it ever reaches that code path.
 *
 * This script closes the gap deterministically: for each workspace package that
 * declares an `electron` devDependency, it resolves that package's real
 * `electron` folder via Node module resolution (never a hardcoded pnpm store
 * path), validates the cached binary matches the expected platform layout AND
 * the electron package version (mirroring electron's install.js), and if it is
 * missing/stale runs that install's own `install.js`. It is idempotent and
 * touches only Electron, so it never triggers a `better-sqlite3` native build.
 *
 * Exit code
 * ---------
 * FAILS NONZERO when any Electron binary could not be ensured, so a
 * `pnpm install` (which runs this as `postinstall`) cannot silently claim a
 * dev-ready tree. A headless/offline machine that will only run
 * typecheck/test/dev:web (no Electron GUI) can opt out explicitly with
 * `REDROB_SKIP_ELECTRON_ENSURE=1`, which downgrades failures to a warning and
 * exits 0. There is no implicit skip.
 *
 * Run as the root `postinstall` hook and manually via `pnpm ensure:electron`
 * (in particular after `pnpm install --ignore-scripts`).
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decideAction, expectedPathTxt, inspectBinary } from "./ensure-electron-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Workspace packages that consume Electron directly. Each is resolved from its
 * own directory so pnpm's per-package store hands us the exact version that
 * package depends on (shell -> 43, office -> 35), without us naming a version
 * or a store path.
 */
const DEFAULT_CONSUMERS = ["apps/shell", "office"];

function readTrimmed(file) {
  try {
    return readFileSync(file, "utf-8").trim();
  } catch {
    return "";
  }
}

/**
 * @param {string} electronDir absolute path to a resolved `electron` package
 * @param {string} version the electron package.json version
 * @param {NodeJS.Platform} platform
 * @param {Record<string,string|undefined>} env
 */
function inspect(electronDir, version, platform, env) {
  const pathFile = join(electronDir, "path.txt");
  const pathFileExists = existsSync(pathFile);
  const pathFileContents = pathFileExists ? readTrimmed(pathFile) : "";
  const override = env.ELECTRON_OVERRIDE_DIST_PATH;
  return inspectBinary({
    pathFileExists,
    pathFileContents,
    distBinaryExists: pathFileContents
      ? existsSync(join(electronDir, "dist", pathFileContents))
      : false,
    expectedPathTxt: expectedPathTxt(platform),
    distVersion: readTrimmed(join(electronDir, "dist", "version")),
    packageVersion: version,
    overrideDistPath: override,
    overrideDistExists: override ? existsSync(override) : false,
  });
}

/** Resolve the `electron` package folder as seen from a consumer dir. */
function resolveElectronDir(root, consumerRelDir) {
  const consumerDir = join(root, consumerRelDir);
  const pkgJson = join(consumerDir, "package.json");
  if (!existsSync(pkgJson)) return null;
  const requireFrom = createRequire(join(consumerDir, "noop.js"));
  let entry;
  try {
    // electron's "main" is index.js; resolving package.json avoids executing
    // index.js (which would itself try to download).
    entry = requireFrom.resolve("electron/package.json");
  } catch {
    return null;
  }
  return dirname(entry);
}

/**
 * @param {object} opts
 * @param {string} opts.root repo (or fixture) root
 * @param {string[]} opts.consumers consumer dirs relative to root
 * @param {NodeJS.Platform} opts.platform
 * @param {Record<string,string|undefined>} opts.env
 * @param {(msg: string) => void} [opts.log]
 * @param {(msg: string) => void} [opts.error]
 * @returns {boolean} true when every consumer's electron is ensured
 */
export function ensureConsumers({
  root,
  consumers,
  platform,
  env,
  log = console.log,
  error = console.error,
}) {
  let ok = true;
  const seen = new Set();
  for (const consumer of consumers) {
    const dir = resolveElectronDir(root, consumer);
    if (dir && seen.has(dir)) {
      log(`[ensure-electron] ${consumer}: shares electron with an earlier consumer, skipping`);
      continue;
    }
    if (dir) seen.add(dir);
    ok = ensureFor({ root, consumer, dir, platform, env, log, error }) && ok;
  }
  return ok;
}

/** @returns {boolean} true when the consumer's electron is ensured. */
function ensureFor({ consumer, dir: electronDir, platform, env, log, error }) {
  if (!electronDir) {
    log(`[ensure-electron] ${consumer}: no electron dependency, skipping`);
    return true;
  }
  let version = "unknown";
  try {
    version = JSON.parse(readFileSync(join(electronDir, "package.json"), "utf-8")).version;
  } catch {
    /* keep "unknown" */
  }

  const before = inspect(electronDir, version, platform, env);
  const installer = join(electronDir, "install.js");
  const action = decideAction({
    resolved: true,
    binaryPresent: before.present,
    installerExists: existsSync(installer),
  });

  if (action === "ok-present") {
    log(`[ensure-electron] ${consumer}: electron ${version} binary present`);
    return true;
  }
  if (action === "fail-no-installer") {
    error(
      `[ensure-electron] ERROR ${consumer}: electron ${version} binary is ${before.reason} ` +
        `and the package has no install.js to repair it (${electronDir}). ` +
        `Delete node_modules/electron and reinstall, or run "npx install-electron --no".`,
    );
    return false;
  }

  log(`[ensure-electron] ${consumer}: electron ${version} binary ${before.reason}, running install.js`);
  const result = spawnSync(process.execPath, [installer], { cwd: electronDir, stdio: "inherit" });
  if (result.status !== 0) {
    error(
      `[ensure-electron] ERROR ${consumer}: electron ${version} install.js exited ` +
        `${result.status ?? result.signal ?? "unknown"} (network required to download the binary).`,
    );
    return false;
  }
  const after = inspect(electronDir, version, platform, env);
  if (!after.present) {
    error(
      `[ensure-electron] ERROR ${consumer}: electron ${version} still ${after.reason} ` +
        `after install.js completed — the binary was not materialized.`,
    );
    return false;
  }
  log(`[ensure-electron] ${consumer}: electron ${version} binary installed`);
  return true;
}

/**
 * Map the ensure result to a process exit code. Nonzero on failure so a
 * `pnpm install` postinstall cannot claim a dev-ready tree; the documented
 * REDROB_SKIP_ELECTRON_ENSURE opt-out downgrades a failure to exit 0.
 * @param {{ ok: boolean, skip: boolean }} r
 * @returns {0|1}
 */
export function exitCodeFor({ ok, skip }) {
  if (ok) return 0;
  if (skip) return 0;
  return 1;
}

/** CLI entry: run against the real repo root and set the process exit code. */
function main() {
  const root = resolve(__dirname, "..");
  const skip = process.env.REDROB_SKIP_ELECTRON_ENSURE === "1";
  const ok = ensureConsumers({
    root,
    consumers: DEFAULT_CONSUMERS,
    platform: process.platform,
    env: process.env,
  });
  const code = exitCodeFor({ ok, skip });
  if (ok) {
    console.log("[ensure-electron] all workspace Electron binaries present");
  } else if (skip) {
    console.warn(
      "[ensure-electron] one or more Electron binaries could not be ensured, but " +
        "REDROB_SKIP_ELECTRON_ENSURE=1 is set: continuing (typecheck/test/dev:web work " +
        "without the binary; `pnpm dev` will not).",
    );
  } else {
    console.error(
      "[ensure-electron] FAILED: one or more Electron binaries are missing/stale and could not be " +
        "installed. `pnpm dev` will not work. Fix the network/install and re-run `pnpm ensure:electron`, " +
        "or set REDROB_SKIP_ELECTRON_ENSURE=1 to opt out on a headless machine that only runs " +
        "typecheck/test/dev:web.",
    );
  }
  return code;
}

// Only run as a CLI, not when imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
