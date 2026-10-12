#!/usr/bin/env node
'use strict';

/**
 * Proves the package's declared entry points actually work, from outside the package.
 *
 *   node tools/check/exports.js
 *
 * An `exports` map is a promise about paths, and nothing in `tsc`, the parity harness or the docs gate
 * reads it. A typo in it is invisible until a consumer in another repository writes
 * `import { Button } from '@redrob-labs/ui'` and gets ERR_PACKAGE_PATH_NOT_EXPORTED - by which point
 * the version is published and the only fix is another release.
 *
 * Three things are checked, and the third is the one that matters:
 *
 *   1. every path the `exports` map names exists on disk;
 *   2. `main`, `module` and `types` point at files that exist;
 *   3. the CommonJS build and the ESM build are LOADED, in separate real Node processes, and their
 *      export lists compared name by name.
 *
 * (3) is not a formality. The ESM half is a second `tsc` pass whose specifiers are rewritten
 * afterwards; a bundler would paper over a bad specifier and Node will not, so loading it here is the
 * only place the difference shows before a consumer finds it. Comparing the two lists catches the
 * quieter failure: a build that emits both halves but where one is missing exports the other has.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const failures = [];
let checkedPaths = 0;

/* ---- 1. the exports map ---------------------------------------------------- */

function checkTarget(subpath, target) {
  // A wildcard subpath names a directory of files, so the check is that the directory exists and is
  // not empty. Asserting a particular file there would hard-code today's contents.
  if (subpath.includes('*')) {
    const dir = path.join(ROOT, path.dirname(target.replace('*', 'x')));
    if (!fs.existsSync(dir)) failures.push(`exports["${subpath}"] -> ${dir} does not exist`);
    else if (fs.readdirSync(dir).length === 0) failures.push(`exports["${subpath}"] -> ${dir} is empty`);
    else checkedPaths++;
    return;
  }

  const full = path.join(ROOT, target);
  if (!fs.existsSync(full)) failures.push(`exports["${subpath}"] -> ${target} does not exist`);
  else checkedPaths++;
}

for (const [subpath, value] of Object.entries(pkg.exports || {})) {
  if (typeof value === 'string') checkTarget(subpath, value);
  else for (const [condition, target] of Object.entries(value)) checkTarget(`${subpath} (${condition})`, target);
}

for (const field of ['main', 'module', 'types']) {
  if (!pkg[field]) continue;
  const full = path.join(ROOT, pkg[field]);
  if (!fs.existsSync(full)) failures.push(`"${field}": ${pkg[field]} does not exist`);
  else checkedPaths++;
}

/* ---- 2. `files` actually carries what `exports` promises ------------------- */

// Everything the map points at must fall under a `files` entry, or `npm pack` ships a package whose
// own exports map references files it did not include. That failure only appears after publishing.
const included = pkg.files || [];
const targets = Object.values(pkg.exports || {}).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v)));
for (const target of targets) {
  const rel = target.replace(/^\.\//, '');
  if (rel === 'package.json') continue;
  if (!included.some((f) => rel === f || rel.startsWith(f.replace(/\/$/, '') + '/'))) {
    failures.push(`exports points at ${target}, which no "files" entry includes`);
  }
}

/* ---- 3. load both halves -------------------------------------------------- */

function loadNames(kind) {
  // A separate process per half, so one module system's registry cannot satisfy the other's import and
  // report a success that would not happen in a consumer.
  const script =
    kind === 'cjs'
      ? `const m = require(${JSON.stringify(path.join(ROOT, pkg.main))}); console.log(JSON.stringify(Object.keys(m)));`
      : `import(${JSON.stringify('file://' + path.join(ROOT, pkg.module))}).then((m) => console.log(JSON.stringify(Object.keys(m))));`;

  try {
    const out = execFileSync(process.execPath, ['--input-type=' + (kind === 'cjs' ? 'commonjs' : 'module'), '-e', script], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(out.trim().split('\n').pop());
  } catch (e) {
    const detail = (e.stderr || e.message || '').trim().split('\n').slice(0, 4).join('\n      ');
    failures.push(`the ${kind === 'cjs' ? 'CommonJS' : 'ESM'} build does not load:\n      ${detail}`);
    return null;
  }
}

const cjs = loadNames('cjs');
const esm = loadNames('esm');

if (cjs && esm) {
  const cjsSet = new Set(cjs);
  const esmSet = new Set(esm);
  // `default` is legitimately present on the ESM namespace of a transpiled module and absent from the
  // CommonJS keys, so it is not a discrepancy.
  const onlyCjs = cjs.filter((n) => !esmSet.has(n) && n !== '__esModule');
  const onlyEsm = esm.filter((n) => !cjsSet.has(n) && n !== 'default');

  if (onlyCjs.length > 0) failures.push(`${onlyCjs.length} export(s) only in CommonJS: ${onlyCjs.slice(0, 8).join(', ')}`);
  if (onlyEsm.length > 0) failures.push(`${onlyEsm.length} export(s) only in ESM: ${onlyEsm.slice(0, 8).join(', ')}`);
}

/* ---- report --------------------------------------------------------------- */

if (failures.length > 0) {
  for (const f of failures) console.log(`  broken  ${f}`);
  console.log(`\n${failures.length} problem(s) with the package's entry points`);
  process.exit(1);
}

console.log(
  `exports ok - ${checkedPaths} paths resolve, both builds load, ` +
    `${cjs ? cjs.filter((n) => n !== '__esModule').length : 0} exports match across cjs and esm`,
);
