// Cross-platform replacement for the POSIX `mkdir -p … && cp src/styles/*.css …`
// tail of the build script. The original glob copy fails on Windows (cmd's cp
// shim rejects the glob), leaving dist/styles and dist/fonts empty. This copies
// the style and font assets into dist/ with Node so the build is portable.
//
// Vendored change (not in upstream @redrob-labs/ui): added when the design
// system was vendored into this UI-only workspace so `pnpm --filter
// @redrob-labs/ui build` succeeds on Windows, macOS and Linux alike.
import { mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const copyByExt = (fromRel, toRel, exts) => {
  const from = join(root, fromRel);
  const to = join(root, toRel);
  mkdirSync(to, { recursive: true });
  let n = 0;
  for (const name of readdirSync(from)) {
    if (exts.some((e) => name.endsWith(e))) {
      copyFileSync(join(from, name), join(to, name));
      n++;
    }
  }
  console.log(`copy-assets: ${n} file(s) ${fromRel} -> ${toRel}`);
};

copyByExt('src/styles', 'dist/styles', ['.css', '.json']);
copyByExt('src/fonts', 'dist/fonts', ['.woff2']);
