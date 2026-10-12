#!/usr/bin/env node
'use strict';

/**
 * The insight charts have no case in the reference delivery, so the parity gate cannot see them. This
 * renders each one and asserts the behaviour the components exist for: every figure is in text as well as
 * in a mark, a group under the privacy floor shows no number, and the heat bands follow the direction.
 *
 *   node tools/check/insights.js      (after yarn build)
 */

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const path = require('path');
const fs = require('fs');
const ui = require(path.join(__dirname, '..', '..', 'dist', 'index.js'));

const ok = (c, m) => {
  if (!c) {
    console.error('FAIL', m);
    process.exitCode = 1;
  } else console.log('ok  ', m);
};
const html = (C, p) => renderToStaticMarkup(React.createElement(C, p));
const steps = ['Look up', 'Learn', 'Draft', 'Iterate', 'Delegate', 'Orchestrate'].map((name) => ({ name }));

const mix = html(ui.MixBar, { mix: [20, 15, 30, 5, 30, 0], steps, label: 'Your team' });
ok(mix.includes('aria-label="Your team: Look up 20%, Learn 15%, Draft 30%, Iterate 5%, Delegate 30%, Orchestrate 0%"'), 'MixBar names every step in its accessible text');
ok((mix.match(/rr-mix__seg--/g) || []).length === 5, 'MixBar draws no segment for a zero share');
ok(/>20<\/span>/.test(mix) && !/>5<\/span>/.test(mix), 'MixBar prints figures only where they fit');
ok(!/>\d+<\/span>/.test(html(ui.MixBar, { mix: [50, 50], steps, thin: true })), 'thin MixBar prints no figures');

const cols = html(ui.MixColumns, { periods: [[50, 50], [0, 0]], labels: ['Sep 1', 'Sep 8'], steps });
ok((cols.match(/rr-mixcols__col/g) || []).length === 2, 'MixColumns keeps an empty period as an empty column');

ok(html(ui.MixKey, { steps: [{ name: 'Look up', text: 'One question.' }], full: true }).includes('One question.'), 'MixKey full adds the definition');

const bullet = html(ui.BulletBar, { value: 72, target: 85, compare: 78 });
ok(bullet.includes('aria-label="Now 72% · target 85% · Company 78%"'), 'BulletBar reads value, target and comparison');
ok(!html(ui.BulletBar, { value: null, target: 80 }).includes('rr-bullet__value'), 'BulletBar draws no bar for a missing value');

const list = html(ui.BarList, {
  rows: [
    { label: 'Support', value: 64, reference: 50, mark: true },
    { label: 'Legal', value: 99, hidden: true },
    { label: 'Sales', value: 40, href: '/teams/sales' },
  ],
  hiddenLabel: 'Fewer than 3 people',
  referenceLabel: 'Peers',
});
ok(!list.includes('>99<'), 'BarList never prints a hidden row\u2019s figure');
ok(list.includes('rr-barlist__hidden') && list.includes('rr-visually-hidden'), 'BarList says why a row is hidden, to sight and to a screen reader');
ok(/style="width:max\(2px, 100%\)"/.test(list), 'BarList scales to the largest shown value, not a hidden one');
const cents = html(ui.BarList, { rows: [{ label: 'cowork', value: 0.007 }, { label: 'office', value: 0.0035 }] });
ok(/width:max\(2px, 100%\)/.test(cents) && /width:max\(2px, 50%\)/.test(cents), 'BarList scales amounts under one to the largest, not to 1');
ok(list.includes('href="/teams/sales"') && list.includes('rr-barlist__ref') && list.includes('Peers'), 'BarList links rows and draws the reference tick and key');

const cmp = html(ui.CompareBar, { label: 'Kept', value: 70, compare: 64 });
ok(cmp.includes('>70%<') && cmp.includes('Company 64%'), 'CompareBar prints both figures');

const hist = html(ui.Histogram, { bins: [1, 4, 2], labels: ['1-2', '3-5', '6-8'], highlightFrom: 2, alt: 'Runs' });
ok(hist.includes('aria-label="Runs: 1-2: 1, 3-5: 4, 6-8: 2"') && (hist.match(/rr-histogram__bin--high/g) || []).length === 1, 'Histogram names its counts and highlights from the index');

const cell = (diff, up) => html(ui.HeatCell, { diff, up, children: 'x' });
ok(cell(2).includes('rr-heat--zero') && !cell(2).includes('rr-heat--zero-'), 'HeatCell leaves noise unshaded');
ok(cell(10).includes('rr-heat--pos-2') && cell(-20).includes('rr-heat--neg-3'), 'HeatCell bands by distance');
ok(cell(10, false).includes('rr-heat--neg-2'), 'HeatCell flips when lower is better');
ok(cell(10, null).includes('rr-heat--zero') && cell(null).includes('rr-heat--na'), 'HeatCell shades nothing without a direction or a baseline');
ok(/^<td/.test(cell(1)), 'HeatCell is a table cell');

const d = (p) => html(ui.Delta, p);
ok(d({ value: 3.4, suffix: ' pts' }).includes('+3 pts') && d({ value: 3, suffix: ' pts' }).includes('rr-delta--good'), 'Delta rounds and signs a rise');
ok(d({ value: -1, suffix: ' pts', suffixOne: ' pt' }).includes('\u22121 pt'), 'Delta uses the singular unit and a true minus');
ok(d({ value: 4, up: false }).includes('rr-delta--bad') && d({ value: 0.2 }).includes('rr-delta--flat'), 'Delta judges direction and treats a rounded zero as flat');
ok(d({ value: null }) === '', 'Delta renders nothing for a missing change');

ok(html(ui.PrivacyFloor, { minGroup: 5 }).includes('Groups of 5 or more'), 'PrivacyFloor states the floor');

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'dist', 'styles', 'tokens.css'), 'utf8');
ok(['--chart-track', '--ordinal-5', '--ordinal-ink-5', '--heat-pos-3', '--heat-neg-3'].every((t) => (css.match(new RegExp(`${t}:`, 'g')) || []).length === 2), 'insight tokens have a light and a dark value');

// Chart: a crowded axis prints only the labels that fit, and always the latest one.
{
  const labels = Array.from({ length: 31 }, (_, i) => `D${i + 1}`);
  const crowded = html(ui.Chart, { kind: 'bar', labels, series: [{ name: 'Requests', values: labels.map(() => 1) }] });
  const xlab = (crowded.match(/<g class="rr-chart__xlab">([\s\S]*?)<\/g>/) || [])[1] || '';
  const shown = (xlab.match(/<text/g) || []).length;
  ok(shown > 1 && shown <= 11 && xlab.includes('>D31<'), `Chart thins 31 axis labels to ${shown}, keeping the latest`);
  const few = html(ui.Chart, { kind: 'bar', labels: ['Mon', 'Tue', 'Wed'], series: [{ values: [1, 2, 3] }] });
  ok(['Mon', 'Tue', 'Wed'].every((l) => few.includes(`>${l}<`)), 'Chart keeps every label when they fit');
}
