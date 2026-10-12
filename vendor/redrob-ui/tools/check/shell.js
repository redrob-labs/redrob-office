#!/usr/bin/env node
'use strict';

/**
 * Behaviour of AppShell's folded state that the parity gate cannot see, because the reference preview
 * renders the shell open: `asideFolded` stays reachable when folded, folded nav links get the DS
 * tooltip instead of a native `title`, and an open shell (or one without `asideFolded`) renders the
 * same markup as before.
 *
 *   node tools/check/shell.js      (after yarn build)
 */

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { AppShell } = require(require('path').join(__dirname, '..', '..', 'dist', 'index.js'));

const ok = (c, m) => {
  if (!c) {
    console.error('FAIL', m);
    process.exitCode = 1;
  } else console.log('ok  ', m);
};
const icon = React.createElement('svg', { width: 16, height: 16 });
const nav = [
  { id: 'chat', label: 'Chat', href: '/chat', icon, current: true },
  { id: 'runs', label: 'Runs', href: '/runs', icon, meta: 3 },
];
const base = { product: 'Desk', collapsible: true, nav, aside: React.createElement('b', null, 'FULL-ACCOUNT') };
const render = (p) => renderToStaticMarkup(React.createElement(AppShell, Object.assign({}, base, p)));

const folded = render({ collapsed: true, asideFolded: React.createElement('i', null, 'AVATAR-ONLY') });
ok(folded.includes('rr-shell--folded') && folded.includes('rr-shell__aside--folded') && folded.includes('AVATAR-ONLY'),
  'folded shell renders asideFolded');
ok(folded.includes('rr-shell__navtip') && folded.includes('role="tooltip"') && folded.includes('Runs (3)'),
  'folded nav links carry the DS tooltip with label and meta');
ok(!/<a [^>]*title=/.test(folded), 'folded nav links no longer use a native title');
ok(/aria-current="page"/.test(folded), 'current link still marked');

const open = render({ collapsed: false, asideFolded: React.createElement('i', null, 'AVATAR-ONLY') });
ok(!open.includes('rr-shell__navtip') && !open.includes('role="tooltip"'), 'open shell: no tooltip wrappers');
ok(open.includes('FULL-ACCOUNT'), 'open shell keeps aside');

const plain = render({ collapsed: false });
ok(!plain.includes('rr-shell__aside--folded'), 'no asideFolded prop: no folded aside markup');
const plainFolded = render({ collapsed: true });
ok(!plainFolded.includes('rr-shell__aside--folded'), 'folded without asideFolded: as before, nothing extra');

// windowInset / dragRegion: custom properties and classes only when asked for.
const inset = render({ collapsed: false, windowInset: { top: 28, end: 140 }, dragRegion: true });
ok(inset.includes('rr-shell--inset') && inset.includes('--rr-shell-inset-top:28px') && inset.includes('--rr-shell-inset-end:140px') && inset.includes('--rr-shell-inset-end-h:40px'),
  'windowInset sets the inset custom properties (endHeight defaults to 40)');
ok(inset.includes('rr-shell--drag'), 'dragRegion marks the shell');
const noInset = render({ collapsed: false });
ok(!/rr-shell--inset|rr-shell--drag|style=/.test(noInset.split('>')[0]), 'no windowInset/dragRegion: no class, no inline style on the root');
const css = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'dist', 'styles', 'system.css'), 'utf8');
ok(/\.rr-shell--drag \.rr-shell__brand[^{]*\{[^}]*app-region: drag/.test(css) && /app-region: no-drag/.test(css), 'drag region keeps its controls clickable');

// Console is the eighth product. It wears the brand ramp, so its wash must resolve to Redrob Blue's
// steps rather than to an undeclared property that would silently drop the rail's identity.
const consoleShell = render({ product: 'Redrob Console', collapsed: false });
ok(/data-product="console"/.test(consoleShell), 'product="Redrob Console" sets data-product="console"');
ok(!/data-product=/.test(render({ product: 'Nonesuch', collapsed: false })), 'an unknown product is still dropped');
ok(/\.rr-shell\[data-product="console"\][^{]*\{[^}]*--product-wash: var\(--product-console-wash\)/.test(css), 'console shell maps its wash');
const tokensCss = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'dist', 'styles', 'tokens.css'), 'utf8');
ok(/--product-console-1: var\(--blue-1\)/.test(tokensCss) && /--product-console-wash: var\(--product-console-10\)/.test(tokensCss), 'console ramp is the brand ramp, with a dark wash');

// onNavigate: plain clicks go to the app's router; modified clicks stay with the browser.
{
  const calls = [];
  // Hooks need a render in progress, so the tree is captured from inside one.
  const tree = (p) => {
    let out = null;
    const Probe = () => { out = AppShell(p); return null; };
    renderToStaticMarkup(React.createElement(Probe));
    return out;
  };
  const el = tree({ nav, onNavigate: (href, e) => { calls.push(href); e.preventDefault(); } });
  const find = (n, pred) => {
    if (!n || typeof n !== 'object') return null;
    if (Array.isArray(n)) { for (const c of n) { const r = find(c, pred); if (r) return r; } return null; }
    if (pred(n)) return n;
    return find(n.props && n.props.children, pred);
  };
  const a = find(el, (n) => n.type === 'a' && n.props && n.props.href === '/runs');
  let prevented = false;
  const ev = (o) => Object.assign({ defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault() { prevented = true; } }, o);
  a && a.props.onClick(ev({}));
  ok(calls[0] === '/runs' && prevented, 'onNavigate receives a plain click and can take it over');
  a && a.props.onClick(ev({ metaKey: true }));
  ok(calls.length === 1, 'a modified click is left to the browser');
  const none = find(tree({ nav }), (n) => n.type === 'a' && n.props && n.props.href === '/runs');
  ok(none && none.props.onClick === undefined, 'without onNavigate the links carry no handler');
}
