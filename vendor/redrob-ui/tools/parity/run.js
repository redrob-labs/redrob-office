#!/usr/bin/env node
'use strict';
/**
 * Compares our build against the design system's reference bundle.
 *
 *   node tools/parity/run.js                 every exported component, then every composition
 *   node tools/parity/run.js Button PageHome  only those
 *   node tools/parity/run.js --self          reference against itself (harness sanity check)
 *
 * Exits non-zero when anything is not `pass`, so it can gate CI. `no-case` counts as a failure:
 * a component with no preview has nothing holding it to the spec, and silence there is how an
 * unverified component reaches a release.
 */

const {
  loadReference,
  loadOurs,
  compare,
  exportedNames,
  compositionNames,
  prototypeCompositions,
  STATIC_COMPOSITIONS,
} = require('./harness');

const args = process.argv.slice(2);
const selfCheck = args.includes('--self');
const quiet = args.includes('--quiet');
const names = args.filter((a) => !a.startsWith('--'));

const reference = loadReference();
const ours = selfCheck ? loadReference() : loadOurs();

/**
 * Two groups, reported separately, because they answer different questions: the components are our
 * public surface, the compositions are whether pages built out of that surface still match. A single
 * merged count would hide which of the two broke.
 */
const groups = names.length > 0
  ? [{ label: 'named', targets: names }]
  : [
      { label: 'components', targets: exportedNames() },
      { label: 'compositions', targets: compositionNames() },
    ];

const order = ['pass', 'differs', 'threw', 'reference-threw', 'no-case'];
const lines = [];
let failures = 0;

for (const group of groups) {
  const results = group.targets.map((name) => compare(name, reference, ours));
  const tally = {};
  for (const r of results) tally[r.status] = (tally[r.status] || 0) + 1;

  for (const r of results) {
    if (r.status === 'pass') {
      if (!quiet) console.log(`  pass      ${r.name} (${r.bytes} bytes)`);
      continue;
    }
    console.log(`  ${r.status.padEnd(9)} ${r.name}`);
    if (r.error) console.log(`            ${r.error}`);
    if (r.diff) {
      console.log(`            first difference at byte ${r.diff.at}`);
      console.log(`            reference: ${r.diff.reference}`);
      console.log(`            ours:      ${r.diff.ours}`);
    }
  }

  const summary = order.filter((k) => tally[k]).map((k) => `${tally[k]} ${k}`).join(', ');
  lines.push(`${results.length} ${group.label} compared: ${summary}`);
  failures += results.filter((r) => r.status !== 'pass').length;
}

console.log('');
for (const line of lines) console.log(line);
if (names.length === 0 && STATIC_COMPOSITIONS.size > 0) {
  console.log(`not compared: ${[...STATIC_COMPOSITIONS].join(', ')} (static page, no script to run)`);
}
if (names.length === 0) {
  const prototypes = prototypeCompositions();
  if (prototypes.length > 0) {
    console.log(`not compared: ${prototypes.length} screens that load a whole prototype app (${prototypes.join(', ')})`);
  }
}

if (failures > 0) {
  console.log(`${failures} not at parity with the reference bundle`);
  process.exit(1);
}
