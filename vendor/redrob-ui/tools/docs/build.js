'use strict';
/**
 * Documentation generator.
 *
 * Produces two audiences from ONE pass over the same sources, so they cannot disagree:
 *
 *   - `site/`        a browsable page per component for a person: the component actually rendered,
 *                    its prop table, and the import line.
 *   - `llms.txt`     an index for an agent, the convention a crawler looks for at the site root.
 *   - `llms-full.txt` the whole reference as plain text, so an agent needs one fetch, not 123.
 *
 * Every fact comes from a file in THIS repository, never from prose typed by hand:
 *
 *   - grouping and order .... `src/index.ts`, the public surface itself
 *   - description ........... the JSDoc above the exported component
 *   - props ................. the exported `<Name>Props` interface, read with the TypeScript AST
 *   - the rendered demo ..... `dist/` driven by the delivery's own `preview.html` case, through the
 *                             SAME harness the parity gate uses
 *
 * A docs page therefore cannot claim a prop the type does not declare, and cannot show a rendering
 * the parity gate has not already held to the reference. Prose written beside the code would drift;
 * this cannot, because there is nowhere for it to drift to.
 *
 * `--check` regenerates the two committed text files in memory and fails if they differ from disk.
 * Without it a stale `llms.txt` is what an agent reads, and nothing reports the lie.
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const harness = require('../parity/harness');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
const SITE = path.join(ROOT, 'site');
const PKG = require(path.join(ROOT, 'package.json'));
const REPO = 'https://github.com/redrob-labs/redrob-ui';

/**
 * The stylesheet subpaths, in the order a consumer must import them, taken from the package's own
 * `exports` map rather than written out here.
 *
 * Written out, they went stale the moment the map changed: this file told every agent reading
 * `llms.txt` to import `@redrob-labs/ui/styles/tokens.css`, a path the map does not expose, so the
 * import throws ERR_PACKAGE_PATH_NOT_EXPORTED. Nothing caught it, because the docs gate only checks
 * that the committed file matches what this generator produces - and the generator was confidently
 * producing the wrong path.
 *
 * The ORDER is stated here and not read from the map, because it is a real dependency (`styles.css`
 * reads the custom properties `tokens.css` declares) and object key order is not a promise. A missing
 * entry is a hard failure rather than a silent omission: documentation that leaves out a required
 * stylesheet produces an unstyled page and no error.
 */
const STYLE_SUBPATHS = (() => {
  const required = ['tokens.css', 'styles.css'];
  const optional = ['preflight.css'];
  const exported = new Set(Object.keys(PKG.exports || {}).map((k) => k.replace(/^\.\//, '')));

  const missing = required.filter((p) => !exported.has(p));
  if (missing.length > 0) {
    console.error(`package.json exports does not expose: ${missing.join(', ')}`);
    console.error('The documentation would tell every consumer to import a path that does not resolve.');
    process.exit(1);
  }

  return [...required, ...optional.filter((p) => exported.has(p))];
})();

/** `\`pkg/tokens.css\`, \`pkg/styles.css\` and \`pkg/preflight.css\`` — for a sentence. */
function cssImportList() {
  const items = STYLE_SUBPATHS.map((p) => `\`${PKG.name}/${p}\``);
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/* ---- reading the sources ------------------------------------------------- */

/**
 * The public surface, in its own order, grouped by the section comments it already carries.
 *
 * `src/index.ts` is the only place that knows both which components ship and in what order, so the
 * docs take their spine from it rather than from a list maintained beside it. A component added to
 * the library but not exported does not appear here, which is correct: it is not public.
 */
function readSurface() {
  const lines = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8').split('\n');
  const groups = [];
  let current = null;
  for (const line of lines) {
    const marker = line.match(/^\/\* ---- (.+?) -+ \*\/$/);
    if (marker) {
      current = { name: marker[1].trim(), components: [] };
      groups.push(current);
      continue;
    }
    // `export { Button } from './components/Button/Button';` - value exports only. A `export type`
    // line names the props interface, which is read from the component file itself, not from here.
    const value = line.match(/^export \{([^}]+)\} from '\.\/components\/([^/]+)\/([^']+)';$/);
    if (!value || !current) continue;
    const names = value[1].split(',').map((s) => s.trim()).filter(Boolean);
    const dir = value[2];
    const file = value[3];
    // The first name is the component; the rest are its context objects and constants.
    const [component, ...also] = names;
    current.components.push({ name: component, dir, file, also });
  }
  return groups.filter((g) => g.components.length > 0);
}

/** The JSDoc text of a node, with the `*` gutter and tag lines removed. */
function docOf(node, source) {
  const ranges = ts.getLeadingCommentRanges(source.text, node.pos) || [];
  const block = ranges
    .map((r) => source.text.slice(r.pos, r.end))
    .filter((t) => t.startsWith('/**'))
    .pop();
  if (!block) return '';
  return block
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\* ?/, '').trimEnd())
    .join('\n')
    .trim();
}

/** A member's declared type, as written. The source text is the contract; a reformat is a lie. */
function typeText(member, source) {
  if (!member.type) return 'unknown';
  return source.text.slice(member.type.pos, member.type.end).trim().replace(/\s+/g, ' ');
}

/**
 * One component read from its own file: the description above the export, and the props interface.
 *
 * `extends` is kept as a note rather than expanded. `React.ButtonHTMLAttributes<HTMLButtonElement>`
 * expanded is two hundred DOM attributes, which buries the nine props the component actually
 * defines; the sentence "plus any native button attribute" is what a reader needs.
 */
function readComponent(entry) {
  const file = path.join(SRC, 'components', entry.dir, `${entry.file}.tsx`);
  if (!fs.existsSync(file)) return { ...entry, missing: true, props: [], extends: [] };
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

  let description = '';
  const props = [];
  const inherits = [];
  const types = [];

  for (const statement of source.statements) {
    const exported = ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Export;

    if (ts.isFunctionDeclaration(statement) && statement.name && statement.name.text === entry.name) {
      description = docOf(statement, source);
    }

    if (ts.isVariableStatement(statement) && exported) {
      const declared = statement.declarationList.declarations[0];
      if (declared && ts.isIdentifier(declared.name) && declared.name.text === entry.name && !description) {
        description = docOf(statement, source);
      }
    }

    if (ts.isInterfaceDeclaration(statement) && exported) {
      if (statement.name.text === `${entry.name}Props`) {
        for (const clause of statement.heritageClauses || []) {
          for (const t of clause.types) inherits.push(source.text.slice(t.pos, t.end).trim());
        }
        for (const member of statement.members) {
          if (!ts.isPropertySignature(member) || !member.name) continue;
          props.push({
            name: member.name.getText(source),
            optional: Boolean(member.questionToken),
            type: typeText(member, source),
            doc: docOf(member, source),
          });
        }
      } else {
        types.push(statement.name.text);
      }
    }

    if (ts.isTypeAliasDeclaration(statement) && exported && statement.name.text !== `${entry.name}Props`) {
      types.push(statement.name.text);
    }
  }

  return { ...entry, description, props, extends: inherits, types, file: path.relative(ROOT, file) };
}

/**
 * The component rendered, as markup.
 *
 * This deliberately reuses the parity harness rather than rendering its own way. The harness runs
 * the delivery's own `preview.html` case against our `dist/`, which is exactly what the CI gate
 * compares to the reference - so a demo on a docs page is a rendering that has already been held to
 * the reference, not a separate example that could be wrong on its own.
 */
function renderDemo(name, ours) {
  const script = harness.readCase(name);
  if (!script) return { markup: null, reason: 'the delivery ships no preview case for this one' };
  try {
    return { markup: harness.renderCase(script, ours), reason: null };
  } catch (error) {
    return { markup: null, reason: `the preview case did not run: ${error.message}` };
  }
}

/* ---- writing the human site --------------------------------------------- */

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Inline `code` and `**bold**` from a JSDoc line. Escaped first, so markup in a doc stays text. */
function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/** JSDoc paragraphs to HTML. Blank line separates; single newlines are soft wraps in the source. */
function paragraphs(text) {
  if (!text) return '';
  return text
    .split(/\n\s*\n/)
    .map((p) => `<p>${inline(p.replace(/\n/g, ' '))}</p>`)
    .join('\n');
}

const PAGE_CSS = `
:root { color-scheme: light dark; --ink:#16181d; --dim:#576071; --line:#dfe2e8; --bg:#fff; --sunk:#f8f9fb; --brand:#2b52ff; }
@media (prefers-color-scheme: dark) { :root { --ink:#eceef2; --dim:#aab0bb; --line:#292e37; --bg:#0e1013; --sunk:#16181d; --brand:#507fff; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif; }
a { color:var(--brand); }
code { font:0.9em ui-monospace,SFMono-Regular,Menlo,monospace; background:var(--sunk); padding:.1em .35em; border-radius:4px; }
pre { background:var(--sunk); border:1px solid var(--line); border-radius:8px; padding:12px 14px; overflow-x:auto; }
pre code { background:none; padding:0; }
.wrap { max-width:940px; margin:0 auto; padding:32px 24px 96px; }
header.top { border-bottom:1px solid var(--line); padding:14px 24px; display:flex; gap:16px; align-items:baseline; flex-wrap:wrap; }
header.top strong { font-size:15px; }
header.top span { color:var(--dim); font-size:13px; }
header.top nav { margin-left:auto; display:flex; gap:14px; font-size:13px; }
h1 { font-size:30px; letter-spacing:-.02em; margin:0 0 6px; }
h2 { font-size:15px; text-transform:uppercase; letter-spacing:.08em; color:var(--dim); margin:36px 0 10px; font-weight:600; }
.group { margin:0 0 28px; }
.group h2 { margin-top:28px; }
.cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:10px; }
.card { border:1px solid var(--line); border-radius:9px; padding:11px 13px; text-decoration:none; color:inherit; display:block; }
.card:hover { border-color:var(--brand); }
.card b { display:block; font-size:14px; margin-bottom:3px; }
.card span { color:var(--dim); font-size:12.5px; line-height:1.45; display:block; }
table { width:100%; border-collapse:collapse; font-size:13.5px; }
th { text-align:left; font-weight:600; color:var(--dim); font-size:11px; text-transform:uppercase; letter-spacing:.06em; border-bottom:1px solid var(--line); padding:0 10px 6px 0; }
td { border-bottom:1px solid var(--line); padding:8px 10px 8px 0; vertical-align:top; }
td.t code { white-space:pre-wrap; word-break:break-word; }
.req { color:#c6301b; font-size:11px; }
iframe { width:100%; border:1px solid var(--line); border-radius:9px; background:#fff; display:block; }
.note { border-left:3px solid #f59e0b; padding:7px 0 7px 12px; color:var(--dim); font-size:13.5px; }
.filter { width:100%; padding:9px 12px; font-size:14px; border:1px solid var(--line); border-radius:8px; background:var(--sunk); color:inherit; margin:0 0 22px; }
.meta { color:var(--dim); font-size:13px; margin:0 0 26px; }
`;

function shell(title, body, depth) {
  const up = depth ? '../' : '';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${PAGE_CSS}</style>
</head><body>
<header class="top">
  <strong><a href="${up}index.html" style="color:inherit;text-decoration:none">${escapeHtml(PKG.name)}</a></strong>
  <span>v${escapeHtml(PKG.version)} &middot; Redrob Group Design System 2026</span>
  <nav>
    <a href="${up}llms.txt">llms.txt</a>
    <a href="${up}llms-full.txt">llms-full.txt</a>
    <a href="${REPO}">source</a>
  </nav>
</header>
<div class="wrap">
${body}
</div>
</body></html>
`;
}

/** The demo's own document, loaded in an iframe so the system's CSS cannot touch the docs page. */
function demoPage(name, markup) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(name)} demo</title>
<link rel="stylesheet" href="../styles/tokens.css">
<link rel="stylesheet" href="../styles/system.css">
<style>
  html,body { margin:0; }
  body { padding:20px; background:var(--surface-page,#fff); }
</style>
</head><body>
${markup}
<script>
  // The parent sizes the frame to its content: a Button needs 60px, PageHome needs thousands, and a
  // fixed height would either crop the page or leave a field of white under the button.
  function report() {
    var h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    parent.postMessage({ redrobDemoHeight: h, name: ${JSON.stringify(name)} }, '*');
  }
  window.addEventListener('load', report);
  new ResizeObserver(report).observe(document.body);
</script>
</body></html>
`;
}

function componentPage(component, group) {
  const parts = [];
  parts.push(`<h1>${escapeHtml(component.name)}</h1>`);
  parts.push(`<p class="meta">${escapeHtml(group)} &middot; <code>${escapeHtml(component.file)}</code></p>`);
  parts.push(paragraphs(component.description) || '<p class="note">This component has no description above its export.</p>');

  parts.push('<h2>Import</h2>');
  parts.push(`<pre><code>import { ${escapeHtml(component.name)} } from '${escapeHtml(PKG.name)}';</code></pre>`);

  parts.push('<h2>Rendered</h2>');
  if (component.demo.markup) {
    parts.push(`<iframe src="../demo/${encodeURIComponent(component.name)}.html" title="${escapeHtml(component.name)} rendered" loading="lazy" height="160"></iframe>`);
    parts.push(`<p class="meta">The design system's own preview case, run against this package's build. The parity gate compares this rendering to the reference bundle's.</p>`);
  } else {
    parts.push(`<p class="note">No rendering: ${escapeHtml(component.demo.reason)}</p>`);
  }

  parts.push('<h2>Props</h2>');
  if (component.props.length === 0) {
    parts.push('<p class="note">No own props are declared.</p>');
  } else {
    const rows = component.props
      .map(
        (p) => `<tr>
  <td><code>${escapeHtml(p.name)}</code>${p.optional ? '' : ' <span class="req">required</span>'}</td>
  <td class="t"><code>${escapeHtml(p.type)}</code></td>
  <td>${inline(p.doc.replace(/\n/g, ' '))}</td>
</tr>`
      )
      .join('\n');
    parts.push(`<table><thead><tr><th>Prop</th><th>Type</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>`);
  }
  if (component.extends.length) {
    parts.push(`<p class="meta">Also accepts everything on ${component.extends.map((e) => `<code>${escapeHtml(e)}</code>`).join(', ')}.</p>`);
  }
  if (component.types.length) {
    parts.push(`<h2>Exported types</h2><p class="meta">${component.types.map((t) => `<code>${escapeHtml(t)}</code>`).join(', ')}</p>`);
  }
  if (component.also.length) {
    parts.push(`<h2>Exported beside it</h2><p class="meta">${component.also.map((t) => `<code>${escapeHtml(t)}</code>`).join(', ')}</p>`);
  }

  const body = parts.join('\n') + `
<script>
  // Height comes from the frame itself, keyed by name so one page with several frames stays correct.
  addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data.redrobDemoHeight !== 'number') return;
    document.querySelectorAll('iframe').forEach(function (frame) {
      if (frame.src.indexOf(encodeURIComponent(data.name) + '.html') !== -1) {
        frame.height = data.redrobDemoHeight;
      }
    });
  });
</script>`;
  return shell(`${component.name} - ${PKG.name}`, body, 1);
}

/** First sentence of a description, for an index card. */
function firstSentence(text) {
  if (!text) return '';
  const flat = text.split(/\n\s*\n/)[0].replace(/\n/g, ' ').trim();
  const end = flat.search(/\.(\s|$)/);
  return end === -1 ? flat : flat.slice(0, end + 1);
}

function indexPage(groups, stats) {
  const sections = groups
    .map((g) => {
      const cards = g.components
        .map(
          (c) => `<a class="card" href="components/${encodeURIComponent(c.name)}.html" data-name="${escapeHtml(c.name.toLowerCase())}">
  <b>${escapeHtml(c.name)}</b><span>${inline(firstSentence(c.description))}</span></a>`
        )
        .join('\n');
      return `<section class="group" data-group="${escapeHtml(g.name.toLowerCase())}"><h2>${escapeHtml(g.name)} &middot; ${g.components.length}</h2><div class="cards">${cards}</div></section>`;
    })
    .join('\n');

  const body = `<h1>Components</h1>
<p class="meta">${stats.total} components in ${groups.length} groups, ${stats.rendered} with a live rendering. Every one is held to the design system's own reference bundle by the parity gate.</p>
<input class="filter" id="filter" type="search" placeholder="Filter by name" aria-label="Filter components by name">
${sections}
<script>
  // Filtering is name-only and client-side: the whole index is one page, so there is nothing to fetch.
  var input = document.getElementById('filter');
  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    document.querySelectorAll('section.group').forEach(function (section) {
      var shown = 0;
      section.querySelectorAll('.card').forEach(function (card) {
        var hit = !q || card.dataset.name.indexOf(q) !== -1;
        card.style.display = hit ? '' : 'none';
        if (hit) shown++;
      });
      section.style.display = shown ? '' : 'none';
    });
  });
</script>`;
  return shell(`${PKG.name} components`, body, 0);
}

/* ---- writing the agent reference ---------------------------------------- */

/**
 * `llms.txt`: what the component is and where its detail lives. An agent deciding WHICH component
 * to use reads this; it is deliberately short enough to be read whole.
 */
function llmsShort(groups, stats, base) {
  const out = [];
  out.push(`# ${PKG.name}`);
  out.push('');
  out.push(`> React components for the Redrob Group Design System 2026. ${stats.total} components, ${stats.icons} icons. Every component is rendered against the design system's own reference bundle and compared markup-for-markup, so its appearance is checked mechanically rather than by eye.`);
  out.push('');
  out.push(`Version ${PKG.version}. Install \`${PKG.name}\`. Import named exports from the package root. Ship ${cssImportList()}, in that order, or nothing is styled.`);
  out.push('');
  out.push(`Read [llms-full.txt](${base}/llms-full.txt) instead of this file when you need props: it carries every component's description and full prop list in one fetch.`);
  out.push('');
  for (const group of groups) {
    out.push(`## ${group.name}`);
    out.push('');
    for (const c of group.components) {
      out.push(`- [${c.name}](${base}/components/${encodeURIComponent(c.name)}.html): ${firstSentence(c.description) || 'no description'}`);
    }
    out.push('');
  }
  return out.join('\n');
}

/**
 * `llms-full.txt`: the whole reference. An agent writing code against the library reads this once
 * rather than fetching 123 pages, which is the entire point of the convention.
 */
function llmsFull(groups, stats) {
  const out = [];
  out.push(`# ${PKG.name} - full reference`);
  out.push('');
  out.push(`Version ${PKG.version}. ${stats.total} React components on the Redrob Group Design System 2026, plus ${stats.icons} icons.`);
  out.push('');
  out.push('## Using the package');
  out.push('');
  out.push('```tsx');
  out.push(`import { Button, Input, Table } from '${PKG.name}';`);
  for (const p of STYLE_SUBPATHS) out.push(`import '${PKG.name}/${p}';`);
  out.push('```');
  out.push('');
  out.push('- Every export is named and lives at the package root, and there is no default export. The only subpaths are the stylesheets, the fonts and the token files, all listed in the package\'s `exports` map.');
  out.push('- `tokens.css` before `styles.css`: the second reads the custom properties the first declares.');
  out.push(`- \`preflight.css\` is OPTIONAL and paints the page itself. Import it when this system owns the whole page; leave it out when mounting a component inside somebody else's page, because neither \`styles.css\` nor the design system's own bundle declares an \`html\` or \`body\` rule and overriding that is the host application's decision. Without it, \`data-theme="dark"\` darkens the components and leaves the page background browser-default white.`);
  out.push('- Every component is a function component taking one props object. None of them read global state.');
  out.push('- A prop marked required below has no default. A prop absent from a component\'s table does not exist on it, whatever a similar component accepts.');
  out.push(`- Fonts ship in the package and are reachable as \`${PKG.name}/fonts/<file>.woff2\`; \`tokens.css\` declares the \`@font-face\` rules that point at them.`);
  out.push(`- Not React? \`${PKG.name}/tokens.json\` carries every design token resolved to a literal for both themes, and \`${PKG.name}/native/redrob_tokens.h\` the same as C++ constants, for a surface that cannot evaluate CSS.`);
  out.push('');
  out.push('## Components');
  out.push('');
  for (const group of groups) {
    out.push(`### ${group.name}`);
    out.push('');
    for (const c of group.components) {
      out.push(`#### ${c.name}`);
      out.push('');
      if (c.description) {
        out.push(c.description.split(/\n\s*\n/).map((p) => p.replace(/\n/g, ' ')).join('\n\n'));
        out.push('');
      }
      out.push(`Import: \`import { ${c.name} } from '${PKG.name}';\``);
      out.push('');
      if (c.props.length) {
        out.push('| Prop | Type | Required | Notes |');
        out.push('| --- | --- | --- | --- |');
        for (const p of c.props) {
          const notes = (p.doc || '').replace(/\n/g, ' ').replace(/\|/g, '\\|');
          out.push(`| \`${p.name}\` | \`${p.type.replace(/\|/g, '\\|')}\` | ${p.optional ? 'no' : 'yes'} | ${notes} |`);
        }
        out.push('');
      } else {
        out.push('Declares no own props.');
        out.push('');
      }
      if (c.extends.length) {
        out.push(`Also accepts: ${c.extends.map((e) => `\`${e}\``).join(', ')}.`);
        out.push('');
      }
      if (c.types.length) {
        out.push(`Exported types: ${c.types.map((t) => `\`${t}\``).join(', ')}.`);
        out.push('');
      }
      if (c.also.length) {
        out.push(`Exported beside it: ${c.also.map((t) => `\`${t}\``).join(', ')}.`);
        out.push('');
      }
    }
  }
  out.push('## Icons');
  out.push('');
  out.push(`\`icons\` is a record of ${stats.icons} components keyed by name, each rendering at \`1em\` in \`currentColor\`. \`iconNames\` is the sorted list of keys and \`svg\` returns the raw markup for a name.`);
  out.push('');
  out.push('```tsx');
  out.push(`import { icons, iconNames } from '${PKG.name}';`);
  out.push('const Search = icons.search;');
  out.push('```');
  out.push('');
  return out.join('\n');
}

/* ---- the run ------------------------------------------------------------ */

function build({ check }) {
  const groups = readSurface().map((g) => ({
    name: g.name,
    components: g.components.map(readComponent),
  }));

  const ours = harness.loadOurs();
  let rendered = 0;
  for (const group of groups) {
    for (const component of group.components) {
      component.demo = renderDemo(component.name, ours);
      if (component.demo.markup) rendered++;
    }
  }

  const total = groups.reduce((n, g) => n + g.components.length, 0);
  const icons = Object.keys(ours.icons || {}).length;
  const stats = { total, rendered, icons };

  // Hosted at the project's Pages site; the links in llms.txt must be absolute to be followable.
  const base = 'https://redrob-labs.github.io/redrob-ui';
  const shortText = llmsShort(groups, stats, base);
  const fullText = llmsFull(groups, stats);

  if (check) {
    const problems = [];
    for (const [name, wanted] of [['llms.txt', shortText], ['llms-full.txt', fullText]]) {
      const file = path.join(ROOT, name);
      const found = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      if (found === null) problems.push(`${name} is missing`);
      else if (found !== wanted) problems.push(`${name} is stale`);
    }
    if (problems.length) {
      console.error(`docs are out of date: ${problems.join(', ')}. Run \`yarn docs\` and commit the result.`);
      process.exit(1);
    }
    console.log(`docs up to date - ${total} components, ${rendered} with a rendering`);
    return;
  }

  fs.rmSync(SITE, { recursive: true, force: true });
  fs.mkdirSync(path.join(SITE, 'components'), { recursive: true });
  fs.mkdirSync(path.join(SITE, 'demo'), { recursive: true });
  fs.mkdirSync(path.join(SITE, 'styles'), { recursive: true });
  fs.mkdirSync(path.join(SITE, 'fonts'), { recursive: true });

  for (const file of fs.readdirSync(path.join(SRC, 'styles'))) {
    fs.copyFileSync(path.join(SRC, 'styles', file), path.join(SITE, 'styles', file));
  }
  for (const file of fs.readdirSync(path.join(SRC, 'fonts'))) {
    fs.copyFileSync(path.join(SRC, 'fonts', file), path.join(SITE, 'fonts', file));
  }

  for (const group of groups) {
    for (const component of group.components) {
      fs.writeFileSync(
        path.join(SITE, 'components', `${component.name}.html`),
        componentPage(component, group.name)
      );
      if (component.demo.markup) {
        fs.writeFileSync(path.join(SITE, 'demo', `${component.name}.html`), demoPage(component.name, component.demo.markup));
      }
    }
  }

  fs.writeFileSync(path.join(SITE, 'index.html'), indexPage(groups, stats));
  // Both text files are served from the site root AND committed, so an agent reaching the repo
  // instead of the site finds the same bytes.
  fs.writeFileSync(path.join(SITE, 'llms.txt'), shortText);
  fs.writeFileSync(path.join(SITE, 'llms-full.txt'), fullText);
  fs.writeFileSync(path.join(ROOT, 'llms.txt'), shortText);
  fs.writeFileSync(path.join(ROOT, 'llms-full.txt'), fullText);
  // Pages would otherwise run the output through Jekyll, which drops files beginning with `_`.
  fs.writeFileSync(path.join(SITE, '.nojekyll'), '');

  const withoutDescription = groups.flatMap((g) => g.components.filter((c) => !c.description).map((c) => c.name));
  console.log(`site/ written - ${total} components in ${groups.length} groups, ${rendered} with a rendering, ${icons} icons`);
  if (withoutDescription.length) {
    console.log(`no description: ${withoutDescription.join(', ')}`);
  }
  const noDemo = groups.flatMap((g) => g.components.filter((c) => !c.demo.markup).map((c) => `${c.name} (${c.demo.reason})`));
  if (noDemo.length) console.log(`no rendering:\n  ${noDemo.join('\n  ')}`);
}

build({ check: process.argv.includes('--check') });
