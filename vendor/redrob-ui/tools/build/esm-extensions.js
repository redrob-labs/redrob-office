#!/usr/bin/env node
'use strict';

/**
 * Rewrites the extensionless relative specifiers in `dist/esm` to explicit paths.
 *
 *   node tools/build/esm-extensions.js
 *
 * `tsc` copies a specifier through verbatim: `from './components/Mark/Mark'` stays that way. Bundlers
 * resolve it, so a Vite or Next consumer would never notice - but Node's own ESM resolver does not.
 * It requires the extension and does not look for `index.js` in a directory, so `node --input-type=module
 * -e "import('@redrob-labs/ui')"` fails on the first relative import with ERR_MODULE_NOT_FOUND. A
 * package whose `import` condition only works inside a bundler is a package that breaks the moment
 * someone writes a script, a test, or an SSR entry point that does not go through one.
 *
 * Resolution is done against the EMITTED tree on disk, not the source tree, and not by string rule.
 * `./icons` is a directory in `src` (`src/icons/index.tsx`) while every one of the other 180 relative
 * specifiers is a file; a rule that appended `.js` everywhere would produce `./icons.js`, which does
 * not exist, and a rule that appended `/index.js` everywhere would break the other 180. Asking the
 * filesystem gets both right and keeps getting them right when the layout changes.
 *
 * An unresolvable specifier is a hard failure. Rewriting what can be rewritten and leaving the rest
 * would ship a package that imports fine until the one path nobody exercised.
 */

const fs = require('fs');
const path = require('path');

const ESM_DIR = path.join(__dirname, '..', '..', 'dist', 'esm');

if (!fs.existsSync(ESM_DIR)) {
  console.error('dist/esm is missing. Run the ESM tsc pass first.');
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** Both `import`/`export ... from '…'` and a bare side-effect `import '…'`. */
const SPECIFIER = /(\bfrom\s*|\bimport\s*)(['"])(\.[^'"]*)\2/g;

const files = walk(ESM_DIR);
const failures = [];
let rewritten = 0;
let touched = 0;

for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');

  const after = before.replace(SPECIFIER, (match, lead, quote, spec) => {
    // Already explicit. `.css` appears here too: a stylesheet import must keep its own extension.
    if (/\.(js|mjs|cjs|json|css)$/.test(spec)) return match;

    const target = path.resolve(path.dirname(file), spec);

    if (fs.existsSync(`${target}.js`)) {
      rewritten++;
      return `${lead}${quote}${spec}.js${quote}`;
    }

    if (fs.existsSync(path.join(target, 'index.js'))) {
      rewritten++;
      return `${lead}${quote}${spec.replace(/\/$/, '')}/index.js${quote}`;
    }

    failures.push(`${path.relative(ESM_DIR, file)}: ${spec} resolves to neither ${spec}.js nor ${spec}/index.js`);
    return match;
  });

  if (after !== before) {
    fs.writeFileSync(file, after);
    touched++;
  }
}

if (failures.length > 0) {
  for (const f of failures) console.error(`  unresolved  ${f}`);
  console.error(`\n${failures.length} specifier(s) could not be resolved against dist/esm.`);
  process.exit(1);
}

// `dist/esm/package.json` is what tells Node these `.js` files are modules. Without it Node reads the
// nearest package.json, finds no `"type"`, and treats them as CommonJS - so every `export` in the tree
// is a syntax error at parse time. The `exports` map alone does not do this; the type marker must sit
// beside the files.
fs.writeFileSync(
  path.join(ESM_DIR, 'package.json'),
  JSON.stringify({ type: 'module', sideEffects: false }, null, 2) + '\n',
);

console.log(`esm: ${rewritten} specifiers made explicit across ${touched} of ${files.length} files`);
