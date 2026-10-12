#!/usr/bin/env node
'use strict';

/**
 * `system.css` may ADD a root-scoped token. It may not DISAGREE with `tokens.css` about one.
 *
 *   node tools/check/supersession.js
 *
 * WHAT THIS IS FOR. One release ships two artifacts that carry the same colours: `tokens.css`, which a
 * web consumer loads, and `dist/native/redrob_tokens.h`, which a C++ or Kotlin consumer compiles in.
 * The native header is generated from `tokens.css` ALONE - correctly, because it is the token sheet.
 *
 * So when `system.css` redeclared `--ink-muted` and `--surface-sunken` at root scope, the release began
 * shipping two different answers for three colours. A web page loading both sheets got the later,
 * corrected value. A native surface reading the header got the earlier one. The delivery left a note
 * saying `tokens.css` was where the correction belonged "once tokens.css regenerates", and until it did
 * the two disagreed by nine points per channel - which nobody spots, in adjacent pixels, with no build
 * failing anywhere. redrob-browser found it only because it is the one surface that paints from BOTH.
 *
 * The corrections are now in `tokens.css`, so those declarations agree and the `system.css` block is
 * inert, exactly as its own comment predicted. This gate is what keeps it that way: the next release
 * that carries a correction in the component sheet fails here instead of shipping a split release.
 *
 * ADDING is fine and is not reported as agreement or disagreement - `--dia-rake`, `--series-*`,
 * `--tex-alpha` exist only in the component layer, which is the right place for a component's own
 * values. The gate is about the ones BOTH sheets name.
 */

const fs = require('fs');
const path = require('path');
const { stripComments, declarations, blocks } = require('./css');

const STYLES = path.join(__dirname, '..', '..', 'src', 'styles');

const LIGHT = /(^|,)\s*(:root|html)\s*(,|$)|\[data-theme=["']light["']\]/;
const DARK = /\[data-theme=["']dark["']\]|prefers-color-scheme:\s*dark|:root:not\(\[data-theme=["']light["']\]\)/;

/** Root-scoped custom properties, split by theme. Recurses into `@media`, where the dark block lives. */
function rootScoped(css) {
  const light = {};
  const dark = {};

  for (const block of blocks(css)) {
    if (/^@(media|supports)/i.test(block.selector)) {
      const inner = rootScoped(block.body);
      // A dark media query's contents are dark regardless of the inner selector.
      const isDark = DARK.test(block.selector);
      Object.assign(isDark ? dark : light, inner.light);
      Object.assign(dark, inner.dark);
      continue;
    }

    // A component-scoped property (`.rr-chart { --bar: ... }`) is a component's internals, not a token.
    const isRoot = /(^|,)\s*:root\b/.test(block.selector) || /\[data-theme=/.test(block.selector);
    if (!isRoot) continue;

    const target = DARK.test(block.selector) ? dark : light;
    for (const d of declarations(block.body)) target[d.name] = d.value;
  }

  return { light, dark };
}

/** Follows a whole-value `var()` alias to a literal within one theme's scope. */
function resolve(name, scope) {
  const seen = new Set([name]);
  let current = name;

  for (;;) {
    const raw = scope[current];
    if (raw === undefined) return null;
    const alias = /^var\(\s*(--[a-zA-Z0-9-]+)\s*\)$/i.exec(raw);
    if (!alias) return raw;
    current = alias[1];
    if (seen.has(current)) return null;
    seen.add(current);
  }
}

const tokensRaw = fs.readFileSync(path.join(STYLES, 'tokens.css'), 'utf8');
const systemRaw = fs.readFileSync(path.join(STYLES, 'system.css'), 'utf8');

const tokensStripped = stripComments(tokensRaw);
const systemStripped = stripComments(systemRaw);

const failures = [];

/* Measured, not trusted: a stripper that ate the sheets would find no declarations and report a clean
   run over nothing at all. */
for (const [name, s] of [['tokens.css', tokensStripped], ['system.css', systemStripped]]) {
  if (s.kept < 0.55 * (s.kept + s.removed)) {
    failures.push(
      `the comment stripper removed ${s.removed} of ${s.kept + s.removed} bytes of ${name}, which is ` +
        `too much to be comments - it is eating code, and this gate is reading a gutted sheet`,
    );
  }
}

const tokens = rootScoped(tokensStripped.css);
const system = rootScoped(systemStripped.css);

const tokensLight = tokens.light;
const tokensDark = { ...tokens.light, ...tokens.dark };

let compared = 0;
const added = [];

for (const [theme, sysScope, tokScope] of [
  ['light', system.light, tokensLight],
  ['dark', system.dark, tokensDark],
]) {
  for (const name of Object.keys(sysScope)) {
    if (!(name in tokScope)) {
      if (!added.includes(name)) added.push(name);
      continue;
    }

    compared += 1;
    // Compared as RESOLVED literals: `tokens.css` reaches a colour through an alias chain and
    // `system.css` writes it flat, so equal text is not the question - equal paint is.
    const merged = { ...tokScope, ...sysScope };
    const fromSystem = resolve(name, merged);
    const fromTokens = resolve(name, tokScope);

    const norm = (v) => (v === null ? null : String(v).trim().toLowerCase());
    if (norm(fromSystem) !== norm(fromTokens)) {
      failures.push(
        `${theme}: ${name} is ${fromTokens} in tokens.css and ${fromSystem} in system.css. The ` +
          `native header is generated from tokens.css, so this release would hand a native consumer ` +
          `${fromTokens} while a web consumer loading both sheets paints ${fromSystem}. Put the ` +
          `intended value in tokens.css.`,
      );
    }
  }
}

if (failures.length > 0) {
  for (const f of failures) console.log(`  split   ${f}`);
  console.log(`\n${compared} tokens declared by both sheets, ${failures.length} disagree`);
  process.exit(1);
}

console.log(
  `${compared} tokens are declared by both tokens.css and system.css and all agree; ` +
    `${added.length} are component-layer additions (${added.slice(0, 4).map((n) => n).join(', ')}` +
    `${added.length > 4 ? ', ...' : ''})`,
);
