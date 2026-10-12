/**
 * Writes every icon as a standalone SVG file under dist/native/icons/, for a consumer that cannot
 * run React -- Redrob Canvas is Qt/QML with no Node in its build, and it gets tokens the same way
 * (dist/native/redrob_tokens.h).
 *
 * The SVGs are rendered from the BUILT icon components with react-dom/server, not re-derived from
 * the bundle: one source of geometry, so a native surface cannot drift from the web one. Stroke stays
 * `currentColor`; a native consumer recolours from the token, never from the file (45-icons.md:
 * "Color from the token, never the icon").
 *
 * Sized 24x24 in pixels: a native SVG renderer (Qt SVG) does not resolve `1em`.
 *
 * Also writes dist/native/icons/manifest.json -- name -> sha256 -- so a vendoring repository can pin
 * the exact bytes the way it pins tokens.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'dist', 'native', 'icons');
const { icons } = require(path.join(ROOT, 'dist', 'index.js'));

fs.mkdirSync(OUT, { recursive: true });
const manifest = {};
for (const name of Object.keys(icons).sort()) {
  const markup = renderToStaticMarkup(
    icons[name]({ xmlns: 'http://www.w3.org/2000/svg', width: 24, height: 24 })
  );
  const file = `${markup}\n`;
  fs.writeFileSync(path.join(OUT, `${name}.svg`), file);
  manifest[name] = crypto.createHash('sha256').update(file).digest('hex');
}
fs.writeFileSync(
  path.join(OUT, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`
);
console.log(
  `wrote ${Object.keys(manifest).length} SVGs to ${path.relative(ROOT, OUT)}`
);
