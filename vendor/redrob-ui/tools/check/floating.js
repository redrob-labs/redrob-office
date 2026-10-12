#!/usr/bin/env node
/*
 * Checks the overlay placement every popup uses (src/internal/useFloating.ts), against the built
 * dist. The placement is pure arithmetic on rectangles, so it is checked with stand-in elements
 * rather than a browser: a trigger rect, an overlay with a natural size, and a window size.
 *
 * Each case is a situation that used to cut an overlay off: a panel above a composer with little
 * room above it, a menu at the right edge, a list taller than the space below a field, and an
 * overlay inside a transformed ancestor, which makes `position: fixed` measure from that ancestor.
 */
const path = require('path');
const { placeFloating } = require(path.join(__dirname, '..', '..', 'dist', 'internal', 'useFloating.js'));

function rect(x, y, w, h) {
  return { left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, x, y };
}

/** An overlay with a natural size, drawn from `origin` (the containing block) plus its top/left. */
function overlay(w, h, origin = { x: 0, y: 0 }) {
  const style = {
    removeProperty(name) { delete this[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())]; },
  };
  return {
    style,
    dataset: {},
    getBoundingClientRect() {
      const maxH = style.maxHeight ? parseFloat(style.maxHeight) : Infinity;
      const width = style.width ? parseFloat(style.width) : Math.max(w, style.minWidth ? parseFloat(style.minWidth) : 0);
      return rect(origin.x + parseFloat(style.left || '0'), origin.y + parseFloat(style.top || '0'), width, Math.min(h, maxH));
    },
  };
}

function anchor(x, y, w, h) {
  return { getBoundingClientRect: () => rect(x, y, w, h) };
}

let failed = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ` - ${detail}`}`);
  if (!cond) failed++;
}

function inWindow(r, vw, vh) {
  return r.left >= 7.5 && r.top >= 7.5 && r.right <= vw - 7.5 && r.bottom <= vh - 7.5;
}

function run(vw, vh, a, el, opts) {
  global.window = { innerWidth: vw, innerHeight: vh };
  const side = placeFloating(a, el, opts);
  return { side, r: el.getBoundingClientRect() };
}

// 1. Status panel above a composer in the middle of an empty chat: too little room above, so below.
{
  const el = overlay(688, 520);
  const { side, r } = run(1440, 900, anchor(496, 384, 688, 30), el, { side: 'top', matchWidth: 'exact', fitHeight: true });
  check('flips below when the side asked for is too short', side === 'bottom', `side ${side}`);
  check('flipped panel stays inside the window', inWindow(r, 1440, 900), JSON.stringify(r));
  check('panel takes the trigger row width', r.width === 688, `width ${r.width}`);
}

// 2. Same panel with a composer at the foot of a thread: room above, stays above.
{
  const el = overlay(688, 420);
  const { side, r } = run(1440, 900, anchor(496, 820, 688, 30), el, { side: 'top', matchWidth: 'exact', fitHeight: true });
  check('stays on the side asked for when it fits', side === 'top', `side ${side}`);
  check('sits above the trigger with the gap', Math.round(r.bottom) === 812, `bottom ${r.bottom}`);
}

// 3. Neither side has room: the roomier one, capped so it scrolls instead of leaving the window.
{
  const el = overlay(300, 900);
  const { side, r } = run(1024, 700, anchor(100, 300, 200, 36), el, { side: 'bottom', fitHeight: true });
  check('takes the roomier side when neither fits', side === 'bottom', `side ${side}`);
  check('capped overlay stays inside the window', inWindow(r, 1024, 700), JSON.stringify(r));
  check('cap is written as max-height', !!el.style.maxHeight, 'no max-height');
}

// 4. Menu aligned to the end of a trigger at the right edge: slid back inside.
{
  const el = overlay(260, 200);
  const { r } = run(1024, 700, anchor(990, 20, 28, 28), el, { side: 'bottom', align: 'start' });
  check('slides back inside the right edge', r.right <= 1024 - 7.5, `right ${r.right}`);
}

// 5. Transformed ancestor: fixed measures from it, and the offset is taken off.
{
  const el = overlay(200, 120, { x: 240, y: 64 });
  const { r } = run(1440, 900, anchor(400, 300, 100, 30), el, { side: 'bottom' });
  check('lands in the right place inside a transformed ancestor', Math.round(r.left) === 400 && Math.round(r.top) === 338, JSON.stringify(r));
}

// 6. Tooltip on the left edge, centred: slid inside rather than half off screen.
{
  const el = overlay(180, 30);
  const { r } = run(1440, 900, anchor(4, 400, 24, 24), el, { side: 'top', align: 'center' });
  check('centred tip near the edge stays inside', r.left >= 7.5, `left ${r.left}`);
}

// 7. Small screen: the stylesheet's own layout is left alone.
{
  const el = overlay(500, 400);
  el.style.left = '';
  const { side } = run(400, 800, anchor(10, 600, 300, 32), el, { side: 'bottom', skipBelow: 560 });
  check('leaves small screens to the stylesheet', side === null && !el.style.position, `side ${side} position ${el.style.position}`);
}

// 8. Inside a contained ancestor under a clipping column: the room is what the column shows, so a
//    panel that fits the window above but not the column above goes below instead.
{
  const el = overlay(688, 312);
  const column = () => ({ top: 102, left: 240, right: 1440, bottom: 891 });
  const { side, r } = run(1440, 900, anchor(496, 400, 688, 30), el, { side: "top", matchWidth: "exact", fitHeight: true, boundary: column });
  check('measures room inside the clipping column, not the window', side === 'bottom', `side ${side}`);
  check('stays inside the clipping column', r.top >= 102 + 7.5 && r.bottom <= 891 - 7.5, JSON.stringify(r));
}

if (failed) {
  console.error(`${failed} placement check(s) failed`);
  process.exit(1);
}
console.log('floating ok');
