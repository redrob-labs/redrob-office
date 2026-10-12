#!/usr/bin/env node
'use strict';

/**
 * The little bit of CSS reading both `references.js` and `supersession.js` need.
 *
 * Why a character scanner and not a regex. `system.css` embeds an SVG noise texture as a data URL,
 * and that URL contains `/*` inside a string. `text.replace(/\/\*[\s\S]*?\* \//g, '')` therefore
 * starts a comment inside a value and deletes everything up to the next terminator ANYWHERE in the
 * file - which, in a 4.4k-line sheet, is most of it. A helper that removes too much makes every gate
 * that uses it pass, so this one reports how much it removed and the callers assert on that.
 */

/**
 * Removes comments, tracking string and url() state so an opener inside a value cannot start one.
 * Replaces each comment with a run of newlines matching what it swallowed, so line numbers survive.
 */
function stripComments(css) {
  let out = '';
  let i = 0;
  let removed = 0;
  let quote = null;

  while (i < css.length) {
    const c = css[i];

    if (quote) {
      // Inside a string. Only the matching quote ends it; a backslash escapes the next character.
      if (c === '\\') {
        out += css.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      out += c;
      i += 1;
      continue;
    }

    if (c === '"' || c === "'") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }

    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const stop = end < 0 ? css.length : end + 2;
      const text = css.slice(i, stop);
      removed += text.length;
      // Keep the newlines so a reported line number still points at the right line.
      out += text.replace(/[^\n]/g, '');
      i = stop;
      continue;
    }

    out += c;
    i += 1;
  }

  return { css: out, removed, kept: out.length };
}

/**
 * Every custom-property declaration, as `{ name, value, line }`. Runs on stripped text, so a property
 * written inside a comment is not a declaration - which matters, because the product-token block in
 * `tokens.css` quotes `--product-wash: var(--product-browser-wash)` in its own explanation, and a
 * regex over the raw file counts that as a 120th product token.
 */
function declarations(css) {
  const out = [];
  for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;}]*)/g)) {
    out.push({
      name: m[1],
      value: m[2].trim(),
      line: css.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

/**
 * Every `var()` reference, as `{ name, hasFallback, line }`.
 *
 * `hasFallback` is the whole point of reading this by hand: `var(--x)` on an undeclared property makes
 * the WHOLE declaration invalid and it is dropped, while `var(--x, 12px)` is a deliberate opt-in
 * override and is correct with nothing declaring `--x`. Told apart by a comma at depth one, because a
 * fallback may itself contain parenthesised functions.
 */
function references(css) {
  const out = [];
  for (const m of css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
    let i = m.index + m[0].length;
    let depth = 1;
    let hasFallback = false;

    while (i < css.length && depth > 0) {
      const c = css[i];
      if (c === '(') depth += 1;
      else if (c === ')') depth -= 1;
      else if (c === ',' && depth === 1) hasFallback = true;
      i += 1;
    }

    out.push({
      name: m[1],
      hasFallback,
      line: css.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

/**
 * Brace-balanced top-level blocks as `{ selector, body, line }`, comments already gone. Used to tell a
 * root-scoped declaration (a token) from a component-scoped one (a component's internals).
 */
function blocks(css) {
  const out = [];
  let i = 0;

  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;

    const selector = css.slice(i, open).trim();
    let depth = 1;
    let k = open + 1;
    while (k < css.length && depth > 0) {
      if (css[k] === '{') depth += 1;
      else if (css[k] === '}') depth -= 1;
      k += 1;
    }

    out.push({
      selector,
      body: css.slice(open + 1, k - 1),
      line: css.slice(0, open).split('\n').length,
    });
    i = k;
  }

  return out;
}

module.exports = { stripComments, declarations, references, blocks };
