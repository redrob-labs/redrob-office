#!/usr/bin/env node
/**
 * Optional: force-compile better-sqlite3 against Electron headers.
 * better-sqlite3@13 uses N-API; the shipped win32 prebuild already works on
 * Electron 35+ (N-API 10). Keep this for packaging/debug when prebuilds fail.
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const deskRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(deskRoot, "..");

function resolveElectronVersion() {
  try {
    return require(require.resolve("electron/package.json", { paths: [deskRoot, repoRoot] })).version;
  } catch {
    throw new Error("electron package not found");
  }
}

function resolveSqliteRoot() {
  return dirname(
    require.resolve("better-sqlite3/package.json", {
      paths: [join(repoRoot, "packages/store"), deskRoot, repoRoot],
    }),
  );
}

function resolveNodeGyp() {
  try {
    return require.resolve("node-gyp/bin/node-gyp.js", { paths: [deskRoot, repoRoot] });
  } catch {
    const pnpmRoot = join(repoRoot, "node_modules/.pnpm");
    if (existsSync(pnpmRoot)) {
      for (const entry of readdirSync(pnpmRoot)) {
        if (!entry.startsWith("node-gyp@")) continue;
        const candidate = join(pnpmRoot, entry, "node_modules/node-gyp/bin/node-gyp.js");
        if (existsSync(candidate)) return candidate;
      }
    }
    throw new Error("node-gyp not found; run pnpm install first");
  }
}

const electronVersion = resolveElectronVersion();
const sqliteRoot = resolveSqliteRoot();
const nodeGyp = resolveNodeGyp();

console.log(`Rebuilding better-sqlite3 for Electron ${electronVersion}`);
console.log(`  sqlite: ${sqliteRoot}`);

const result = spawnSync(
  process.execPath,
  [
    nodeGyp,
    "rebuild",
    `--runtime=electron`,
    `--target=${electronVersion}`,
    "--dist-url=https://electronjs.org/headers",
    "--arch=x64",
    "--force_build=1",
  ],
  {
    cwd: sqliteRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_runtime: "electron",
      npm_config_target: electronVersion,
      npm_config_disturl: "https://electronjs.org/headers",
      npm_config_arch: "x64",
    },
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const built = join(sqliteRoot, "build/Release/better_sqlite3.node");
if (!existsSync(built)) {
  console.error(`Expected native binary missing: ${built}`);
  process.exit(1);
}
console.log(`Native binary ready: ${built}`);
