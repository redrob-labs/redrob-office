#!/usr/bin/env node
/**
 * Ensure every Electron install used by the workspace has its platform binary.
 *
 * Why this exists
 * ---------------
 * The monorepo runs two Electron majors side by side: `@genoffice/shell` (the
 * office suite, Electron 43) and `@redrob/office` (the recruiting app, Electron
 * 35). pnpm gates package build scripts, and on a fresh
 * `pnpm install --frozen-lockfile` an Electron package can end up WITHOUT its
 * downloaded binary (no `dist/` and no `path.txt`). Electron's own `index.js`
 * only re-downloads at require time, so `pnpm dev` for the shell then dies with
 * `Error: Electron uninstall...` before it ever reaches that code path.
 *
 * This script closes the gap deterministically: for each workspace package that
 * declares an `electron` devDependency, it resolves that package's real
 * `electron` folder via Node module resolution (never a hardcoded pnpm store
 * path), and if the binary is missing it runs that install's own `install.js`.
 * It is idempotent (an install with a present binary is skipped) and touches
 * only Electron, so it never triggers a `better-sqlite3` native build.
 *
 * Run as the root `postinstall` hook and manually via `pnpm ensure:electron`.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decideAction, isBinaryPresent } from "./ensure-electron-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

/**
 * Workspace packages that consume Electron directly. Each is resolved from its
 * own directory so pnpm's per-package store hands us the exact version that
 * package depends on (shell -> 43, office -> 35), without us naming a version
 * or a store path.
 */
const CONSUMERS = ["apps/shell", "office"];

/** @param {string} electronDir absolute path to a resolved `electron` package */
function binaryPresent(electronDir) {
  const pathFile = join(electronDir, "path.txt");
  const pathFileExists = existsSync(pathFile);
  const pathFileContents = pathFileExists ? readFileSync(pathFile, "utf-8").trim() : "";
  return isBinaryPresent({
    pathFileExists,
    pathFileContents,
    distBinaryExists: pathFileContents
      ? existsSync(join(electronDir, "dist", pathFileContents))
      : false,
    overrideDistPath: process.env.ELECTRON_OVERRIDE_DIST_PATH,
  });
}

/** Resolve the `electron` package folder as seen from a consumer dir. */
function resolveElectronDir(consumerRelDir) {
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

function ensureFor(consumerRelDir) {
  const electronDir = resolveElectronDir(consumerRelDir);
  if (!electronDir) {
    console.log(`[ensure-electron] ${consumerRelDir}: no electron dependency, skipping`);
    return true;
  }
  const version = (() => {
    try {
      return JSON.parse(readFileSync(join(electronDir, "package.json"), "utf-8")).version;
    } catch {
      return "unknown";
    }
  })();
  const installer = join(electronDir, "install.js");
  const action = decideAction({
    resolved: true,
    binaryPresent: binaryPresent(electronDir),
    installerExists: existsSync(installer),
  });
  if (action === "ok-present") {
    console.log(`[ensure-electron] ${consumerRelDir}: electron ${version} binary present`);
    return true;
  }
  if (action === "fail-no-installer") {
    console.warn(
      `[ensure-electron] ${consumerRelDir}: electron ${version} missing binary and has no install.js (${electronDir})`,
    );
    return false;
  }
  console.log(
    `[ensure-electron] ${consumerRelDir}: electron ${version} binary missing, running install.js`,
  );
  const result = spawnSync(process.execPath, [installer], {
    cwd: electronDir,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(
      `[ensure-electron] ${consumerRelDir}: electron ${version} install.js exited ${result.status ?? result.signal}`,
    );
    return false;
  }
  return binaryPresent(electronDir);
}

let ok = true;
// De-dupe by resolved electron dir so two consumers on the same version only
// run once.
const seen = new Set();
for (const consumer of CONSUMERS) {
  const dir = resolveElectronDir(consumer);
  if (dir && seen.has(dir)) {
    console.log(`[ensure-electron] ${consumer}: shares electron with an earlier consumer, skipping`);
    continue;
  }
  if (dir) seen.add(dir);
  ok = ensureFor(consumer) && ok;
}

if (!ok) {
  console.error(
    "[ensure-electron] one or more Electron binaries could not be ensured; `pnpm dev` may fail until network install succeeds",
  );
  // Do not hard-fail install: a machine that only runs typecheck/test/dev:web
  // (no GUI) does not need the binary, and CI without network should still
  // resolve the workspace. `pnpm dev` self-reports the missing binary.
  process.exit(0);
}
console.log("[ensure-electron] all workspace Electron binaries present");
