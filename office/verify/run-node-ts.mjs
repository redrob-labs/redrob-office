/**
 * Bundle a TS entry (with its npm deps inlined) and run it on plain Node — used
 * for the demo seeders, which pull in exceljs and the document adapters that a
 * default SSR build would leave external and unresolvable from a temp dir.
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const require_ = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const entry = process.argv[2];
if (!entry) {
  console.error("Usage: node verify/run-node-ts.mjs <entry.ts> [args...]");
  process.exit(2);
}
const outDir = mkdtempSync(join(tmpdir(), "redrob-node-ts-"));

function stubImageDeps() {
  const ID = "\0redrob-no-image";
  return {
    name: "redrob-stub-image-deps",
    enforce: "pre",
    resolveId(source) {
      if (/^(sharp|@img\/)/.test(source)) return ID;
      const path = source.replace(/\\/g, "/");
      return /\/node_modules\/(sharp|@img)\//.test(path) ? ID : null;
    },
    load(id) {
      if (id !== ID) return null;
      return `function unavailable(){throw new Error("no image work in seeders");}
export default unavailable;
export { unavailable as cache, unavailable as concurrency, unavailable as simd };`;
    },
  };
}

await build({
  root,
  configFile: false,
  logLevel: "warn",
  plugins: [stubImageDeps()],
  ssr: { noExternal: true },
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
      external: ["electron", ...builtinModules, ...builtinModules.map((n) => `node:${n}`)],
    },
  },
});

const child = spawn(process.execPath, [join(outDir, "entry.mjs"), ...process.argv.slice(3)], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 1));
