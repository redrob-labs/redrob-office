#!/usr/bin/env node
'use strict';

/**
 * Resolves every relative `url(...)` in the built stylesheets against `dist/`.
 *
 *   node tools/check/assets.js
 *
 * This exists because a stylesheet with a wrong path is not a build error, not a type error and not
 * a parity failure: the markup is identical either way, the browser just quietly falls back to a
 * system font. `tokens.css` shipped for the whole port with 14 `@font-face` rules pointing at
 * `fonts/` - correct at the delivery root, where `tokens.css` sits beside `fonts/`, and wrong once
 * the build copies it into `dist/styles/`. Pretendard is the primary UI face, so every consumer got
 * a fallback font and nothing reported it.
 *
 * Data URLs, absolute/protocol URLs and fragment references are skipped: there is no local file to
 * check. The fragment case is not hypothetical - `system.css` embeds an SVG noise texture as a data
 * URL, and that SVG contains its own `url(%23n)` pointing at a filter defined inside itself.
 */

const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', '..', 'dist');
const STYLES = path.join(DIST, 'styles');

if (!fs.existsSync(STYLES)) {
  console.error('dist/styles is missing. Run `yarn build` first.');
  process.exit(1);
}

const failures = [];
let checked = 0;

for (const file of fs.readdirSync(STYLES).filter((f) => f.endsWith('.css'))) {
  const full = path.join(STYLES, file);
  const css = fs.readFileSync(full, 'utf8');

  for (const match of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
    const raw = match[2].trim();
    if (/^(data:|https?:|\/\/)/i.test(raw)) continue;
    if (/^(#|%23)/.test(raw)) continue;

    checked++;
    // A url() resolves against the stylesheet's own location, not the package root.
    const target = path.resolve(path.dirname(full), raw.split(/[?#]/)[0]);
    if (!fs.existsSync(target)) {
      const line = css.slice(0, match.index).split('\n').length;
      failures.push(`${file}:${line}  url(${raw}) -> ${path.relative(DIST, target)} does not exist`);
    }
  }
}

if (failures.length > 0) {
  for (const f of failures) console.log(`  broken  ${f}`);
  console.log(`\n${checked} relative urls checked, ${failures.length} broken`);
  process.exit(1);
}

console.log(`${checked} relative urls in dist/styles all resolve`);
