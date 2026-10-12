#!/usr/bin/env node
'use strict';

/**
 * Generates the cross-language token surfaces from `src/styles/tokens.css`.
 *
 *   node tools/generate/tokens.js            write
 *   node tools/generate/tokens.js --check    fail if what is on disk differs
 *
 * `tokens.css` is the source, not a sibling output. It arrived from the delivery and is the one file
 * that carries BOTH the palette and the semantic layer that maps onto it, including the dark
 * overrides. The delivery's `tokens.json` holds only the 193 raw palette entries - it never mentions
 * `--surface-base` except in prose - so generating from the JSON would silently drop the entire
 * semantic layer, which is the only layer a product should be naming.
 *
 * Why this exists at all: a `var()` chain is a CSS feature. redrob-browser paints its window chrome
 * in C++ and an Android app in Kotlin; neither can evaluate `var(--surface-base)`. The only way those
 * surfaces carry the same colour as the web is to resolve the chain here, per theme, and hand them
 * literals. Written by hand in two places, the two drift on the first colour change, and the drift is
 * invisible until someone photographs a window next to a web page.
 *
 * Outputs:
 *   src/styles/tokens.json      committed, every token both themes, with its kind and its chain
 *   dist/native/redrob_tokens.h C++ 0xAARRGGBB constants, both themes
 *   dist/native/RedrobTokens.kt Kotlin 0xAARRGGBB Longs, both themes
 *
 * The JSON is committed because it is the machine-readable contract a consumer in another repository
 * reads; the native headers are build output, because a C++ or Kotlin tree copies them in at its own
 * pace and should pin a version rather than track this file.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SOURCE = path.join(ROOT, 'src', 'styles', 'tokens.css');
const JSON_OUT = path.join(ROOT, 'src', 'styles', 'tokens.json');
const NATIVE_DIR = path.join(ROOT, 'dist', 'native');

const check = process.argv.includes('--check');

/* ---- parse ---------------------------------------------------------------- */

/**
 * Walks brace-balanced top-level blocks and returns `{ selector, declarations }` for each one that
 * declares a custom property.
 *
 * Deliberately not a regex over the whole file. `tokens.css` declares the palette in TWO blocks -
 * `:root, [data-theme="light"]` at the top and a second bare `:root` further down - and a probe that
 * matched `:root {` found only the second, reporting 80 tokens and ZERO colours while the file holds
 * 198 and 87 of them are colours. A count that looks plausible is the dangerous kind of wrong.
 */
function parseBlocks(css) {
  const blocks = [];
  let i = 0;

  while (i < css.length) {
    // Skip comments, so a selector-looking string inside one cannot open a block.
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? css.length : end + 2;
      continue;
    }

    const open = css.indexOf('{', i);
    if (open < 0) break;

    const selector = css.slice(i, open).replace(/\/\*[\s\S]*?\*\//g, '').trim();

    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }

    const body = css.slice(open + 1, j - 1);
    const declarations = {};
    for (const d of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)[;}]?/gi)) {
      declarations[d[1]] = d[2].replace(/\/\*[\s\S]*?\*\//g, '').trim();
    }
    if (Object.keys(declarations).length > 0) blocks.push({ selector, declarations });

    i = j;
  }

  return blocks;
}

const css = fs.readFileSync(SOURCE, 'utf8');
const blocks = parseBlocks(css);

// A block belongs to a theme by what its selector targets, not by where it sits in the file.
const LIGHT = /(^|,)\s*(:root|\[data-theme="light"\])\s*(,|$)/;
const DARK = /\[data-theme="dark"\]/;

const light = {};
const darkOverrides = {};

for (const { selector, declarations } of blocks) {
  if (DARK.test(selector)) Object.assign(darkOverrides, declarations);
  else if (LIGHT.test(selector)) Object.assign(light, declarations);
  // Component-scoped custom properties (`.rr-chart { --bar: … }`) are deliberately ignored: they are
  // a component's internals, not a token a product may name.
}

const dark = { ...light, ...darkOverrides };

/* ---- resolve -------------------------------------------------------------- */

/**
 * Follows a `var()` chain to a literal within one theme's scope, returning the chain it walked so the
 * JSON can show `--surface-base -> --redrob-white -> #FFFFFF` rather than just the endpoint. A
 * consumer that disagrees with a colour needs to see which hop it disagrees with.
 */
function resolve(name, scope) {
  const chain = [name];
  const seen = new Set([name]);
  let current = name;

  for (;;) {
    const raw = scope[current];
    if (raw === undefined) return { chain, value: null, error: `--${current.slice(2)} is not declared` };

    const alias = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(raw);
    if (!alias) return { chain, value: raw, raw: scope[name] };

    current = alias[1];
    if (seen.has(current)) return { chain, value: null, error: 'cycle' };
    seen.add(current);
    chain.push(current);
  }
}

function kindOf(value) {
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return 'color';
  if (/^rgba?\(/i.test(value)) return 'color';
  if (/gradient\(/i.test(value)) return 'gradient';
  if (/^(cubic-bezier|steps|linear|ease)/i.test(value)) return 'easing';
  if (/^-?[\d.]+ms$/.test(value)) return 'duration';
  if (/^-?[\d.]+(px|rem|em)$/.test(value)) return 'length';
  if (/^-?[\d.]+deg$/.test(value)) return 'angle';
  if (/^-?[\d.]+%$/.test(value)) return 'percentage';
  if (/^-?[\d.]+$/.test(value)) return 'number';

  // A text token is a CSS `font` shorthand - `600 21px/28px var(--font-sans)`, optionally led by a
  // style keyword - so it packs four facts into one string and is not portable to a native surface.
  //
  // Tested BEFORE font-stack, and that order is load-bearing: `--text-voice-quote` is
  // `italic 400 23px/34px var(--font-serif)`, and the font-stack test matches on the word `serif`
  // appearing anywhere. Checked the other way round, one of the 28 text styles was reported as a font
  // stack - one wrong row out of 172, which is exactly the size of mistake nobody notices.
  if (/^((italic|oblique|normal)\s+)?\d{3}\s+[\d.]+px\//.test(value)) return 'text-style';

  if (/\b(sans-serif|serif|monospace|system-ui)\b/.test(value)) return 'font-stack';
  if (/^(-?[\d.]+(px|rem|em)\s+)+(rgba?\(|#)/.test(value)) return 'shadow';
  if (/^(inset\s+)?0\s/.test(value)) return 'shadow';
  return 'other';
}

/* ---- colour conversion ---------------------------------------------------- */

/**
 * `#RGB`, `#RRGGBB`, `#RRGGBBAA` and `rgb()`/`rgba()` to `{ r, g, b, a }`, a 0-255 each.
 *
 * Alpha is kept, and defaults to opaque rather than being dropped: two tokens in the set are
 * `rgba()` with real transparency, and a native constant that quietly loses the alpha paints a solid
 * block where the design has a veil.
 */
function toRgba(value) {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length === 6) h += 'ff';
    if (h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: parseInt(h.slice(6, 8), 16),
    };
  }

  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.%]+))?\s*\)$/i.exec(value);
  if (fn) {
    let a = 255;
    if (fn[4] !== undefined) {
      const n = parseFloat(fn[4]);
      a = Math.round((fn[4].endsWith('%') ? n / 100 : n) * 255);
    }
    return { r: Math.round(+fn[1]), g: Math.round(+fn[2]), b: Math.round(+fn[3]), a };
  }

  return null;
}

const argb = ({ a, r, g, b }) =>
  '0x' + [a, r, g, b].map((n) => n.toString(16).padStart(2, '0').toUpperCase()).join('');

/* ---- build the model ------------------------------------------------------ */

const names = Object.keys(light).sort();
const problems = [];
const tokens = [];

for (const name of names) {
  const l = resolve(name, light);
  const d = resolve(name, dark);

  if (l.error) problems.push(`${name} (light): ${l.error}`);
  if (d.error) problems.push(`${name} (dark): ${d.error}`);
  if (l.error || d.error) continue;

  const kind = kindOf(l.value);
  if (kind === 'other') problems.push(`${name}: unclassified value ${JSON.stringify(l.value.slice(0, 60))}`);

  const entry = {
    name: name.slice(2),
    kind,
    light: l.value,
    dark: d.value,
    themed: l.value !== d.value,
  };

  // The chain is per theme, because a themed alias does not walk the same hops in both. `--ink-primary`
  // reaches `--redrob-black` in light and `--gray-1` in dark; recording only the light chain would
  // state the wrong provenance for exactly the tokens whose provenance matters.
  const lightChain = l.chain.length > 1 ? l.chain.map((c) => c.slice(2)) : undefined;
  const darkChain = d.chain.length > 1 ? d.chain.map((c) => c.slice(2)) : undefined;
  if (lightChain || darkChain) {
    const same = JSON.stringify(lightChain) === JSON.stringify(darkChain);
    entry.chain = same ? lightChain : { light: lightChain, dark: darkChain };
  }

  // A value can be a literal with a `var()` still inside it - every text style is
  // `600 21px/28px var(--font-sans)` - because only a whole-value alias can be followed further. Said
  // out loud, so a consumer reading this file does not mistake the string for something it can hand to
  // a platform that has never heard of a custom property.
  if (/var\(/.test(l.value) || /var\(/.test(d.value)) entry.containsVar = true;

  if (kind === 'color') {
    const lr = toRgba(l.value);
    const dr = toRgba(d.value);
    if (!lr || !dr) problems.push(`${name}: colour that does not parse (${l.value} / ${d.value})`);
    else entry.argb = { light: argb(lr), dark: argb(dr) };
  }

  tokens.push(entry);
}

if (problems.length > 0) {
  console.error('tokens.css did not fully resolve:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

const colors = tokens.filter((t) => t.kind === 'color');
const byKind = {};
for (const t of tokens) byKind[t.kind] = (byKind[t.kind] || 0) + 1;

const model = {
  // No timestamp anywhere in any output. A generated file that embeds the clock differs on every run,
  // which makes `--check` fail for a reason that has nothing to do with the tokens.
  source: 'src/styles/tokens.css',
  note:
    'Generated by tools/generate/tokens.js. Do not edit. `tokens.css` is the source; every var() ' +
    'chain here is resolved per theme so a consumer that cannot evaluate CSS still gets the value.',
  themes: ['light', 'dark'],
  counts: { total: tokens.length, ...byKind },
  tokens,
};

/* ---- emit ----------------------------------------------------------------- */

const jsonText = JSON.stringify(model, null, 2) + '\n';

function cppHeader() {
  const line = (t, theme) =>
    `constexpr uint32_t k${t.name.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('')} = ${t.argb[theme]};`;

  const widest = Math.max(...colors.map((t) => t.name.length));
  const commented = (t, theme) =>
    `  ${line(t, theme).padEnd(widest + 34)}// --${t.name}${t.themed ? '' : ' (same in both themes)'}`;

  return `// Generated by tools/generate/tokens.js from src/styles/tokens.css. Do not edit.
//
// Redrob design tokens as literal colours, for a surface that cannot evaluate CSS: the browser's
// own window chrome, painted in C++, has no var(--surface-base) to read. These are the same numbers
// the web gets, resolved through the same var() chains, so a toolbar and a page agree by
// construction rather than by someone remembering to change both.
//
// 0xAARRGGBB, which is what SkColor and SK_ColorSetARGB expect. Alpha is real: two tokens in the set
// are translucent, and treating them as opaque paints a block where the design has a veil.
//
// ${colors.length} colours, both themes. Pick the namespace by the active theme, not by build flag -
// the browser can be dark while the OS is light.

#ifndef REDROB_TOKENS_H_
#define REDROB_TOKENS_H_

#include <cstdint>

namespace redrob::tokens {

namespace light {
${colors.map((t) => commented(t, 'light')).join('\n')}
}  // namespace light

namespace dark {
${colors.map((t) => commented(t, 'dark')).join('\n')}
}  // namespace dark

}  // namespace redrob::tokens

#endif  // REDROB_TOKENS_H_
`;
}

function kotlinFile() {
  const camel = (n) =>
    n.split('-').map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join('');

  const line = (t, theme) => `    val ${camel(t.name)}: Long = ${t.argb[theme]}`;

  return `// Generated by tools/generate/tokens.js from src/styles/tokens.css. Do not edit.
//
// Redrob design tokens as literal colours for Android. Same numbers as the web, resolved through the
// same var() chains.
//
// 0xAARRGGBB as Long, because an Int literal above 0x7FFFFFFF does not fit and Kotlin rejects it.
// Convert at the edge: Color(value.toInt()) for Compose, or value.toInt() for android.graphics.
//
// ${colors.length} colours, both themes.

package ai.redrob.tokens

object RedrobTokens {
  object Light {
${colors.map((t) => line(t, 'light')).join('\n')}
  }

  object Dark {
${colors.map((t) => line(t, 'dark')).join('\n')}
  }
}
`;
}

const outputs = [
  { file: JSON_OUT, text: jsonText, committed: true },
  { file: path.join(NATIVE_DIR, 'redrob_tokens.h'), text: cppHeader(), committed: false },
  { file: path.join(NATIVE_DIR, 'RedrobTokens.kt'), text: kotlinFile(), committed: false },
];

if (check) {
  // Only the committed output is checkable. The native files land in `dist/`, which is rebuilt from
  // scratch, so comparing them would test that the build just ran rather than that anything is in
  // step.
  const stale = [];
  for (const { file, text, committed } of outputs) {
    if (!committed) continue;
    const rel = path.relative(ROOT, file);
    if (!fs.existsSync(file)) stale.push(`${rel} is missing`);
    else if (fs.readFileSync(file, 'utf8') !== text) stale.push(`${rel} differs from tokens.css`);
  }

  if (stale.length > 0) {
    for (const s of stale) console.log(`  stale  ${s}`);
    console.log('\nRun `yarn tokens` and commit the result.');
    process.exit(1);
  }

  console.log(`tokens up to date - ${tokens.length} tokens, ${colors.length} colours, both themes`);
  process.exit(0);
}

fs.mkdirSync(NATIVE_DIR, { recursive: true });
for (const { file, text } of outputs) fs.writeFileSync(file, text);

console.log(`tokens: ${tokens.length} total, ${colors.length} colours`);
console.log(`  ${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ')}`);
console.log(`  ${tokens.filter((t) => t.themed).length} differ between light and dark`);
for (const { file } of outputs) console.log(`  wrote ${path.relative(ROOT, file)}`);
