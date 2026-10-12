#!/usr/bin/env node
'use strict';

/**
 * Generated ids must not depend on how many requests the server has already rendered.
 *
 * Parity cannot see this: it normalises every `rr-<kind>-<n>` to `rr-id` and loads a fresh build per
 * case, so a module-level counter that keeps growing across renders looks identical to a stable id.
 * A Next.js server is one long-lived process, though, and when the second request's ThemeSwitch said
 * `name="rr-theme-4"` while the browser rendered `rr-theme-1`, React reported a hydration mismatch.
 * This renders the same tree twice in one process with the server renderer and requires the same
 * bytes.
 *
 *   node tools/check/ssr-ids.js      (after yarn build)
 */

const path = require('path');
const React = require('react');
const { renderToString } = require('react-dom/server');
const { ThemeSwitch } = require(path.join(__dirname, '..', '..', 'dist', 'index.js'));

const ok = (c, m) => {
  if (!c) {
    console.error('FAIL', m);
    process.exitCode = 1;
  } else console.log('ok  ', m);
};

const page = () => React.createElement('div', null, React.createElement(ThemeSwitch, { defaultValue: 'system' }));
const first = renderToString(page());
const second = renderToString(page());
ok(first === second, 'two renderToString calls in one process produce identical ThemeSwitch markup');
if (first !== second) console.error(`  first:  ${first.slice(0, 300)}\n  second: ${second.slice(0, 300)}`);

const names = [...first.matchAll(/ name="([^"]*)"/g)].map((m) => m[1]);
ok(names.length === 3 && names.every((n) => n === names[0]), 'the three options share one radio name');
ok(/^rr-theme-\d+$/.test(names[0] || ''), `the name is a plain token usable as an id, a name and in a selector (${names[0]})`);

const pair = renderToString(
  React.createElement('div', null, React.createElement(ThemeSwitch, null), React.createElement(ThemeSwitch, null)),
);
const pairNames = new Set([...pair.matchAll(/ name="([^"]*)"/g)].map((m) => m[1]));
ok(pairNames.size === 2, 'two switches on one page get different names');
