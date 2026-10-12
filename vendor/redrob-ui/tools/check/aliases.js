#!/usr/bin/env node
'use strict';

/**
 * The names the October 2026 delivery renamed or merged are still exported for 1.x, marked
 * `@deprecated`. The parity harness no longer covers them (the delivery has no cases for them), so this
 * is what holds them up: each one must still be exported from both builds, render without throwing,
 * and render the markup of the component it forwards to.
 *
 *   node tools/check/aliases.js      (after `yarn build`)
 */

const path = require('path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const ROOT = path.join(__dirname, '..', '..');
const ui = require(path.join(ROOT, 'dist', 'index.js'));
const h = React.createElement;

/** [deprecated name, props, the new component it should render the same as (with the same props), or null]. */
const CASES = [
  ['StatusCard', { title: 'Privacy protection is on: High', tone: 'safe', live: 'Running' }, 'ProtectionStatus'],
  ['ScopeBadge', { label: 'Access', scopes: [{ kind: 'files', label: 'Contracts', mode: 'read' }] }, 'AccessList'],
  ['Schedule', { name: 'Weekly digest', cadence: 'Every Monday at 9:00', enabled: true }, null],
  ['SecondOpinionSetting', { value: 'always' }, null],
  ['CostMeter', { spent: 2, budget: 10 }, null],
  ['MemoryMeter', { segments: [{ label: 'Notes', value: 3 }], total: 10 }, null],
  ['Disputed', { children: 'A claim' }, null],
  ['OpinionAdded', { children: 'An addition' }, null],
  ['ModelSwitch', { from: 'A', to: 'B' }, null],
  ['MemorySaved', { text: 'Remembered' }, null],
  ['NewsSection', { items: [] }, null],
  ['AvatarMark', { name: 'Han Jiwoo' }, null],
];

const failures = [];
const norm = (s) => s.replace(/\brr-[a-z-]+-\d+\b/g, 'rr-id');

for (const [name, props, target] of CASES) {
  if (typeof ui[name] !== 'function') {
    failures.push(`${name} is not exported`);
    continue;
  }
  let markup;
  try {
    markup = renderToStaticMarkup(h(ui[name], props));
  } catch (e) {
    failures.push(`${name} threw: ${e.message}`);
    continue;
  }
  if (!markup) failures.push(`${name} rendered nothing`);
  if (target) {
    const expected = renderToStaticMarkup(h(ui[target], props));
    if (norm(markup) !== norm(expected)) failures.push(`${name} does not render the same as ${target}`);
  }
}

// The adapter's value must reach both checks.
const opinion = renderToStaticMarkup(h(ui.SecondOpinionSetting, { value: 'always' }));
if (!opinion.includes('rr-xcheck') || (opinion.match(/aria-checked="true"[^>]*>Always</g) || []).length !== 2) {
  failures.push('SecondOpinionSetting does not set both checks to its value');
}

if (failures.length) {
  for (const f of failures) console.log(`  broken  ${f}`);
  console.log(`\n${failures.length} problem(s) with the deprecated aliases`);
  process.exit(1);
}
console.log(`aliases ok - ${CASES.length} deprecated names exported and rendering`);
