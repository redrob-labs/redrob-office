#!/usr/bin/env node
'use strict';

/**
 * Every `var(--x)` in the shipped stylesheets names a property something declares.
 *
 *   node tools/check/references.js
 *
 * WHAT THIS CAUGHT. `system.css` gives each product's AppShell rail its identity wash:
 *
 *   .rr-shell[data-product="browser"] { --product-wash: var(--product-browser-wash); ... }
 *   .rr-shell[data-product] .rr-shell__side {
 *     background-image: linear-gradient(180deg, var(--product-wash) 0, transparent 132px);
 *   }
 *
 * `--product-browser-wash` was declared nowhere. The delivery's `tokens.json` defines 119 product
 * tokens; its `tokens.css` - the sheet every consumer actually loads, and the one this package
 * inherited - declared none of them. So 28 of those declarations were invalid, were dropped, and
 * every product rail in every consuming app lost its wash. Twenty-eight silent failures.
 *
 * Nothing else could see it. CSS has no compiler; an undeclared custom property is not a parse error,
 * it invalidates its own declaration AT COMPUTED-VALUE TIME and the cascade moves on. The sheet still
 * loads, the rail still renders, `tsc` passes, the parity harness passes (both sides of the comparison
 * read the same broken sheet and agree), and a reviewer sees a plausible `var()` name.
 *
 * WHY THE FALLBACK DISTINCTION IS THE WHOLE GATE. `var(--x)` with nothing declaring `--x` is a defect.
 * `var(--x, 12px)` with nothing declaring `--x` is CORRECT - it is how a consumer is invited to
 * override. Eleven properties here are exactly that (`--logo-scale`, `--work-max`, `--space-24`, the
 * scroller pair, ...). A gate that cannot tell them apart reports 39 findings, 11 of them noise, and
 * gets switched off. They are told apart by a comma at depth one inside the `var(`.
 */

const fs = require('fs');
const path = require('path');
const { stripComments, declarations, references } = require('./css');

const STYLES = path.join(__dirname, '..', '..', 'src', 'styles');
const SHEETS = ['tokens.css', 'system.css', 'preflight.css'];

/**
 * Properties a COMPONENT sets at runtime through an inline style. They are legitimately absent from
 * every stylesheet, so each one names the file that sets it and is asserted to still do so - otherwise
 * this allowlist becomes the place undeclared properties go to hide.
 */
const RUNTIME_SET = {
  '--rr-reveal-mask': 'src/components/MarkReveal/MarkReveal.tsx',
};

const ROOT = path.join(__dirname, '..', '..');
const declared = new Set();
const sheets = new Map();
let removed = 0;
let kept = 0;

for (const name of SHEETS) {
  const raw = fs.readFileSync(path.join(STYLES, name), 'utf8');
  const stripped = stripComments(raw);
  removed += stripped.removed;
  kept += stripped.kept;
  sheets.set(name, stripped.css);
  for (const d of declarations(stripped.css)) declared.add(d.name);
}

/* The comment stripper is the one part of this that can fail silently in the direction of PASSING, so
   its output is measured rather than trusted: a stripper that ate the sheet would leave no `var()` to
   check and this gate would report a clean run over nothing. */
const failures = [];
if (kept < 0.55 * (kept + removed)) {
  failures.push(
    `the comment stripper removed ${removed} of ${kept + removed} bytes, which is too much to be ` +
      `comments - it is eating code, and every check below is reading a gutted sheet`,
  );
}

let checked = 0;
const withFallback = new Set();

for (const [name, css] of sheets) {
  for (const ref of references(css)) {
    if (declared.has(ref.name)) continue;

    if (ref.hasFallback) {
      withFallback.add(ref.name);
      continue;
    }

    if (ref.name in RUNTIME_SET) {
      const owner = path.join(ROOT, RUNTIME_SET[ref.name]);
      if (!fs.existsSync(owner) || !fs.readFileSync(owner, 'utf8').includes(ref.name)) {
        failures.push(
          `${name}:${ref.line}  var(${ref.name}) is allowlisted as runtime-set by ` +
            `${RUNTIME_SET[ref.name]}, which no longer sets it`,
        );
      }
      continue;
    }

    checked += 1;
    failures.push(
      `${name}:${ref.line}  var(${ref.name}) names a property nothing declares, so this whole ` +
        `declaration is invalid and is dropped`,
    );
  }
  checked += 0;
}

const total = [...sheets.values()].reduce((n, css) => n + references(css).length, 0);

if (failures.length > 0) {
  for (const f of failures) console.log(`  broken  ${f}`);
  console.log(`\n${total} var() references checked, ${failures.length} unresolved`);
  process.exit(1);
}

console.log(
  `${total} var() references in ${SHEETS.length} sheets all resolve ` +
    `(${declared.size} properties declared, ${withFallback.size} overridable with a fallback, ` +
    `${Object.keys(RUNTIME_SET).length} set at runtime)`,
);
