'use strict';
/**
 * Parity harness.
 *
 * The rewrite has one hard requirement: a component we write must render the same DOM as the
 * design system's own reference bundle for the same props. Reading both and judging by eye does not
 * scale to 123 components, so this renders both and compares the markup.
 *
 * The test cases are not ours either. Every component in the delivery ships a `preview.html` whose
 * script builds its demo out of `window.Redrob`. Swapping what `window.Redrob` is swaps the
 * implementation under test and keeps the case identical, so the cases cannot drift toward the
 * implementation they are meant to check.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const NODE_MODULES = path.join(__dirname, '..', '..', 'node_modules');
const React = require(path.join(NODE_MODULES, 'react'));
const { renderToStaticMarkup } = require(path.join(NODE_MODULES, 'react-dom/server'));

/**
 * Where the reference lives. `reference/` is a vendored copy of the delivery's `bundle.js`, its
 * stylesheet, its prop contract and every `preview.html` case - about 2 MB of the 141 MB delivery.
 *
 * It is vendored rather than referenced from a sibling checkout so this gate runs in CI. A parity
 * job that skips because it could not find the reference is worse than no job: it reports green for
 * having checked nothing.
 *
 * `REDROB_DS_DIR` points at a full delivery instead, which is how the vendored copy is refreshed
 * and how a newer delivery is tried before it is committed.
 */
const SYSTEM = process.env.REDROB_DS_DIR || path.join(__dirname, '..', '..', 'reference');
const COMPONENTS_DIR = path.join(SYSTEM, 'components');
const REFERENCE_BUNDLE = path.join(COMPONENTS_DIR, 'bundle.js');

/** The delivery's own implementation, loaded fresh so its internal id counter restarts. */
function loadReference() {
  const src = fs.readFileSync(REFERENCE_BUNDLE, 'utf8');
  const sandbox = { window: {}, console, React };
  sandbox.globalThis = sandbox;
  sandbox.window.React = React;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'reference-bundle.js' });
  if (!sandbox.window.Redrob) throw new Error('reference bundle did not assign window.Redrob');
  return sandbox.window.Redrob;
}

/** Our build. Required fresh for the same reason: generated ids must start from the same place. */
function loadOurs() {
  const entry = path.join(__dirname, '..', '..', 'dist', 'index.js');
  if (!fs.existsSync(entry)) {
    throw new Error(`dist/index.js is missing. Run \`yarn build\` before comparing.`);
  }
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(path.join(__dirname, '..', '..', 'dist'))) delete require.cache[key];
  }
  const mod = require(entry);
  return mod.default && mod.default.Button ? mod.default : mod;
}

/** The `<script>` body of a preview, which is the case itself. */
function readCase(name) {
  const file = path.join(COMPONENTS_DIR, name, 'preview.html');
  if (!fs.existsSync(file)) return null;
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (scripts.length === 0) return null;
  return scripts.join('\n');
}

/**
 * Runs one preview against one implementation and returns the rendered markup.
 *
 * A preview ends in `ReactDOM.createRoot(el).render(node)`, so the root is a stub that keeps the
 * node instead of mounting it. Everything else the previews touch is stubbed to the narrowest thing
 * that lets the case run: a missing global would otherwise read as a parity failure.
 */
function renderCase(script, impl) {
  let captured = null;
  const element = () => ({
    style: {},
    setAttribute() {},
    appendChild() {},
    addEventListener() {},
    classList: { add() {}, remove() {}, toggle() {} },
  });
  const documentStub = {
    getElementById: element,
    querySelector: element,
    querySelectorAll: () => [],
    createElement: element,
    documentElement: element(),
    body: element(),
    addEventListener() {},
  };
  const sandbox = {
    React,
    ReactDOM: {
      createRoot: () => ({ render: (node) => { captured = node; }, unmount() {} }),
      render: (node) => { captured = node; },
    },
    document: documentStub,
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    Intl,
    Date,
    Math,
    JSON,
    URL,
  };
  sandbox.window = {
    Redrob: impl,
    React,
    document: documentStub,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    location: { href: 'https://redrob.ai/', pathname: '/' },
    navigator: { language: 'en-US', languages: ['en-US'] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    innerWidth: 1280,
    innerHeight: 800,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, { filename: 'preview.js' });
  if (captured === null) throw new Error('preview did not render anything');
  return renderToStaticMarkup(captured);
}

/** Generated ids are sequential per render, so they are normalised out of the comparison. */
function normalise(markup) {
  return markup
    .replace(/\brr-[a-z-]+-\d+\b/g, 'rr-id')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First differing position, with the surrounding text, so a failure says where to look. */
function firstDifference(a, b) {
  const len = Math.min(a.length, b.length);
  let i = 0;
  while (i < len && a[i] === b[i]) i++;
  const from = Math.max(0, i - 60);
  return {
    at: i,
    reference: a.slice(from, i + 120),
    ours: b.slice(from, i + 120),
  };
}

function compare(name, reference, ours) {
  const script = readCase(name);
  if (!script) return { name, status: 'no-case' };
  let refMarkup;
  try {
    refMarkup = renderCase(script, reference);
  } catch (error) {
    return { name, status: 'reference-threw', error: error.message };
  }
  let ourMarkup;
  try {
    ourMarkup = renderCase(script, ours);
  } catch (error) {
    return { name, status: 'threw', error: error.message };
  }
  const a = normalise(refMarkup);
  const b = normalise(ourMarkup);
  if (a === b) return { name, status: 'pass', bytes: a.length };
  return { name, status: 'differs', bytes: a.length, ourBytes: b.length, diff: firstDifference(a, b) };
}

/** The 123 exported components, in the order the bundle declares them. */
function exportedNames() {
  // `\r?` because a CRLF checkout leaves a `\r` on the line, and JSON.parse then fails on it.
  const header = fs.readFileSync(REFERENCE_BUNDLE, 'utf8').split(/\r?\n/, 1)[0];
  const json = header.replace(/^\/\* @ds-bundle:\s*/, '').replace(/\s*\*\/$/, '');
  return JSON.parse(json).components.map((c) => c.name);
}

/**
 * `Cover` is the delivery's title page: static HTML with no `<script>`, so there is no case to run
 * and nothing to compare.
 *
 * It is named here rather than filtered by "has no script" on purpose. A composition that LOSES its
 * script in a future delivery must fail as `no-case`, not quietly drop out of the gate.
 */
const STATIC_COMPOSITIONS = new Set(['Cover']);

/**
 * The composition fixtures: the page and screen assemblies the delivery ships beside the
 * components. The bundle does not export them and `src/` does not implement them - `PageHome`'s
 * preview says so itself, "Screen-only composition. The parts are bundle components; this is how a
 * page arranges them".
 *
 * They are compared anyway. Each one assembles exported components (72 distinct ones across the
 * set) into a real page, and a component can be at parity on its own while a page built out of it
 * is not: ordering, nesting and the props a page passes are only exercised here. Comparing them
 * costs nothing extra, because the case runs against whichever `window.Redrob` it is handed, the
 * same as a component case.
 */
function compositionNames() {
  const exported = new Set(exportedNames());
  return fs
    .readdirSync(COMPONENTS_DIR)
    .filter((n) => fs.statSync(path.join(COMPONENTS_DIR, n)).isDirectory())
    .filter((n) => !exported.has(n) && !STATIC_COMPOSITIONS.has(n) && !loadsPrototype(n))
    .sort();
}

/**
 * Since the October 2026 delivery, the product screens (`ScreenCowork*`, `ScreenOffice*`, `ScreenCrew*`,
 * `ScreenDesign*`) no longer carry their case inline. Each preview `fetch`es a whole prototype app
 * (`../../prototypes/<product>/app.js`, 250 to 660 KB, with its own router and timers) and mounts it.
 * That is a running product, not a case: it needs a real DOM and a network path this harness does not
 * have, and its markup depends on timers. So these are reported by name as not compared.
 *
 * Detected by that exact loader, not by "has no inline case": a screen that loses its script
 * altogether still fails as `no-case`.
 */
const PROTOTYPE_LOADER = /fetch\("\.\.\/\.\.\/prototypes\/[a-z]+\/app\.js"\)/;
function loadsPrototype(name) {
  const script = readCase(name);
  return script !== null && PROTOTYPE_LOADER.test(script);
}

function prototypeCompositions() {
  return fs
    .readdirSync(COMPONENTS_DIR)
    .filter((n) => fs.statSync(path.join(COMPONENTS_DIR, n)).isDirectory())
    .filter((n) => loadsPrototype(n))
    .sort();
}

module.exports = {
  loadReference,
  loadOurs,
  readCase,
  renderCase,
  compare,
  exportedNames,
  compositionNames,
  prototypeCompositions,
  STATIC_COMPOSITIONS,
  normalise,
};
