/**
 * Starts Electron on a TypeScript entry point.
 *
 * Electron does not honour the `--experimental-strip-types` / `--import` flags
 * a plain `node` run would use, so the entry is bundled first with the Vite the
 * app already builds with and Electron is pointed at the bundle. Same sources,
 * no separate compiled copy checked in.
 *
 * Only the app's own TypeScript is bundled. Every package import is left for
 * Node to resolve at run time, which is what the real main-process build does
 * too — and it is the only arrangement that works under pnpm, where a package's
 * dependencies are visible from that package and nowhere else. Bundling them
 * instead pulled better-sqlite3's CommonJS loader into an ES module, and putting
 * the bundle in the system temp folder left a bare `zod` with nothing to resolve
 * against; either way the script died before its first line ran.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { builtinModules } from "node:module";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const require_ = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);

const entry = process.argv[2];
if (!entry) {
  console.error("Usage: node scripts/run-electron-ts.mjs <entry.ts> [args...]");
  process.exit(2);
}

// Under the package, so the externals above resolve through its node_modules.
const buildsDir = join(root, "out");
mkdirSync(buildsDir, { recursive: true });
const outDir = mkdtempSync(join(buildsDir, "ts-run-"));
process.on("exit", () => rmSync(outDir, { recursive: true, force: true }));

const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

/** Anything that is not a relative or absolute path is somebody else's package. */
function isBarePackage(id) {
  return !id.startsWith(".") && !id.startsWith("\0") && !isAbsolute(id);
}

await build({
  root,
  configFile: false,
  logLevel: "warn",
  build: {
    outDir,
    emptyOutDir: true,
    target: "node20",
    ssr: true,
    minify: false,
    sourcemap: "inline",
    rollupOptions: {
      input: resolve(root, entry),
      output: { format: "esm", entryFileNames: "entry.mjs" },
      external: (id) => builtins.has(id) || id === "electron" || isBarePackage(id),
    },
  },
});

const electron = require_("electron");
const binary = typeof electron === "string" ? electron : String(electron);
const child = spawn(binary, [join(outDir, "entry.mjs"), ...process.argv.slice(3)], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
});
child.on("exit", (code) => process.exit(code ?? 1));
